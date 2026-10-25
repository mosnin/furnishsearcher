import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { MAX_PROFILE_IMAGE_BYTES } from "../convex/profileImages";
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 24);
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAXkAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const make = (clerkId: string, role: "landlord" | "tenant") =>
      ctx.db.insert("users", {
        clerkId,
        role,
        name: clerkId,
        email: clerkId + "@example.test",
        createdAt: now,
        avatar: "https://example.test/account-avatar.png",
      });
    const owner = await make("owner", "landlord"),
      tenant = await make("tenant", "tenant"),
      other = await make("other", "landlord");
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Synthetic hidden property",
      description: "QA only",
      address: "Private",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 1000,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "House",
      amenities: [],
      photos: [],
      petFriendly: true,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: now,
      minStay: 1,
      status: "inactive",
      views: 0,
      createdAt: now,
    });
    const conversation = await ctx.db.insert("conversations", {
      listingId: listing,
      tenantId: tenant,
      landlordId: owner,
      lastMessage: "Synthetic",
      lastMessageAt: now,
      tenantRead: true,
      landlordRead: true,
    });
    return { owner, tenant, other, listing, conversation };
  });
  const owner = t.withIdentity({ subject: "owner" }),
    tenant = t.withIdentity({ subject: "tenant" }),
    other = t.withIdentity({ subject: "other" });
  const upload = (
    client = owner,
    kind = "profile",
    revision = 0,
    requestId = crypto.randomUUID(),
    body: Uint8Array = png,
  ) =>
    client.fetch(
      `/profile-images/upload?kind=${kind}&revision=${revision}&requestId=${requestId}`,
      {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: new Blob([new Uint8Array(body)], { type: "image/png" }),
      },
    );
  const state = () => owner.query(api.profileImages.mine, {});
  const raw = () => t.run((ctx) => ctx.db.get(ids.owner));
  return { t, ids, owner, tenant, other, upload, state, raw };
}
it("requires authentication, a profile, bounded metadata and matching image signatures", async () => {
  const { t, owner, upload } = await fixture();
  expect((await upload(t)).status).toBe(401);
  expect((await upload(t.withIdentity({ subject: "missing" }))).status).toBe(
    409,
  );
  expect((await upload(owner, "other")).status).toBe(400);
  expect((await upload(owner, "profile", -1)).status).toBe(400);
  expect((await upload(owner, "profile", 0, "short")).status).toBe(409);
  expect(
    (await upload(owner, "profile", 0, crypto.randomUUID(), new Uint8Array()))
      .status,
  ).toBe(400);
  expect(
    (
      await upload(
        owner,
        "profile",
        0,
        crypto.randomUUID(),
        new TextEncoder().encode("<svg/>"),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await owner.fetch(
        "/profile-images/upload?kind=profile&revision=0&requestId=synthetic-request-1",
        {
          method: "POST",
          headers: { "Content-Type": "image/svg+xml" },
          body: "<svg/>",
        },
      )
    ).status,
  ).toBe(415);
});
it("rejects excessive streamed and declared sizes before committing a file", async () => {
  const { owner, upload, raw } = await fixture();
  expect(
    (
      await upload(
        owner,
        "profile",
        0,
        crypto.randomUUID(),
        new Uint8Array(MAX_PROFILE_IMAGE_BYTES),
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await owner.fetch(
        "/profile-images/upload?kind=profile&revision=0&requestId=synthetic-request-1",
        {
          method: "POST",
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(MAX_PROFILE_IMAGE_BYTES),
          },
          body: png,
        },
      )
    ).status,
  ).toBe(413);
  expect((await raw())?.profilePhotoStorageId).toBeUndefined();
});
it("persists canonical profile and pet sources across fresh reads and contact projections", async () => {
  const { owner, tenant, ids, upload, state } = await fixture();
  const response = await upload();
  expect(response.status).toBe(200);
  const saved = await response.json();
  expect(saved.applied).toBe(true);
  expect(saved.revision).toBe(1);
  const pet = await upload(owner, "pet");
  expect(pet.status).toBe(200);
  const image = await state();
  expect(image.profile.url).toBe(saved.url);
  expect(image.pet.url).toBeTruthy();
  const self = await owner.query(api.users.getByClerkId, { clerkId: "owner" });
  expect(self?.profilePhoto).toBe(saved.url);
  expect(self?.petPhoto).toBe(image.pet.url);
  const publicProfile = await tenant.query(api.users.getPublicProfile, {
    userId: ids.owner,
  });
  expect(publicProfile?.profilePhoto).toBe(saved.url);
  expect(publicProfile).not.toHaveProperty("profilePhotoStorageId");
  expect(
    (await owner.query(api.listings.getById, { id: ids.listing }))?.landlord
      ?.avatar,
  ).toBe(saved.url);
  expect(
    (
      await tenant.query(api.messages.getConversations, { userId: ids.tenant })
    )[0].otherUser?.avatar,
  ).toBe(saved.url);
});
it("replaces and removes only the current kind, deletes old files and allows safe remove retries", async () => {
  const { t, owner, upload, state, raw } = await fixture();
  await upload();
  await upload(owner, "pet");
  const old = (await raw())!.profilePhotoStorageId!,
    pet = (await raw())!.petPhotoStorageId!;
  expect((await upload(owner, "profile", 1)).status).toBe(200);
  expect(await t.run((ctx) => ctx.db.system.get(old))).toBeNull();
  expect(await t.run((ctx) => ctx.db.system.get(pet))).not.toBeNull();
  const current = (await raw())!.profilePhotoStorageId!;
  await owner.mutation(api.profileImages.remove, {
    kind: "profile",
    expectedRevision: 2,
  });
  await owner.mutation(api.profileImages.remove, {
    kind: "profile",
    expectedRevision: 2,
  });
  expect((await state()).profile).toEqual({ url: null, revision: 3 });
  expect((await state()).pet.url).toBeTruthy();
  expect(await t.run((ctx) => ctx.db.system.get(current))).toBeNull();
});
it("deduplicates retries and rejects changed-body or changed-kind reuse without leaking candidate files", async () => {
  const { t, owner, upload, state } = await fixture();
  const requestId = crypto.randomUUID();
  const first = await upload(owner, "profile", 0, requestId);
  expect(first.status).toBe(200);
  const original = await first.json();
  const second = await upload(owner, "profile", 0, requestId);
  expect(second.status).toBe(200);
  expect(await second.json()).toMatchObject({
    duplicate: true,
    url: original.url,
    revision: 1,
  });
  const changed = new Uint8Array(png.length + 1);
  changed.set(png);
  expect((await upload(owner, "profile", 0, requestId, changed)).status).toBe(
    409,
  );
  expect((await upload(owner, "pet", 0, requestId)).status).toBe(409);
  expect((await state()).pet.revision).toBe(0);
  expect(
    await t.run(
      async (ctx) => (await ctx.db.system.query("_storage").take(100)).length,
    ),
  ).toBe(1);
});
it("never restores an old photo through retry or stale edit/removal", async () => {
  const { owner, upload, state } = await fixture();
  const requestId = crypto.randomUUID();
  await upload(owner, "profile", 0, requestId);
  await upload(owner, "profile", 1);
  const current = (await state()).profile;
  const retry = await upload(owner, "profile", 0, requestId);
  expect(await retry.json()).toMatchObject({
    url: current.url,
    revision: 2,
    applied: false,
    duplicate: true,
  });
  expect((await upload(owner, "profile", 0)).status).toBe(409);
  await expect(
    owner.mutation(api.profileImages.remove, {
      kind: "profile",
      expectedRevision: 1,
    }),
  ).rejects.toThrow("changed elsewhere");
  expect((await state()).profile).toEqual(current);
});
it("cannot attach arbitrary URLs or another account's image through profile or listing fields", async () => {
  const { owner, other, ids, upload, raw, t } = await fixture();
  await upload();
  const storageId = (await raw())!.profilePhotoStorageId!;
  await expect(
    owner.mutation(api.users.updateProfile, {
      userId: ids.owner,
      profilePhoto: "https://example.test/new.png",
    }),
  ).rejects.toThrow("photo editor");
  await expect(
    owner.mutation(api.users.updateProfile, {
      userId: ids.owner,
      petPhoto: "https://example.test/new.png",
    }),
  ).rejects.toThrow("photo editor");
  expect(await other.mutation(api.files.getUrl, { storageId })).toBeNull();
  expect(await owner.mutation(api.files.getUrl, { storageId })).toBeNull();
  await expect(
    other.mutation(api.users.updateProfile, {
      userId: ids.owner,
      profilePhoto: "",
    }),
  ).rejects.toThrow("Not authorized");
  // Internal interrupted-action cleanup cannot destroy an already attached file.
  await owner.mutation(internal.profileImages.discardUncommitted, {
    storageId,
  });
  expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
});
it("keeps traveler profile details behind established-counterparty access", async () => {
  const { t, owner, other, tenant, ids, upload } = await fixture();
  await upload(tenant);
  await upload(tenant, "pet");
  await tenant.mutation(api.users.updateProfile, {
    userId: ids.tenant,
    bio: "Synthetic traveler",
    petInfo: "Synthetic pet",
  });
  expect(
    await t.query(api.users.getPublicProfile, { userId: ids.tenant }),
  ).toBeNull();
  expect(
    await other.query(api.users.getPublicProfile, { userId: ids.tenant }),
  ).toBeNull();
  expect(
    await other.query(api.reviews.travelerProfile, { id: ids.tenant }),
  ).toBeNull();
  const visible = await owner.query(api.reviews.travelerProfile, {
    id: ids.tenant,
  });
  expect(visible?.petInfo).toBe("Synthetic pet");
  expect(visible?.profilePhoto).toBeTruthy();
  expect(visible?.petPhoto).toBeTruthy();
  expect(visible).not.toHaveProperty("email");
  expect(visible).not.toHaveProperty("petPhotoStorageId");
});
it("retains only safe legacy image links until replaced and suppresses account-avatar fallback after removal", async () => {
  const { t, owner, ids, state, upload } = await fixture();
  expect((await state()).profile.url).toBe(
    "https://example.test/account-avatar.png",
  );
  await t.run((ctx) =>
    ctx.db.patch(ids.owner, {
      profilePhoto: "javascript:alert(1)",
      petPhoto: "https://user:password@example.test/pet.png",
    }),
  );
  expect((await state()).pet.url).toBeNull();
  await owner.mutation(api.profileImages.remove, {
    kind: "profile",
    expectedRevision: 0,
  });
  expect((await state()).profile.url).toBeNull();
  await owner.mutation(api.users.getOrCreate, {
    clerkId: "owner",
    name: "Owner",
    email: "owner@example.test",
    avatar: "https://example.test/new-account-photo.png",
  });
  expect((await state()).profile.url).toBeNull();
  expect((await upload(owner, "profile", 1)).status).toBe(200);
  expect((await state()).profile.url).not.toContain("example.test");
});
it("enforces the upload quota transactionally and keeps deleted receipts in the quota window", async () => {
  const { t, owner, upload, state } = await fixture();
  for (let i = 0; i < 24; i++)
    expect((await upload(owner, "profile", i)).status).toBe(200);
  expect((await upload(owner, "pet", 0)).status).toBe(409);
  expect((await state()).profile.revision).toBe(24);
  const latest = await t.run(async (ctx) =>
    Math.max(
      ...(await ctx.db.query("profileImageUploads").take(30)).map(
        (row) => row.createdAt,
      ),
    ),
  );
  vi.setSystemTime(latest + 3600001);
  const reset = await upload(owner, "pet", 0);
  expect(reset.status, await reset.text()).toBe(200);
});
it("purges old retired receipt metadata without touching the active photo", async () => {
  const { t, owner, upload, raw } = await fixture();
  await upload();
  await upload(owner, "profile", 1);
  const active = (await raw())!.profilePhotoStorageId!;
  vi.advanceTimersByTime(8 * 86400000);
  expect(await t.mutation(internal.profileImages.cleanupReceipts, {})).toBe(1);
  const rows = await t.run((ctx) =>
    ctx.db.query("profileImageUploads").take(10),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].storageId).toBe(active);
  expect(await t.run((ctx) => ctx.db.system.get(active))).not.toBeNull();
});
it("fails closed on mismatched storage ownership and preserves unrelated objects during cleanup", async () => {
  const { t, ids, owner, other, upload, state } = await fixture();
  await upload(other);
  const foreign = (await t.run((ctx) => ctx.db.get(ids.other)))!
    .profilePhotoStorageId!;
  await t.run((ctx) =>
    ctx.db.patch(ids.owner, {
      profilePhotoStorageId: foreign,
      profilePhotoRevision: 1,
    }),
  );
  expect((await state()).profile.url).toBeNull();
  await expect(
    owner.mutation(api.profileImages.remove, {
      kind: "profile",
      expectedRevision: 1,
    }),
  ).rejects.toThrow("support review");
  expect(await t.run((ctx) => ctx.db.system.get(foreign))).not.toBeNull();
});
