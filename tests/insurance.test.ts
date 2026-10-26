import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import {
  estimateLink,
  insuranceAddressKey,
  insuranceAddress,
} from "../convex/lib/steadily";
const modules = import.meta.glob("../convex/**/*.ts");
const address = {
  address: "123 Synthetic St",
  city: "Austin",
  state: "TX",
  zip: "78701",
};
beforeEach(() => {
  vi.stubEnv("STEADILY_ENABLED", "1");
  vi.stubEnv("STEADILY_API_KEY", "synthetic-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkId: "insurance-owner",
      role: "landlord",
      name: "Owner",
      email: "owner@example.test",
      createdAt: 0,
    });
    const tenant = await ctx.db.insert("users", {
      clerkId: "insurance-tenant",
      role: "tenant",
      name: "Traveler",
      email: "tenant@example.test",
      createdAt: 0,
    });
    const listing = await ctx.db.insert("listings", {
      ...address,
      landlordId: owner,
      title: "Synthetic property",
      description: "Synthetic",
      bedrooms: 1,
      bathrooms: 1,
      price: 1800,
      propertyType: "Apartment",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: false,
      parkingIncluded: false,
      availableFrom: 0,
      minStay: 1,
      status: "pending",
      views: 0,
      createdAt: 0,
    });
    return { owner, tenant, listing };
  });
  const owner = t.withIdentity({ subject: "insurance-owner" });
  const args = {
    listingId: ids.listing,
    consent: true,
    requestId: "00000000-0000-4000-8000-000000000001",
    addressKey: insuranceAddressKey(insuranceAddress(address)),
  };
  return {
    t,
    ids,
    owner,
    args,
    tenant: t.withIdentity({ subject: "insurance-tenant" }),
  };
}
const response = (id: string, extra = {}) =>
  new Response(
    JSON.stringify({
      estimates: [
        {
          property_id: id,
          start_url: "https://app.steadily.com/quote/synthetic",
          ...extra,
        },
      ],
    }),
  );
it("normalizes US addresses and rejects incomplete or unknown state addresses", () => {
  expect(insuranceAddress({ ...address, state: "Texas" }).state).toBe("TX");
  for (const bad of [{ address: "" }, { zip: "123" }, { state: "ZZ" }])
    expect(() => insuranceAddress({ ...address, ...bad })).toThrow(
      "complete US",
    );
});
it("requires active owner, exact reviewed address, consent and an approved connection before sending", async () => {
  const { t, ids, owner, args, tenant } = await fixture(),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(t.action(api.insurance.estimate, args)).rejects.toThrow(
    "sign in",
  );
  await expect(tenant.action(api.insurance.estimate, args)).rejects.toThrow(
    "owner",
  );
  await expect(
    owner.action(api.insurance.estimate, { ...args, consent: false }),
  ).rejects.toThrow("Agree");
  await expect(
    owner.action(api.insurance.estimate, { ...args, addressKey: "stale" }),
  ).rejects.toThrow("changed");
  vi.stubEnv("STEADILY_ENABLED", "");
  expect(await owner.query(api.insurance.availability, {})).toBe(false);
  await expect(owner.action(api.insurance.estimate, args)).rejects.toThrow(
    "approved",
  );
  await t.run((ctx) => ctx.db.patch(ids.owner, { clerkDeletedAt: Date.now() }));
  await expect(owner.action(api.insurance.estimate, args)).rejects.toThrow(
    "no longer available",
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    await t.run((ctx) => ctx.db.query("insuranceEstimateLimits").collect()),
  ).toHaveLength(0);
});
it("sends only the reviewed property address to the fixed API, and returns a matching provider link", async () => {
  const { owner, args, ids } = await fixture(),
    fetcher = vi.fn().mockResolvedValue(response(ids.listing));
  vi.stubGlobal("fetch", fetcher);
  expect(await owner.action(api.insurance.estimate, args)).toEqual({
    url: "https://app.steadily.com/quote/synthetic",
  });
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.steadily.com/v1/quote/estimate");
  expect(options).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: { "X-Steadily-ApiKey": "synthetic-key" },
  });
  expect(JSON.parse(options.body)).toEqual({
    properties: [
      { property_id: ids.listing, address: insuranceAddress(address) },
    ],
  });
  await expect(owner.action(api.insurance.estimate, args)).rejects.toThrow(
    "recently",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("bounds owner property pages and never returns another account's private address", async () => {
  const { t, owner, tenant } = await fixture();
  const page = await owner.query(api.insurance.properties, {
    paginationOpts: { cursor: null, numItems: 100 },
  });
  expect(page.page).toHaveLength(1);
  expect(page.page[0]).toMatchObject({
    address: address.address,
    addressKey: insuranceAddressKey(insuranceAddress(address)),
  });
  await expect(
    tenant.query(api.insurance.properties, {
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("owners");
  const other = t.withIdentity({ subject: "other-owner" });
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "other-owner",
      role: "landlord",
      name: "Other",
      email: "other@example.test",
      createdAt: 0,
    }),
  );
  expect(
    (
      await other.query(api.insurance.properties, {
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).page,
  ).toEqual([]);
});
it("does not retry uncertain provider outcomes and enforces a daily owner cap", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 26));
  const { owner, args } = await fixture(),
    fetcher = vi
      .fn()
      .mockRejectedValue(new Error("Synthetic uncertain request"));
  vi.stubGlobal("fetch", fetcher);
  for (let n = 1; n <= 3; n++) {
    await expect(
      owner.action(api.insurance.estimate, {
        ...args,
        requestId: `00000000-0000-4000-8000-00000000000${n}`,
      }),
    ).rejects.toThrow("No automatic retry");
    vi.setSystemTime(Date.now() + 120001);
  }
  await expect(
    owner.action(api.insurance.estimate, {
      ...args,
      requestId: "00000000-0000-4000-8000-000000000004",
    }),
  ).rejects.toThrow("daily");
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("withholds a continuation link if the address changes while the provider is running", async () => {
  const { t, owner, args, ids } = await fixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await t.run((ctx) =>
        ctx.db.patch(ids.listing, { address: "456 Changed St" }),
      );
      return response(ids.listing);
    }),
  );
  await expect(owner.action(api.insurance.estimate, args)).rejects.toThrow(
    "changed during",
  );
});
it("rejects foreign, mismatched and malformed provider responses without exposing raw provider errors", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://steadily.com.evil.test/x",
    "https://evilsteadily.com",
    "https://user:password@app.steadily.com",
    "http://app.steadily.com",
  ])
    expect(() =>
      estimateLink(
        { estimates: [{ property_id: "listing", start_url: url }] },
        "listing",
      ),
    ).toThrow();
  expect(() =>
    estimateLink(
      {
        estimates: [
          { property_id: "foreign", start_url: "https://app.steadily.com" },
        ],
      },
      "listing",
    ),
  ).toThrow();
  expect(() =>
    estimateLink(
      {
        estimates: [
          {
            property_id: "listing",
            error: "private data",
            start_url: "https://app.steadily.com",
          },
        ],
      },
      "listing",
    ),
  ).toThrow("could not prepare");
});
it("rejects oversized, malformed or unsuccessful API responses after exactly one attempt", async () => {
  for (const reply of [
    new Response("synthetic private error", { status: 422 }),
    new Response("{}"),
    new Response("x".repeat(128 * 1024 + 1)),
  ]) {
    const { owner, args } = await fixture(),
      fetcher = vi.fn().mockResolvedValue(reply);
    vi.stubGlobal("fetch", fetcher);
    await expect(owner.action(api.insurance.estimate, args)).rejects.toThrow(
      "could not be confirmed",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
