import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { UserIdentity } from "convex/server";
import {
  canonicalPhone,
  phoneIsConfirmed,
  PHONE_PROOF_LIFETIME,
} from "../lib/contact-verification";

const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2026, 9, 24),
  phone = "+14155552671",
  otherPhone = "+442079460123";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", {
      clerkId: "tenant",
      role: "tenant",
      name: "Synthetic tenant",
      email: "qa@example.test",
      createdAt: now,
      phone,
      phoneVerified: true,
    });
    const owner = await ctx.db.insert("users", {
      clerkId: "owner",
      role: "landlord",
      name: "Synthetic owner",
      email: "owner@example.test",
      createdAt: now,
    });
    const request = await ctx.db.insert("housingRequests", {
      userId: user,
      city: "Austin",
      state: "TX",
      moveInDate: now + 60 * 86400000,
      duration: 1,
      maxBudget: 2000,
      bedrooms: 1,
      petFriendly: false,
      description: "Synthetic request",
      status: "open",
      createdAt: now,
      contactPreference: "phone",
      contactPhoneRevision: 0,
    });
    await ctx.db.insert("housingRequestDeliveries", {
      requestId: request,
      landlordId: owner,
      createdAt: now,
      emailStatus: "unconfigured",
    });
    return { user, owner, request };
  });
  const claims = {
    subject: "tenant",
    phoneNumber: phone,
    phoneNumberVerified: true,
    iat: now / 1000,
  };
  const tenant = t.withIdentity(claims),
    owner = t.withIdentity({ subject: "owner" });
  const shared = async () =>
    (
      await owner.query(api.housingRequests.inbox, {
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).page[0]?.phone ?? null;
  return { t, ids, claims, tenant, owner, shared };
}
it("normalizes formatting while requiring an explicit valid country code", () => {
  expect(canonicalPhone(" +1 (415) 555-2671 ")).toBe(phone);
  for (const value of [
    "4155552671",
    "+012345678",
    "+123",
    "+1234567890123456",
    "+1/4155552671",
    "tel:" + phone,
  ])
    expect(() => canonicalPhone(value)).toThrow();
});
it("ignores legacy flags and accepts only an exact signed verified number", async () => {
  const { tenant, shared } = await fixture();
  expect(
    (await tenant.query(api.users.getByClerkId, { clerkId: "tenant" }))
      ?.phoneVerified,
  ).toBe(false);
  expect(await shared()).toBeNull();
  const result = await tenant.mutation(api.users.confirmPhone, { phone });
  expect(result).toEqual({ phone, expiresAt: now + PHONE_PROOF_LIFETIME });
  expect(await shared()).toBe(phone);
});
it("rejects missing, false, string, mismatched and stale claims", async () => {
  const { t, claims } = await fixture();
  for (const proof of [
    { subject: "tenant" },
    { ...claims, phoneNumberVerified: false },
    { ...claims, phoneNumberVerified: "true" },
    { ...claims, phoneNumber: otherPhone },
    { ...claims, iat: now / 1000 - 121 },
    { ...claims, iat: now / 1000 + 6 },
    { ...claims, iat: "123" },
    { ...claims, phoneNumber: null },
  ])
    await expect(
      t
        .withIdentity(proof as unknown as Partial<UserIdentity>)
        .mutation(api.users.confirmPhone, { phone }),
    ).rejects.toThrow("not confirmed");
  await expect(t.mutation(api.users.confirmPhone, { phone })).rejects.toThrow(
    "sign in",
  );
  await expect(
    t
      .withIdentity({ ...claims, subject: "unknown" })
      .mutation(api.users.confirmPhone, { phone }),
  ).rejects.toThrow("profile");
});
it("does not let a new number inherit contact permission on an old request", async () => {
  const { t, ids, tenant, claims, shared } = await fixture();
  await tenant.mutation(api.users.confirmPhone, { phone });
  await tenant.mutation(api.users.updateProfile, {
    userId: ids.user,
    phone: otherPhone,
  });
  expect(await shared()).toBeNull();
  await expect(
    tenant.mutation(api.users.confirmPhone, { phone }),
  ).rejects.toThrow("not confirmed");
  vi.advanceTimersByTime(1000);
  await t
    .withIdentity({ ...claims, phoneNumber: otherPhone, iat: now / 1000 + 1 })
    .mutation(api.users.confirmPhone, { phone: otherPhone });
  expect(await shared()).toBeNull();
  const profile = await tenant.query(api.users.getByClerkId, {
    clerkId: "tenant",
  });
  expect(profile?.phone).toBe(otherPhone);
  expect(profile?.phoneVerified).toBe(true);
});
it("revokes existing consent and prevents immediate replay of an older signed token", async () => {
  const { t, ids, tenant, claims, shared } = await fixture();
  await tenant.mutation(api.users.confirmPhone, { phone });
  await tenant.mutation(api.users.revokePhone, {});
  expect(await shared()).toBeNull();
  await expect(
    tenant.mutation(api.users.confirmPhone, { phone }),
  ).rejects.toThrow("not confirmed");
  vi.advanceTimersByTime(1000);
  await t
    .withIdentity({ ...claims, iat: now / 1000 + 1 })
    .mutation(api.users.confirmPhone, { phone });
  expect(await shared()).toBeNull();
  expect((await t.run((ctx) => ctx.db.get(ids.user)))?.phoneRevision).toBe(1);
});
it("expires proof reactively and stale expiry jobs cannot revoke refreshed proof", async () => {
  const { t, ids, tenant, claims, shared } = await fixture();
  const first = await tenant.mutation(api.users.confirmPhone, { phone });
  vi.advanceTimersByTime(60000);
  const second = await t
    .withIdentity({ ...claims, iat: (now + 60000) / 1000 })
    .mutation(api.users.confirmPhone, { phone });
  vi.setSystemTime(first.expiresAt);
  await t.mutation(internal.users.expirePhone, {
    userId: ids.user,
    expiresAt: first.expiresAt,
  });
  expect(await shared()).toBe(phone);
  vi.setSystemTime(second.expiresAt);
  expect(await shared()).toBeNull();
  await t.mutation(internal.users.expirePhone, {
    userId: ids.user,
    expiresAt: second.expiresAt,
  });
  expect((await t.run((ctx) => ctx.db.get(ids.user)))?.phoneVerified).toBe(
    false,
  );
});
it("hides phone on legacy, closed and platform-only requests and blocks profile escalation", async () => {
  const { t, ids, tenant, owner, shared } = await fixture();
  await tenant.mutation(api.users.confirmPhone, { phone });
  for (const patch of [
    { contactPhoneRevision: undefined },
    { contactPhoneRevision: 0, status: "closed" as const },
    { status: "open" as const, contactPreference: "platform" as const },
  ]) {
    await t.run((ctx) => ctx.db.patch(ids.request, patch));
    expect(await shared()).toBeNull();
  }
  await expect(
    owner.mutation(api.users.updateProfile, {
      userId: ids.user,
      phone: otherPhone,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    tenant.mutation(api.users.updateProfile, {
      userId: ids.user,
      linkedinVerified: true,
    }),
  ).rejects.toThrow("provider connection");
  expect(
    await t.query(api.users.getPublicProfile, { userId: ids.user }),
  ).toBeNull();
  const publicProfile = await tenant.query(api.users.getPublicProfile, {
    userId: ids.user,
  });
  expect(publicProfile).not.toHaveProperty("phone");
  expect(publicProfile?.linkedinVerified).toBe(false);
});
it("preserves confirmation for unchanged formatted input and clears it on deletion", async () => {
  const { tenant, ids, shared } = await fixture();
  await tenant.mutation(api.users.confirmPhone, { phone });
  await tenant.mutation(api.users.updateProfile, {
    userId: ids.user,
    phone: "+1 (415) 555-2671",
    bio: "Updated biography",
  });
  expect(await shared()).toBe(phone);
  await tenant.mutation(api.users.updateProfile, {
    userId: ids.user,
    phone: "",
  });
  expect(await shared()).toBeNull();
});
it("rejects impossible stored proof windows", () => {
  const user = {
    phone,
    phoneVerified: true,
    phoneVerificationSource: "clerk",
    phoneVerificationMode: "test",
    phoneVerifiedAt: now,
    phoneVerificationExpiresAt: now + PHONE_PROOF_LIFETIME,
  };
  expect(phoneIsConfirmed(user)).toBe(true);
  expect(phoneIsConfirmed({ ...user, phoneVerifiedAt: now + 1 })).toBe(false);
  expect(
    phoneIsConfirmed({
      ...user,
      phoneVerificationExpiresAt: now + PHONE_PROOF_LIFETIME + 1,
    }),
  ).toBe(false);
});

it("separates test confirmation from production and rejects development issuers in production mode", async () => {
  const { t, claims, tenant, shared } = await fixture();
  await tenant.mutation(api.users.confirmPhone, { phone });
  expect(await shared()).toBe(phone);
  vi.stubEnv("CLERK_CONTACT_MODE", "prod");
  expect(await shared()).toBeNull();
  await expect(
    t
      .withIdentity({ ...claims, issuer: "https://qa.clerk.accounts.dev" })
      .mutation(api.users.confirmPhone, { phone }),
  ).rejects.toThrow("Development");
  await t
    .withIdentity({ ...claims, issuer: "https://auth.example.test" })
    .mutation(api.users.confirmPhone, { phone });
  expect(await shared()).toBe(phone);
  vi.stubEnv("CLERK_CONTACT_MODE", "invalid");
  await expect(
    tenant.mutation(api.users.confirmPhone, { phone }),
  ).rejects.toThrow("not configured");
});
