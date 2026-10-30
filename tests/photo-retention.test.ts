import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  PHOTO_RECOVERY_MS,
  PHOTO_REFERENCE_MIGRATION,
} from "../convex/lib/photoRetention";
const modules = import.meta.glob("../convex/**/*.ts");
const now = Date.UTC(2027, 0, 1);
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
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "photo-retention-owner",
      name: "Synthetic owner",
      email: "photo@example.test",
      role: "landlord",
      createdAt: now,
    }),
  );
  const owner = t.withIdentity({ subject: "photo-retention-owner" });
  const data = {
    landlordId: userId,
    title: "Synthetic photo retention",
    description: "Test only",
    city: "Austin",
    state: "TX",
    zip: "78701",
    address: "Synthetic fixture",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: true,
    parkingIncluded: false,
    availableFrom: now,
  };
  const upload = async () => {
    const response = await owner.fetch("/photos/upload", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
    expect(response.status).toBe(200);
    return (await response.json()) as {
      storageId: import("../convex/_generated/dataModel").Id<"_storage">;
      url: string;
    };
  };
  const maintenance = () => t.mutation(internal.photoRetention.maintenance, {});
  const drain = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const meta = (id: import("../convex/_generated/dataModel").Id<"_storage">) =>
    t.run((ctx) => ctx.db.system.get(id));
  return { t, userId, owner, data, upload, maintenance, drain, meta };
}
it("gives abandoned authenticated uploads seven days and removes their bytes and registry together", async () => {
  const f = await fixture(),
    photo = await f.upload();
  await f.maintenance();
  await f.drain();
  const row = await f.t.run((ctx) => ctx.db.query("photoUploads").first());
  expect(row?.expiresAt).toBe(row!.createdAt + PHOTO_RECOVERY_MS);
  vi.setSystemTime(row!.expiresAt! - 2);
  expect((await f.maintenance()).deleted).toBe(0);
  expect(await f.meta(photo.storageId)).not.toBeNull();
  vi.setSystemTime(row!.expiresAt!);
  expect((await f.maintenance()).deleted).toBe(1);
  expect(await f.meta(photo.storageId)).toBeNull();
  expect(
    await f.owner.mutation(api.files.getUrl, { storageId: photo.storageId }),
  ).toBeNull();
  await expect(
    f.owner.mutation(api.listings.create, {
      ...f.data,
      photoAssets: [{ storageId: photo.storageId, caption: "Expired" }],
    }),
  ).rejects.toThrow("not found");
  expect((await f.maintenance()).deleted).toBe(0);
});
it("keeps a shared photo until removed from every rental, including hidden drafts, and permits recovery", async () => {
  const f = await fixture(),
    photo = await f.upload(),
    assets = [{ storageId: photo.storageId, caption: "Shared" }];
  const a = await f.owner.mutation(api.listings.create, {
    ...f.data,
    photoAssets: assets,
  });
  const b = await f.owner.mutation(api.listings.create, {
    ...f.data,
    photoAssets: assets,
  });
  await f.maintenance();
  await f.drain();
  await f.owner.mutation(api.listings.update, { id: a, photoAssets: [] });
  vi.setSystemTime(now + PHOTO_RECOVERY_MS * 2);
  await f.maintenance();
  expect(await f.meta(photo.storageId)).not.toBeNull();
  await f.owner.mutation(api.listings.update, { id: b, photoAssets: [] });
  const expiry = (await f.t.run((ctx) => ctx.db.query("photoUploads").first()))
    ?.expiresAt;
  expect(expiry).toBeGreaterThanOrEqual(now + PHOTO_RECOVERY_MS * 3);
  expect(expiry).toBeLessThan(now + PHOTO_RECOVERY_MS * 3 + 10);
  vi.setSystemTime(expiry! - 1);
  await f.owner.mutation(api.listings.update, { id: a, photoAssets: assets });
  vi.setSystemTime(expiry! + 1000);
  await f.maintenance();
  expect(await f.meta(photo.storageId)).not.toBeNull();
  expect(
    (await f.t.run((ctx) => ctx.db.query("photoUploads").first()))?.expiresAt,
  ).toBeUndefined();
  await f.owner.mutation(api.listings.update, { id: a, photoAssets: [] });
  const finalExpiry = (await f.t.run((ctx) =>
    ctx.db.query("photoUploads").first(),
  ))!.expiresAt!;
  vi.setSystemTime(finalExpiry);
  expect((await f.maintenance()).deleted).toBe(1);
  await f.drain();
});
it("rechecks references even when stale metadata makes an attached photo appear due", async () => {
  const f = await fixture(),
    photo = await f.upload();
  const id = await f.owner.mutation(api.listings.create, {
    ...f.data,
    photoAssets: [{ storageId: photo.storageId, caption: "Keep" }],
  });
  await f.maintenance();
  await f.drain();
  const row = (await f.t.run((ctx) => ctx.db.query("photoUploads").first()))!;
  await f.t.run((ctx) => ctx.db.patch(row._id, { expiresAt: now - 1 }));
  expect((await f.maintenance()).deleted).toBe(0);
  expect(await f.meta(photo.storageId)).not.toBeNull();
  expect((await f.owner.query(api.listings.getById, { id }))?.photos).toEqual([
    photo.url,
  ]);
});
it("deleting a rental releases its references while failed or unauthorized writes preserve them", async () => {
  const f = await fixture(),
    photo = await f.upload();
  const id = await f.owner.mutation(api.listings.create, {
    ...f.data,
    photoAssets: [{ storageId: photo.storageId, caption: "Keep" }],
  });
  const other = f.t.withIdentity({ subject: "missing-owner" });
  await expect(
    other.mutation(api.listings.update, { id, photoAssets: [] }),
  ).rejects.toThrow();
  await expect(
    f.owner.mutation(api.listings.update, {
      id,
      photoAssets: [{ storageId: photo.storageId, caption: "x".repeat(241) }],
    }),
  ).rejects.toThrow();
  expect(
    await f.t.run((ctx) => ctx.db.query("listingPhotoReferences").collect()),
  ).toHaveLength(1);
  await f.owner.mutation(api.listings.deleteListing, { id });
  await f.maintenance();
  await f.drain();
  expect(await f.meta(photo.storageId)).not.toBeNull();
  vi.setSystemTime(now + PHOTO_RECOVERY_MS + 100);
  expect((await f.maintenance()).deleted).toBe(1);
  await f.drain();
});
it("finishes paged legacy-reference discovery before adoption, granting old orphans a new recovery period", async () => {
  const f = await fixture();
  const legacy = await f.t.run(async (ctx) => {
    const used = await ctx.storage.store(
      new Blob([png], { type: "image/png" }),
    );
    const abandoned = await ctx.storage.store(
      new Blob([png, new Uint8Array([1])], { type: "image/png" }),
    );
    const url = (await ctx.storage.getUrl(used))!;
    for (const storageId of [used, abandoned])
      await ctx.db.insert("photoUploads", {
        ownerId: f.userId,
        storageId,
        createdAt: 0,
      });
    for (let i = 0; i < 52; i++)
      await ctx.db.insert("listings", {
        ...f.data,
        photos: i === 51 ? [url] : [],
        ...(i === 50
          ? { photoAssets: [{ storageId: used, caption: "Legacy canonical" }] }
          : {}),
        minStay: 1,
        status: "pending",
        createdAt: 0,
        views: 0,
      });
    return { used, abandoned };
  });
  expect((await f.maintenance()).ready).toBe(false);
  const before = await f.t.run((ctx) => ctx.db.query("photoUploads").collect());
  expect(before.every((row) => row.cleanupVersion === undefined)).toBe(true);
  expect(await f.meta(legacy.abandoned)).not.toBeNull();
  await f.drain();
  const state = await f.t.run((ctx) =>
    ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", PHOTO_REFERENCE_MIGRATION))
      .unique(),
  );
  expect(state?.complete).toBe(true);
  const references = await f.t.run((ctx) =>
    ctx.db.query("listingPhotoReferences").collect(),
  );
  expect(references).toHaveLength(2);
  const rows = await f.t.run((ctx) => ctx.db.query("photoUploads").collect());
  expect(
    rows.find((row) => row.storageId === legacy.used)?.expiresAt,
  ).toBeUndefined();
  expect(
    rows.find((row) => row.storageId === legacy.abandoned)?.expiresAt,
  ).toBeGreaterThanOrEqual(now + PHOTO_RECOVERY_MS);
  vi.setSystemTime(now + PHOTO_RECOVERY_MS + 100);
  expect((await f.maintenance()).deleted).toBe(1);
  expect(await f.meta(legacy.used)).not.toBeNull();
});
it("continues cleanup beyond one page and tolerates already missing storage", async () => {
  const f = await fixture();
  const ids = await f.t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 56; i++) {
      const storageId = await ctx.storage.store(
        new Blob([png], { type: "image/png" }),
      );
      await ctx.db.insert("photoUploads", {
        ownerId: f.userId,
        storageId,
        createdAt: now,
        cleanupVersion: 1,
        expiresAt: now - 1,
      });
      ids.push(storageId);
    }
    await ctx.storage.delete(ids[0]);
    return ids;
  });
  await f.maintenance();
  await f.drain();
  expect(
    await f.t.run((ctx) => ctx.db.query("photoUploads").collect()),
  ).toHaveLength(0);
  for (const id of ids) expect(await f.meta(id)).toBeNull();
});
it("does not sweep unrelated storage, profile/pet uploads or externally hosted legacy images", async () => {
  const f = await fixture();
  const ids = await f.t.run(async (ctx) => {
    const arbitrary = await ctx.storage.store(
      new Blob(["private PDF bytes"], { type: "application/pdf" }),
    );
    const profile = await ctx.storage.store(
      new Blob([png], { type: "image/png" }),
    );
    await ctx.db.insert("profileImageUploads", {
      ownerId: f.userId,
      kind: "profile",
      requestId: "synthetic-profile",
      expectedRevision: 0,
      revision: 1,
      storageId: profile,
      bytes: png.length,
      contentType: "image/png",
      digest: "synthetic",
      createdAt: now,
    });
    // Deliberately inconsistent dual registration must fail closed.
    await ctx.db.insert("photoUploads", {
      ownerId: f.userId,
      storageId: profile,
      createdAt: now,
      cleanupVersion: 1,
      expiresAt: now - 1,
    });
    await ctx.db.insert("listings", {
      ...f.data,
      photos: ["https://external.example.test/api/storage/not-a-native-file"],
      minStay: 1,
      status: "pending",
      createdAt: now,
      views: 0,
    });
    return { arbitrary, profile };
  });
  await f.maintenance();
  await f.drain();
  expect(await f.meta(ids.arbitrary)).not.toBeNull();
  expect(await f.meta(ids.profile)).not.toBeNull();
});
it("serializes a racing save and cleanup so no successful gallery references deleted bytes", async () => {
  const f = await fixture(),
    photo = await f.upload();
  await f.maintenance();
  await f.drain();
  const row = (await f.t.run((ctx) => ctx.db.query("photoUploads").first()))!;
  vi.setSystemTime(row.expiresAt!);
  const [save] = await Promise.allSettled([
    f.owner.mutation(api.listings.create, {
      ...f.data,
      photoAssets: [{ storageId: photo.storageId, caption: "Racing save" }],
    }),
    f.maintenance(),
  ]);
  if (save.status === "fulfilled") {
    expect(await f.meta(photo.storageId)).not.toBeNull();
    expect(
      (await f.owner.query(api.listings.getById, { id: save.value }))?.photos,
    ).toEqual([photo.url]);
  } else {
    expect(String(save.reason)).toContain("not found");
    expect(await f.meta(photo.storageId)).toBeNull();
  }
});
