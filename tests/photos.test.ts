import { seedPublishedFixtures } from "./helpers/publication";
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import {
  validatePhotoBytes,
  MAX_PHOTO_BYTES,
  convexSiteUrl,
} from "../lib/photos";
const modules = import.meta.glob("../convex/**/*.ts");
// Minimal valid 1x1 PNG, used only as synthetic test media.
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAXkAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
async function fixture() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "photo-owner",
      name: "Owner",
      email: "owner@example.test",
      role: "landlord",
      createdAt: 0,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "photo-other",
      name: "Other",
      email: "other@example.test",
      role: "landlord",
      createdAt: 0,
    }),
  );
  const owner = t.withIdentity({ subject: "photo-owner" }),
    other = t.withIdentity({ subject: "photo-other" });
  const data = {
    landlordId: ownerId,
    title: "Photo QA",
    description: "Synthetic property",
    city: "Austin",
    state: "TX",
    zip: "78701",
    address: "Synthetic",
    price: 1500,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: [],
    photos: [],
    petFriendly: false,
    utilitiesIncluded: true,
    parkingIncluded: false,
    availableFrom: Date.UTC(2027, 0, 1),
  };
  async function upload() {
    const response = await owner.fetch("/photos/upload", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { storageId: any; url: string };
  }
  return { t, owner, other, data, upload };
}
describe("authenticated property photos", () => {
  it("requires a profile and authentication, validates media before storing, and limits streamed bodies", async () => {
    const { t, owner } = await fixture();
    expect(
      (await t.fetch("/photos/upload", { method: "POST", body: png })).status,
    ).toBe(401);
    expect(
      (
        await t
          .withIdentity({ subject: "unknown" })
          .fetch("/photos/upload", { method: "POST", body: png })
      ).status,
    ).toBe(403);
    expect(
      (
        await owner.fetch("/photos/upload", {
          method: "POST",
          headers: { "Content-Type": "image/svg+xml" },
          body: "<svg/>",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await owner.fetch("/photos/upload", {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: "not an image",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner.fetch("/photos/upload", {
          method: "POST",
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(MAX_PHOTO_BYTES),
          },
          body: png,
        })
      ).status,
    ).toBe(413);
    expect(
      (await t.run((ctx) => ctx.db.query("photoUploads").collect())).length,
    ).toBe(0);
    await expect(t.mutation(api.files.generateUploadUrl, {})).rejects.toThrow();
    await expect(
      owner.mutation(api.files.generateUploadUrl, {}),
    ).rejects.toThrow("authenticated photo");
    expect(
      (await t.fetch("/photos/upload", { method: "OPTIONS" })).status,
    ).toBe(204);
  });
  it("ties storage to the account and persists order, cover, captions, clearing and fresh URLs", async () => {
    const { t, owner, other, data, upload } = await fixture();
    const first = await upload(),
      second = await upload();
    expect(
      await owner.mutation(api.files.getUrl, { storageId: first.storageId }),
    ).toBe(first.url);
    expect(
      await other.mutation(api.files.getUrl, { storageId: first.storageId }),
    ).toBeNull();
    const id = await owner.mutation(api.listings.create, {
      ...data,
      photoAssets: [
        { storageId: first.storageId, caption: " Kitchen " },
        { storageId: second.storageId, caption: "Bedroom" },
      ],
    });
    const stored = await t.run((ctx) => ctx.db.get(id));
    expect(stored?.photos).toEqual([]);
    expect(stored?.photoAssets?.[0].caption).toBe("Kitchen");
    await t.run((ctx) => ctx.db.patch(id, { status: "active" }));
    let listing = await owner.query(api.listings.getById, { id });
    expect(listing?.photos).toEqual([first.url, second.url]);
    await owner.mutation(api.listings.update, {
      id,
      photos: [],
      photoAssets: [
        { storageId: second.storageId, caption: "New cover" },
        { storageId: first.storageId, caption: "Kitchen" },
      ],
    });
    listing = await owner.query(api.listings.getById, { id });
    expect(listing?.photos[0]).toBe(second.url);
    expect(listing?.photoCaptions).toEqual(["New cover", "Kitchen"]);
    await t.run(ctx=>ctx.db.patch(id,{status:"active"}));
    await seedPublishedFixtures(t);
    const results = await t.query(api.search.listings, {
      propertyId: id,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(results.page[0].photos[0]).toBe(second.url);
    await expect(
      other.mutation(api.listings.create, {
        ...data,
        landlordId: (await other.query(api.users.getByClerkId, {
          clerkId: "photo-other",
        }))!._id,
        photoAssets: [{ storageId: first.storageId, caption: "stolen" }],
      }),
    ).rejects.toThrow("not owned");
    await expect(
      owner.mutation(api.listings.update, {
        id,
        photoAssets: [
          { storageId: first.storageId, caption: "a" },
          { storageId: first.storageId, caption: "b" },
        ],
      }),
    ).rejects.toThrow("duplicate");
    await expect(
      owner.mutation(api.listings.update, {
        id,
        photoAssets: [{ storageId: first.storageId, caption: "x".repeat(241) }],
      }),
    ).rejects.toThrow("240");
    await owner.mutation(api.listings.update, { id, photoAssets: [] });
    expect((await owner.query(api.listings.getById, { id }))?.photos).toEqual([]);
  });
  it("preserves only existing legacy URLs and rejects new unowned URLs, mixed sources and excessive galleries", async () => {
    const { t, owner, data, upload } = await fixture();
    const id = await t.run((ctx) =>
      ctx.db.insert("listings", {
        ...data,
        photos: ["https://images.example.test/legacy.png"],
        minStay: 1,
        status: "active",
        createdAt: 0,
        views: 0,
      }),
    );
    await owner.mutation(api.listings.update, {
      id,
      photoAssets: [
        {
          legacyUrl: "https://images.example.test/legacy.png",
          caption: "Legacy image",
        },
      ],
    });
    expect(
      (await owner.query(api.listings.getById, { id }))?.photoCaptions,
    ).toEqual(["Legacy image"]);
    await expect(
      owner.mutation(api.listings.update, {
        id,
        photoAssets: [
          { legacyUrl: "https://unowned.example.test/photo.png", caption: "" },
        ],
      }),
    ).rejects.toThrow("photo editor");
    const photo = await upload();
    await expect(
      owner.mutation(api.listings.update, {
        id,
        photoAssets: [
          {
            storageId: photo.storageId,
            legacyUrl: "https://images.example.test/legacy.png",
            caption: "",
          },
        ],
      }),
    ).rejects.toThrow("one source");
    await expect(
      owner.mutation(api.listings.update, {
        id,
        photoAssets: Array(31).fill({
          storageId: photo.storageId,
          caption: "",
        }),
      }),
    ).rejects.toThrow("30 photos");
    await expect(
      owner.mutation(api.listings.create, {
        ...data,
        photos: ["https://unowned.example.test/photo.png"],
      }),
    ).rejects.toThrow("photo editor");
  });
  it("enforces the hourly allowance transactionally and rejects invalid formats and sizes", async () => {
    const { t, owner, data, upload } = await fixture();
    const photo = await upload();
    await t.run(async (ctx) => {
      for (let i = 0; i < 59; i++)
        await ctx.db.insert("photoUploads", {
          ownerId: data.landlordId,
          storageId: photo.storageId,
          createdAt: Date.now(),
        });
    });
    expect(
      (
        await owner.fetch("/photos/upload", {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: png,
        })
      ).status,
    ).toBe(403);
    expect(() =>
      validatePhotoBytes(new Uint8Array(MAX_PHOTO_BYTES), "image/png"),
    ).toThrow("20 MB");
    expect(() => validatePhotoBytes(png, "image/jpeg")).toThrow("matching");
    expect(convexSiteUrl("https://example-123.convex.cloud")).toBe(
      "https://example-123.convex.site",
    );
    expect(convexSiteUrl("http://127.0.0.1:3210")).toBe(
      "http://127.0.0.1:3211",
    );
    expect(() => convexSiteUrl("https://custom.example.test")).toThrow(
      "CONVEX_SITE_URL",
    );
  });
});
