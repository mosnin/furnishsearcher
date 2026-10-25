import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { contactHash } from "../lib/clerk-contact-event";
const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2026, 9, 25),
  DAY = 86400000,
  phone = "+14155552671",
  email = "owner@example.test",
  instance = "ins_synthetic",
  secret =
    "whsec_" +
    Buffer.from("synthetic-clerk-contact-secret-32!").toString("base64");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  for (const [key, value] of Object.entries({
    CLERK_CONTACT_WEBHOOK_SECRET: secret,
    CLERK_CONTACT_WEBHOOK_INSTANCE_ID: instance,
    CLERK_CONTACT_WEBHOOK_MODE: "test",
    CLERK_EMAIL_MODE: "test",
    CLERK_CONTACT_MODE: "test",
    RESEND_API_KEY: "",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function event(
  overrides: Record<string, unknown> = {},
  data: Record<string, unknown> = {},
) {
  return {
    object: "event",
    instance_id: instance,
    type: "user.updated",
    timestamp: Date.now(),
    data: {
      object: "user",
      id: "user_fixture",
      updated_at: Date.now(),
      primary_email_address_id: "idn_email",
      email_addresses: [
        {
          id: "idn_email",
          email_address: email,
          verification: { status: "verified" },
        },
      ],
      primary_phone_number_id: "idn_phone",
      phone_numbers: [
        {
          id: "idn_phone",
          phone_number: phone,
          verification: { status: "verified" },
        },
      ],
      ...data,
    },
    ...overrides,
  };
}
async function fixture() {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "user_fixture",
      name: "Synthetic owner",
      email: "profile@example.test",
      role: "landlord",
      createdAt: now,
      phone,
      phoneVerified: true,
      phoneVerificationSource: "clerk",
      phoneVerificationMode: "test",
      phoneVerifiedAt: now,
      phoneVerificationExpiresAt: now + 30 * DAY,
      phoneRevision: 3,
      listingPhoneConsent: { revision: 3, expiresAt: now + 30 * DAY },
      messageEmailsEnabled: true,
      notificationEmail: email,
      notificationEmailMode: "test",
      notificationEmailVerifiedAt: now,
      notificationEmailExpiresAt: now + 30 * DAY,
      notificationEmailRevision: 2,
      housingLeadEmailsEnabled: true,
    }),
  );
  async function post(
    value: unknown,
    options: { id?: string; timestamp?: number; signature?: string } = {},
  ) {
    const body = typeof value === "string" ? value : JSON.stringify(value),
      id = options.id ?? "msg_synthetic",
      timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
    const signature =
      options.signature ??
      "v1," +
        createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
          .update(`${id}.${timestamp}.${body}`)
          .digest("base64");
    return t.fetch("/webhooks/clerk-contacts", {
      method: "POST",
      headers: {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      },
      body,
    });
  }
  const owner = t.withIdentity({ subject: "user_fixture" });
  const claims = (extra = {}) =>
    t.withIdentity({
      subject: "user_fixture",
      issuer: "https://synthetic.clerk.accounts.dev",
      email,
      emailVerified: true,
      phoneNumber: phone,
      phoneNumberVerified: true,
      iat: Math.floor(Date.now() / 1000),
      ...extra,
    });
  return {
    t,
    id,
    owner,
    post,
    claims,
    read: () => t.run((ctx) => ctx.db.get(id)),
    snapshot: () =>
      t.run((ctx) => ctx.db.query("clerkContactSnapshots").unique()),
  };
}
it("preserves unchanged current confirmation, consent and expiry without automatically granting new proof", async () => {
  const f = await fixture(),
    before = await f.read();
  expect((await f.post(event())).status).toBe(200);
  expect(await f.read()).toEqual(before);
  const snapshot = (await f.snapshot())!;
  expect(snapshot.emailHash).toBe(await contactHash(email));
  expect(snapshot.phoneHash).toBe(await contactHash(phone));
  expect(JSON.stringify(snapshot)).not.toContain(email);
  expect(JSON.stringify(snapshot)).not.toContain(phone);
  await f.owner.mutation(api.users.revokePhone, {});
  vi.setSystemTime(now + 2000);
  expect((await f.post(event())).status).toBe(200);
  expect((await f.read())?.phoneVerified).toBe(false);
});
it("revokes only changed email and refuses freshly issued stale claims, then requires explicit new confirmation", async () => {
  const f = await fixture();
  expect(
    (
      await f.post(
        event(
          {},
          {
            email_addresses: [
              {
                id: "idn_email",
                email_address: "new@example.test",
                verification: { status: "verified" },
              },
            ],
          },
        ),
      )
    ).status,
  ).toBe(200);
  expect(await f.read()).toMatchObject({
    messageEmailsEnabled: false,
    phoneVerified: true,
    phoneRevision: 3,
    housingLeadEmailsEnabled: true,
  });
  expect((await f.read())?.notificationEmail).toBeUndefined();
  expect((await f.owner.query(api.emailContacts.settings, {})).confirmed).toBe(
    false,
  );
  vi.setSystemTime(now + 2000);
  await expect(
    f.claims().mutation(api.emailContacts.setMessageEmails, {
      clerkId: "user_fixture",
      enabled: true,
    }),
  ).rejects.toThrow("contact changed");
  await f
    .claims({ email: "new@example.test" })
    .mutation(api.emailContacts.setMessageEmails, {
      clerkId: "user_fixture",
      enabled: true,
    });
  expect((await f.owner.query(api.emailContacts.settings, {})).email).toBe(
    "new@example.test",
  );
});
it("revokes changed phone and sharing consent, and reconfirming does not restore old listing consent", async () => {
  const f = await fixture();
  expect((await f.owner.query(api.phoneContacts.settings, {})).enabled).toBe(
    true,
  );
  const changed = "+442079460123";
  expect(
    (
      await f.post(
        event(
          {},
          {
            phone_numbers: [
              {
                id: "idn_phone",
                phone_number: changed,
                verification: { status: "verified" },
              },
            ],
          },
        ),
      )
    ).status,
  ).toBe(200);
  expect(await f.read()).toMatchObject({
    phone,
    phoneVerified: false,
    phoneRevision: 4,
    notificationEmail: email,
    messageEmailsEnabled: true,
  });
  expect((await f.read())?.listingPhoneConsent).toBeUndefined();
  expect((await f.owner.query(api.phoneContacts.settings, {})).enabled).toBe(
    false,
  );
  vi.setSystemTime(now + 2000);
  await expect(
    f.claims().mutation(api.users.confirmPhone, { phone }),
  ).rejects.toThrow("contact changed");
  await f
    .claims({ phoneNumber: changed })
    .mutation(api.users.confirmPhone, { phone: changed });
  expect((await f.read())?.phoneVerified).toBe(true);
  expect((await f.owner.query(api.phoneContacts.settings, {})).enabled).toBe(
    false,
  );
  await f.owner.mutation(api.phoneContacts.setEnabled, { enabled: true });
  expect((await f.owner.query(api.phoneContacts.settings, {})).enabled).toBe(
    true,
  );
});
it.each(["missing", "unverified", "null-verification"])(
  "revokes removed or unverified contacts (%s)",
  async (kind) => {
    const f = await fixture();
    const values =
      kind === "missing"
        ? {
            primary_email_address_id: null,
            primary_phone_number_id: null,
            email_addresses: [],
            phone_numbers: [],
          }
        : {
            email_addresses: [
              {
                id: "idn_email",
                email_address: email,
                verification:
                  kind === "null-verification"
                    ? null
                    : { status: "unverified" },
              },
            ],
            phone_numbers: [
              {
                id: "idn_phone",
                phone_number: phone,
                verification:
                  kind === "null-verification"
                    ? null
                    : { status: "unverified" },
              },
            ],
          };
    expect((await f.post(event({}, values))).status).toBe(200);
    expect(await f.read()).toMatchObject({
      phoneVerified: false,
      messageEmailsEnabled: false,
    });
    vi.setSystemTime(now + 2000);
    await expect(
      f.claims().mutation(api.users.confirmPhone, { phone }),
    ).rejects.toThrow("contact changed");
    await expect(
      f.claims().mutation(api.emailContacts.setMessageEmails, {
        clerkId: "user_fixture",
        enabled: true,
      }),
    ).rejects.toThrow("contact changed");
  },
);
it("deduplicates concurrent deliveries and ignores stale snapshots including later event time with older object time", async () => {
  const f = await fixture(),
    body = event({}, { primary_phone_number_id: null, phone_numbers: [] });
  expect(
    (await Promise.all([f.post(body), f.post(body)])).map((r) => r.status),
  ).toEqual([200, 200]);
  const after = await f.read();
  expect(after?.phoneRevision).toBe(4);
  vi.setSystemTime(now + 5000);
  expect(
    (await f.post(event({ timestamp: now - 1 }, { updated_at: now - 1 })))
      .status,
  ).toBe(200);
  expect(
    (await f.post(event({ timestamp: now + 3000 }, { updated_at: now - 1 })))
      .status,
  ).toBe(200);
  expect(await f.read()).toEqual(after);
});
it("fails closed on contradictory same-time snapshots and resolves only with a strictly newer snapshot", async () => {
  const f = await fixture();
  await f.post(event());
  await f.post(event({}, { primary_phone_number_id: null, phone_numbers: [] }));
  expect((await f.snapshot())?.uncertain).toBe(true);
  expect((await f.read())?.notificationEmail).toBeUndefined();
  const revoked = await f.read();
  await f.post(event());
  expect((await f.snapshot())?.uncertain).toBe(true);
  expect(await f.read()).toEqual(revoked);
  vi.setSystemTime(now + 2000);
  await f.post(event());
  expect((await f.snapshot())?.uncertain).toBe(false);
  vi.setSystemTime(now + 4000);
  await f.claims().mutation(api.users.confirmPhone, { phone });
  expect((await f.read())?.phoneVerified).toBe(true);
  expect((await f.read())?.listingPhoneConsent).toBeUndefined();
});
it("treats deletion as a permanent contact tombstone without deleting rental/profile history", async () => {
  const f = await fixture();
  await f.post(event());
  expect(
    (
      await f.post(
        event({
          type: "user.deleted",
          timestamp: now - 1,
          data: { id: "user_fixture", deleted: true },
        }),
      )
    ).status,
  ).toBe(200);
  const after = await f.read();
  expect(after).toMatchObject({
    name: "Synthetic owner",
    role: "landlord",
    phoneVerified: false,
    messageEmailsEnabled: false,
  });
  vi.setSystemTime(now + 4000);
  await f.post(event());
  expect(await f.read()).toEqual(after);
  await expect(
    f.claims().mutation(api.users.confirmPhone, { phone }),
  ).rejects.toThrow("contact changed");
  await expect(
    f.claims().mutation(api.emailContacts.setMessageEmails, {
      clerkId: "user_fixture",
      enabled: true,
    }),
  ).rejects.toThrow("contact changed");
});
it("stores contact authority before native onboarding but never trusts provider metadata for app roles or automatically creates a profile", async () => {
  const f = await fixture();
  await f.post(
    event(
      {},
      {
        id: "user_new",
        public_metadata: { role: "admin" },
        unsafe_metadata: { role: "admin" },
      },
    ),
  );
  expect(await f.t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(
    1,
  );
  vi.setSystemTime(now + 2000);
  const fresh = f.t.withIdentity({
    subject: "user_new",
    issuer: "https://synthetic.clerk.accounts.dev",
    email: "wrong@example.test",
    emailVerified: true,
    iat: Date.now() / 1000,
  });
  const created = await fresh.mutation(api.users.getOrCreate, {
    clerkId: "user_new",
    name: "Synthetic new account",
    email: "wrong@example.test",
  });
  expect(created?.role).toBe("tenant");
  await expect(
    fresh.mutation(api.emailContacts.setMessageEmails, {
      clerkId: "user_new",
      enabled: true,
    }),
  ).rejects.toThrow("contact changed");
});
it("rejects missing configuration, invalid signatures and old delivery signatures without mutations", async () => {
  const f = await fixture(),
    before = await f.read();
  vi.stubEnv("CLERK_CONTACT_WEBHOOK_SECRET", "");
  expect((await f.post(event())).status).toBe(503);
  vi.stubEnv("CLERK_CONTACT_WEBHOOK_SECRET", secret);
  expect((await f.post(event(), { signature: "v1,invalid" })).status).toBe(401);
  expect((await f.post(event(), { timestamp: now / 1000 - 301 })).status).toBe(
    401,
  );
  expect(await f.read()).toEqual(before);
  expect(await f.snapshot()).toBeNull();
});
it("rejects wrong instances, malformed or oversized data and future events; ignores unrelated signed events", async () => {
  const f = await fixture();
  expect((await f.post(event({ instance_id: "ins_other" }))).status).toBe(400);
  expect(
    (await f.post(event({}, { primary_phone_number_id: "idn_absent" }))).status,
  ).toBe(400);
  expect((await f.post(event({}, { email_addresses: undefined }))).status).toBe(
    400,
  );
  expect((await f.post(event({ timestamp: now + 61_000 }))).status).toBe(400);
  expect((await f.post("{")).status).toBe(400);
  expect((await f.post("x".repeat(256 * 1024 + 1))).status).toBe(413);
  expect((await f.post(event({ type: "session.ended" }))).status).toBe(204);
  expect(await f.snapshot()).toBeNull();
});
it("requires explicit environment alignment and does not apply test events to production contact proof", async () => {
  const f = await fixture();
  vi.stubEnv("CLERK_CONTACT_WEBHOOK_MODE", "prod");
  expect((await f.post(event())).status).toBe(503);
  vi.stubEnv("CLERK_CONTACT_MODE", "prod");
  expect((await f.post(event())).status).toBe(503);
  expect(await f.snapshot()).toBeNull();
  expect((await f.read())?.phoneVerified).toBe(true);
});
