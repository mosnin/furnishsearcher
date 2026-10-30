import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2026, 9, 25),
  issuer = "https://synthetic.clerk.accounts.dev",
  phone = "+12015550147";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("CLERK_EMAIL_MODE", "test");
  vi.stubEnv("CLERK_CONTACT_MODE", "test");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "qa",
      role: "tenant",
      name: "Synthetic",
      email: "untrusted@example.test",
      createdAt: now,
    }),
  );
  // Harness stubs native authentication. Cryptographic acceptance needs the cloud check.
  const identity = {
    subject: "qa",
    issuer,
    email: "verified@example.test",
    emailVerified: true,
    phoneNumber: phone,
    phoneNumberVerified: true,
  };
  const client = t.withIdentity(identity);
  const request = (
    body: object,
    claims: object = {},
    actor = client,
    header?: string,
  ) => {
    const jwt = `e30.${Buffer.from(JSON.stringify({ sub: "qa", iss: issuer, aud: "convex", iat: now / 1000, ...claims })).toString("base64url")}.c2ln`;
    return actor.fetch("/contacts/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: header ?? `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    });
  };
  return { t, client, identity, request };
}
it("confirms email when native identity omits reserved iat", async () => {
  const f = await fixture();
  expect((await f.request({ kind: "email", clerkId: "qa" })).status).toBe(200);
  expect(await f.client.query(api.emailContacts.settings, {})).toMatchObject({
    confirmed: true,
    email: "verified@example.test",
  });
});
it("confirms provider-verified phone through the same authenticated bridge", async () => {
  const f = await fixture();
  const response = await f.request({ kind: "phone", clerkId: "qa", phone });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ phone });
});
it("rejects absent authentication and mismatched header identities or audiences", async () => {
  const f = await fixture();
  for (const claims of [
    { sub: "other" },
    { iss: "https://other.example" },
    { aud: "other" },
    { iat: "123" },
  ])
    expect(
      (await f.request({ kind: "email", clerkId: "qa" }, claims)).status,
    ).toBe(401);
  expect(
    (await f.request({ kind: "email", clerkId: "qa" }, {}, f.t)).status,
  ).toBe(401);
  expect(
    (
      await f.request(
        { kind: "email", clerkId: "qa" },
        {},
        f.client,
        "Bearer malformed",
      )
    ).status,
  ).toBe(401);
});
it("rejects stale, future and revoked issuance without trusting body timestamps", async () => {
  const f = await fixture(),
    body = { kind: "email", clerkId: "qa" };
  for (const iat of [now / 1000 - 121, now / 1000 + 1])
    expect((await f.request(body, { iat })).status).toBe(409);
  expect((await f.request({ ...body, issuedAt: now / 1000 })).status).toBe(400);
  await f.client.mutation(api.emailContacts.setMessageEmails, {
    clerkId: "qa",
    enabled: false,
  });
  expect((await f.request(body)).status).toBe(409);
  vi.setSystemTime(now + 1000);
  expect((await f.request(body, { iat: now / 1000 + 1 })).status).toBe(200);
});
it("rejects account switches, unverified contacts, and oversized bodies", async () => {
  const f = await fixture();
  expect((await f.request({ kind: "email", clerkId: "other" })).status).toBe(
    409,
  );
  const unverified = f.t.withIdentity({
    ...f.identity,
    emailVerified: false,
    phoneNumberVerified: false,
  });
  expect(
    (await f.request({ kind: "email", clerkId: "qa" }, {}, unverified)).status,
  ).toBe(409);
  expect(
    (await f.request({ kind: "phone", clerkId: "qa", phone }, {}, unverified))
      .status,
  ).toBe(409);
  expect(
    (await f.request({ kind: "email", clerkId: "x".repeat(5000) })).status,
  ).toBe(400);
});
