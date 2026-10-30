import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getServiceToken } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  guidedSchema,
  interpretGuided,
  searchSummary,
  validateDescription,
} from "../lib/guided-search";
import {
  parseDate,
  buildSearchUrl,
  parseSearchParams,
  matchesSearch,
} from "../lib/search";
vi.mock("convex/server", async (original) => ({
  ...(await original<typeof import("convex/server")>()),
  getServiceToken: vi.fn(),
}));
const modules = import.meta.glob("../convex/**/*.ts"),
  now = Date.UTC(2026, 9, 25);
const clientId = "00000000-0000-4000-8000-000000000001",
  requestId = "00000000-0000-4000-8000-000000000002";
const raw = (overrides: Record<string, unknown> = {}) => ({
  ...Object.fromEntries(
    guidedSchema.required.map((k) => [
      k,
      ["propertyTypes", "amenities", "unapplied"].includes(k) ? [] : null,
    ]),
  ),
  ...overrides,
});
const args = (overrides: Record<string, unknown> = {}) => ({
  description:
    "Pet friendly one bedroom in Austin, Texas, below $2500 per month",
  base: {},
  clientId,
  requestId,
  consent: true,
  ...overrides,
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("AI_SEARCH_ENABLED", "1");
  vi.mocked(getServiceToken).mockResolvedValue("synthetic-service-token");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const response = (content: unknown) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(content) },
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
it("interprets allowed filters and computes calendar-month checkout without inventing results", () => {
  const result = interpretGuided(
    raw({
      city: "Austin",
      state: "Texas",
      bedrooms: 1,
      maxPrice: 2500.55,
      petFriendly: true,
      amenities: ["WiFi"],
      moveIn: "2027-01-31",
      durationAmount: 2,
      durationUnit: "months",
    }),
    {},
    now,
  );
  expect(result.filters).toMatchObject({
    city: "Austin",
    state: "TX",
    bedrooms: 1,
    maxPrice: 2500.55,
    petFriendly: true,
    amenities: ["WiFi"],
    moveOut: parseDate("2027-03-31"),
  });
  expect(
    interpretGuided(
      raw({ moveIn: "2027-03-31", durationAmount: 1, durationUnit: "months" }),
      {},
      now,
    ).filters.moveOut,
  ).toBe(parseDate("2027-04-30"));
});
it("keeps unresolved location or date preferences explicit rather than broadening silently", () => {
  const result = interpretGuided(
    raw({
      city: "Phoenix",
      state: "AZ",
      durationAmount: 8,
      durationUnit: "weeks",
      unapplied: [
        "Choose the hospital reference location; commute time is not supported.",
      ],
    }),
    {
      nearLatitude: 33,
      nearLongitude: -112,
      radiusMiles: 10,
      sort: "price_asc",
    },
    now,
  );
  expect(result.filters.moveIn).toBeUndefined();
  expect(result.filters.nearLatitude).toBeUndefined();
  expect(result.filters.sort).toBe("price_asc");
  expect(result.unapplied).toHaveLength(3);
});
it("rejects invented geometry, invalid types, unsupported amenities and conflicting dates", () => {
  for (const output of [
    raw({ latitude: 33 }),
    raw({ bedrooms: "1" }),
    raw({ amenities: ["Quiet"] }),
    raw({ petFriendly: "true" }),
    raw({ moveIn: "2027-02-30", moveOut: "2027-04-01" }),
    raw({
      moveIn: "2027-01-01",
      moveOut: "2027-02-15",
      durationAmount: 2,
      durationUnit: "months",
    }),
    raw({ moveIn: "2026-01-01", moveOut: "2026-03-01" }),
    raw({ moveIn: "2027-01-01", durationAmount: 2, durationUnit: "weeks" }),
    raw({ durationAmount: 2, durationUnit: null }),
  ])
    expect(() => interpretGuided(output, {}, now)).toThrow();
});
it("validates input bounds and summarizes only filters that actually round-trip to native search", () => {
  for (const text of ["short", "x".repeat(2001), "a long description\u0000"])
    expect(() => validateDescription(text)).toThrow();
  const f = interpretGuided(
    raw({
      city: "Austin",
      state: "TX",
      maxPrice: 2500.55,
      bedrooms: 1,
      petFriendly: true,
    }),
    {},
    now,
  ).filters;
  const url = buildSearchUrl(f);
  expect(parseSearchParams(new URLSearchParams(url.split("?")[1]))).toEqual(f);
  expect(searchSummary(f)).toContain("Up to $2,500.55 / month");
  const candidate = {
    title: "Synthetic rental",
    zip: "78701",
    city: "Austin",
    state: "TX",
    price: 2400,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "Apartment",
    amenities: [],
    petFriendly: true,
    utilitiesIncluded: false,
    parkingIncluded: false,
  };
  expect(matchesSearch(candidate, f)).toBe(true);
  expect(matchesSearch({ ...candidate, price: 2600 }, f)).toBe(false);
  expect(matchesSearch({ ...candidate, petFriendly: false }, f)).toBe(false);
});
it("requires consent and operator enablement without issuing a model request", async () => {
  const t = convexTest(schema, modules),
    network = vi.fn();
  vi.stubGlobal("fetch", network);
  await expect(
    t.action(api.guidedSearch.interpret, args({ consent: false })),
  ).rejects.toThrow("Allow");
  vi.stubEnv("AI_SEARCH_ENABLED", "");
  await expect(t.action(api.guidedSearch.interpret, args())).rejects.toThrow(
    "not enabled",
  );
  expect(network).not.toHaveBeenCalled();
  expect(getServiceToken).not.toHaveBeenCalled();
});
it("probes real capability without returning credentials or billing a model", async () => {
  const t = convexTest(schema, modules),
    network = vi.fn();
  vi.stubGlobal("fetch", network);
  expect(await t.action(api.guidedSearch.availability, {})).toEqual({
    available: true,
    reason: "ready",
  });
  vi.mocked(getServiceToken).mockRejectedValue(new Error("AiGatewayDisabled"));
  expect(await t.action(api.guidedSearch.availability, {})).toEqual({
    available: false,
    reason: "provider_unavailable",
  });
  expect(network).not.toHaveBeenCalled();
});
it("calls the fixed gateway with structured output and returns native filters, not generated listings", async () => {
  const t = convexTest(schema, modules),
    network = vi.fn().mockResolvedValue(
      response(
        raw({
          city: "Austin",
          state: "TX",
          bedrooms: 1,
          maxPrice: 2500,
          petFriendly: true,
          unapplied: ["On-site laundry needs manual review."],
        }),
      ),
    );
  vi.stubGlobal("fetch", network);
  const result = await t.action(api.guidedSearch.interpret, args());
  expect(result.filters).toMatchObject({
    city: "Austin",
    state: "TX",
    bedrooms: 1,
    maxPrice: 2500,
    petFriendly: true,
  });
  expect(result.unapplied).toHaveLength(1);
  const [url, options] = network.mock.calls[0];
  expect(url).toBe("https://ai-gateway.convex.dev/v1/chat/completions");
  expect(options.redirect).toBe("error");
  const sent = JSON.parse(options.body);
  expect(sent.response_format.json_schema.strict).toBe(true);
  expect(sent.provider).toMatchObject({
    zdr: true,
    data_collection: "deny",
    require_parameters: true,
  });
  expect(sent.messages).toHaveLength(2);
  const actual = await t.query(api.search.listings, {
    ...result.filters,
    paginationOpts: { cursor: null, numItems: 24 },
  });
  expect(actual.page).toEqual([]);
  const rows = await t.run((ctx) =>
    ctx.db.query("guidedSearchLimits").collect(),
  );
  expect(rows).toHaveLength(2);
  expect(JSON.stringify(rows)).not.toContain("Austin");
  expect(JSON.stringify(rows)).not.toContain("synthetic-service-token");
  await expect(t.action(api.guidedSearch.interpret, args())).rejects.toThrow(
    "already submitted",
  );
  expect(network).toHaveBeenCalledTimes(1);
});
it("rejects bad model responses safely and releases in-flight state without retrying", async () => {
  const t = convexTest(schema, modules),
    network = vi
      .fn()
      .mockResolvedValue(response(raw({ amenities: ["Imaginary amenity"] })));
  vi.stubGlobal("fetch", network);
  await expect(t.action(api.guidedSearch.interpret, args())).rejects.toThrow(
    "could not reliably interpret",
  );
  expect(network).toHaveBeenCalledTimes(1);
  const rows = await t.run((ctx) =>
    ctx.db.query("guidedSearchLimits").collect(),
  );
  expect(rows.find((r) => r.key.startsWith("actor:"))?.busyUntil).toBe(0);
});
it("enforces concurrency, replay history and per-actor/day limits atomically", async () => {
  const t = convexTest(schema, modules),
    claim = internal.guidedSearch.claim,
    finish = internal.guidedSearch.finish;
  await t.mutation(claim, { actor: "a", requestId: "first" });
  await expect(
    t.mutation(claim, { actor: "a", requestId: "second" }),
  ).rejects.toThrow("already being");
  await t.mutation(finish, { actor: "a", requestId: "first" });
  await t.mutation(claim, { actor: "a", requestId: "second" });
  await t.mutation(finish, { actor: "a", requestId: "second" });
  await expect(
    t.mutation(claim, { actor: "a", requestId: "first" }),
  ).rejects.toThrow("already submitted");
  for (let i = 2; i < 30; i++) {
    vi.setSystemTime(now + i * 60000);
    await t.mutation(claim, { actor: "a", requestId: `r${i}` });
    await t.mutation(finish, { actor: "a", requestId: `r${i}` });
  }
  vi.setSystemTime(now + 31 * 60000);
  await expect(
    t.mutation(claim, { actor: "a", requestId: "over" }),
  ).rejects.toThrow("limit reached");
});
it("caps total anonymous usage and removes only expired private rate metadata", async () => {
  const t = convexTest(schema, modules);
  for (let i = 0; i < 100; i++)
    await t.mutation(internal.guidedSearch.claim, {
      actor: `page${i}`,
      requestId: `r${i}`,
    });
  await expect(
    t.mutation(internal.guidedSearch.claim, {
      actor: "new",
      requestId: "over",
    }),
  ).rejects.toThrow("limit reached");
  vi.setSystemTime(now + 4 * 86400000);
  await t.mutation(internal.guidedSearch.claim, {
    actor: "fresh",
    requestId: "newday",
  });
  await t.mutation(internal.guidedSearch.cleanup, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const rows = await t.run((ctx) =>
    ctx.db.query("guidedSearchLimits").collect(),
  );
  expect(rows.map((r) => r.key).sort()).toEqual(["actor:fresh", "global"]);
});

it("limits bursts and binds signed accounts across rotated page IDs", async () => {
  const t = convexTest(schema, modules).withIdentity({
    subject: "qa-signed-account",
    issuer: "https://synthetic.clerk.accounts.dev",
  });
  const network = vi
    .fn()
    .mockImplementation(() => response(raw({ city: "Austin", state: "TX" })));
  vi.stubGlobal("fetch", network);
  for (let i = 0; i < 5; i++)
    await t.action(
      api.guidedSearch.interpret,
      args({
        clientId: `00000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`,
        requestId: `00000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`,
      }),
    );
  await expect(t.action(api.guidedSearch.interpret, args())).rejects.toThrow(
    "limit reached",
  );
  expect(network).toHaveBeenCalledTimes(5);
  const rows = await t.run((ctx) =>
    ctx.db.query("guidedSearchLimits").collect(),
  );
  expect(rows.filter((r) => r.key.startsWith("actor:"))).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain("qa-signed-account");
});
it.each(["refusal", "truncated", "oversized", "failure"])(
  "does not accept %s provider output",
  async (kind) => {
    const t = convexTest(schema, modules);
    const network = vi.fn().mockImplementation(() =>
      kind === "oversized"
        ? new Response("x".repeat(128 * 1024 + 1))
        : kind === "failure"
          ? new Response("Synthetic error", { status: 503 })
          : new Response(
              JSON.stringify({
                choices: [
                  {
                    finish_reason: kind === "truncated" ? "length" : "stop",
                    message: {
                      refusal: kind === "refusal" ? "Synthetic refusal" : null,
                      content: JSON.stringify(raw()),
                    },
                  },
                ],
              }),
            ),
    );
    vi.stubGlobal("fetch", network);
    await expect(t.action(api.guidedSearch.interpret, args())).rejects.toThrow(
      "could not reliably interpret",
    );
    expect(network).toHaveBeenCalledTimes(1);
  },
);
