import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { UserIdentity } from "convex/server";
import { canonicalEmail, EMAIL_PROOF_LIFETIME } from "../lib/email-contact";
const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2026, 9, 24);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("CLERK_EMAIL_MODE", "test");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkId: "owner",
      name: "Owner",
      role: "landlord",
      email: "untrusted-profile@example.test",
      createdAt: now,
    });
    const tenant = await ctx.db.insert("users", {
      clerkId: "tenant",
      name: "Tenant",
      role: "tenant",
      email: "tenant@example.test",
      createdAt: now,
    });
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Synthetic home",
      description: "Fixture",
      address: "Private street",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 1900,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "House",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: now,
      minStay: 1,
      status: "inactive",
      createdAt: now,
      views: 0,
    });
    const conv = await ctx.db.insert("conversations", {
      listingId: listing,
      tenantId: tenant,
      landlordId: owner,
      lastMessage: "Private preview",
      lastMessageAt: now,
      tenantRead: true,
      landlordRead: false,
    });
    const message = await ctx.db.insert("messages", {
      listingId: listing,
      senderId: tenant,
      receiverId: owner,
      conversationId: "legacy-key",
      conversationDocId: conv,
      content: "Private preview",
      read: false,
      createdAt: now,
      emailStatus: "pending",
    });
    return { owner, tenant, listing, conv, message };
  });
  const owner = t.withIdentity({ subject: "owner" });
  const claims = {
    subject: "owner",
    email: "Verified@Example.Test",
    emailVerified: true,
    iat: now / 1000,
  };
  const verified = t.withIdentity(claims);
  const details = () =>
    t.query(internal.messages.notificationDetails, { messageId: ids.message });
  return { t, ids, owner, verified, claims, details };
}

it("accepts only one plain mailbox and rejects header injection", () => {
  expect(canonicalEmail(" Verified+Inbox@Example.Test ")).toBe(
    "verified+inbox@example.test",
  );
  for (const s of [
    "a@x.test\r\nBcc: victim@example.test",
    "Name <a@x.test>",
    "a@x.test,b@x.test",
    ".a@x.test",
    "a..b@x.test",
    "a.@x.test",
    "a@localhost",
    "a".repeat(65) + "@x.test",
  ])
    expect(() => canonicalEmail(s)).toThrow();
});
it("keeps legacy profile email and arbitrary client email outside notification authority", async () => {
  const { t, owner, verified, claims, details } = await fixture();
  expect(await owner.query(api.emailContacts.settings, {})).toMatchObject({
    enabled: false,
    confirmed: false,
    email: null,
  });
  expect(await details()).toMatchObject({ suppressed: true, email: "" });
  await verified.mutation(api.emailContacts.setMessageEmails, {
    clerkId: "owner",
    enabled: true,
  });
  await owner.mutation(api.users.getOrCreate, {
    clerkId: "owner",
    name: "Owner",
    email: "forged@example.test",
  });
  expect(await details()).toMatchObject({
    suppressed: false,
    email: "verified@example.test",
  });
  for (const proof of [
    { ...claims, emailVerified: false },
    { ...claims, emailVerified: "true" },
    { ...claims, email: undefined },
    { ...claims, iat: now / 1000 - 121 },
    { ...claims, iat: now / 1000 + 1 },
    { ...claims, iat: undefined },
  ])
    await expect(
      t
        .withIdentity(proof as unknown as Partial<UserIdentity>)
        .mutation(api.emailContacts.setMessageEmails, {
          clerkId: "owner",
          enabled: true,
        }),
    ).rejects.toThrow();
});
it("isolates settings, suppresses disabled and expired bindings, and fences old expiry jobs", async () => {
  const { t, ids, owner, verified, details } = await fixture();
  await expect(t.query(api.emailContacts.settings, {})).rejects.toThrow(
    "sign in",
  );
  await verified.mutation(api.emailContacts.setMessageEmails, {
    clerkId: "owner",
    enabled: true,
  });
  const tenant = t.withIdentity({ subject: "tenant" });
  await expect(
    tenant.mutation(api.emailContacts.setMessageEmails, {
      clerkId: "owner",
      enabled: false,
    }),
  ).rejects.toThrow("account changed");
  expect(await tenant.query(api.emailContacts.settings, {})).toMatchObject({
    email: null,
    enabled: false,
  });
  vi.setSystemTime(now + 10000);
  await t
    .withIdentity({
      subject: "owner",
      email: "new@example.test",
      emailVerified: true,
      iat: (now + 10000) / 1000,
    })
    .mutation(api.emailContacts.setMessageEmails, {
      clerkId: "owner",
      enabled: true,
    });
  vi.setSystemTime(now + EMAIL_PROOF_LIFETIME);
  await t.mutation(internal.emailContacts.expire, {
    userId: ids.owner,
    expiresAt: now + EMAIL_PROOF_LIFETIME,
  });
  expect(await details()).toMatchObject({
    suppressed: false,
    email: "new@example.test",
  });
  vi.setSystemTime(now + EMAIL_PROOF_LIFETIME + 10000);
  expect(await details()).toMatchObject({ suppressed: true });
  await t.mutation(internal.emailContacts.expire, {
    userId: ids.owner,
    expiresAt: now + EMAIL_PROOF_LIFETIME + 10000,
  });
  expect((await owner.query(api.emailContacts.settings, {})).confirmed).toBe(
    false,
  );
});
it("honors opt-out for pending and legacy jobs and rejects pre-revocation tokens", async () => {
  const { t, ids, owner, verified, details } = await fixture();
  await verified.mutation(api.emailContacts.setMessageEmails, {
    clerkId: "owner",
    enabled: true,
  });
  expect(
    await t.query(internal.messages.legacyNotificationConversation, {
      conversationId: ids.conv,
      email: "verified@example.test",
    }),
  ).toBe(ids.conv);
  expect(
    await t.query(internal.messages.legacyNotificationConversation, {
      conversationId: ids.conv,
      email: "untrusted-profile@example.test",
    }),
  ).toBeNull();
  await owner.mutation(api.emailContacts.setMessageEmails, {
    clerkId: "owner",
    enabled: false,
  });
  expect(await details()).toMatchObject({ suppressed: true, email: "" });
  expect(
    await t.query(internal.messages.legacyNotificationConversation, {
      conversationId: ids.conv,
      email: "verified@example.test",
    }),
  ).toBeNull();
  await expect(
    verified.mutation(api.emailContacts.setMessageEmails, {
      clerkId: "owner",
      enabled: true,
    }),
  ).rejects.toThrow();
  vi.setSystemTime(now + 1000);
  await t
    .withIdentity({
      subject: "owner",
      email: "verified@example.test",
      emailVerified: true,
      iat: now / 1000 + 1,
    })
    .mutation(api.emailContacts.setMessageEmails, {
      clerkId: "owner",
      enabled: true,
    });
  expect(await details()).toMatchObject({ suppressed: false });
});
it("separates production claims from development confirmations", async () => {
  const { t, verified, claims, details } = await fixture();
  await verified.mutation(api.emailContacts.setMessageEmails, {
    clerkId: "owner",
    enabled: true,
  });
  vi.stubEnv("CLERK_EMAIL_MODE", "prod");
  expect(await details()).toMatchObject({ suppressed: true });
  await expect(
    t
      .withIdentity({
        ...claims,
        issuer: "https://synthetic.clerk.accounts.dev",
      })
      .mutation(api.emailContacts.setMessageEmails, {
        clerkId: "owner",
        enabled: true,
      }),
  ).rejects.toThrow("Development");
  await t
    .withIdentity({ ...claims, issuer: "https://auth.example.test" })
    .mutation(api.emailContacts.setMessageEmails, {
      clerkId: "owner",
      enabled: true,
    });
  expect(await details()).toMatchObject({ suppressed: false });
});
it("still enforces block and participant guards after email confirmation", async () => {
  const { t, ids, owner, verified, details } = await fixture();
  await verified.mutation(api.emailContacts.setMessageEmails, {
    clerkId: "owner",
    enabled: true,
  });
  await owner.mutation(api.messages.setBlocked, {
    conversationId: ids.conv,
    blocked: true,
  });
  expect(await details()).toMatchObject({ suppressed: true });
  await owner.mutation(api.messages.setBlocked, {
    conversationId: ids.conv,
    blocked: false,
  });
  await t.run((ctx) => ctx.db.patch(ids.message, { senderId: ids.owner }));
  expect(await details()).toBeNull();
});
