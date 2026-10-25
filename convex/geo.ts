import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import { placeCandidate } from "./validators/geo";
import {
  addressKey,
  approximatePoint,
  parseCensus,
  parseGeoapify,
} from "../lib/geo";
import { syncGeo, removeGeo } from "./lib/geo";
import { normalizeCity, normalizeState } from "../lib/locations";
const status = v.union(
  v.literal("looking_up"),
  v.literal("candidate"),
  v.literal("confirmed"),
  v.literal("failed"),
);
export const mine = query({
  args: { listingId: v.id("listings") },
  returns: v.union(
    v.null(),
    v.object({
      status,
      generation: v.number(),
      candidates: v.array(placeCandidate),
      matchedAddress: v.optional(v.string()),
      provider: v.optional(v.string()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      l = await ctx.db.get(args.listingId);
    if (!l || (l.landlordId !== user._id && user.role !== "admin"))
      throw new Error("Not authorized.");
    const r = await ctx.db
      .query("listingLocations")
      .withIndex("by_listing", (q) => q.eq("listingId", l._id))
      .unique();
    return r
      ? {
          status: r.status,
          generation: r.generation,
          candidates: r.candidates,
          matchedAddress: r.matchedAddress,
          provider: r.provider,
          updatedAt: r.updatedAt,
        }
      : null;
  },
});
export const begin = internalMutation({
  args: { listingId: v.id("listings") },
  returns: v.object({
    generation: v.number(),
    addressKey: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      l = await ctx.db.get(args.listingId);
    if (!l || (l.landlordId !== user._id && user.role !== "admin"))
      throw new Error("Not authorized.");
    const previous = await ctx.db
      .query("listingLocations")
      .withIndex("by_listing", (q) => q.eq("listingId", l._id))
      .unique();
    if (previous?.status === "confirmed")
      throw new Error(
        "This property's map location is confirmed. Contact support for corrections.",
      );
    if (previous && previous.updatedAt > Date.now() - 30000)
      throw new Error("Wait before trying another address lookup.");
    const generation = (l.locationGeneration ?? previous?.generation ?? 0) + 1,
      key = addressKey(l),
      patch = {
        addressKey: key,
        generation,
        status: "looking_up" as const,
        candidates: [],
        updatedAt: Date.now(),
      };
    await ctx.db.patch(l._id, { locationGeneration: generation });
    if (previous) await ctx.db.patch(previous._id, patch);
    else
      await ctx.db.insert("listingLocations", { listingId: l._id, ...patch });
    return {
      generation,
      addressKey: key,
      address: l.address,
      city: l.city,
      state: l.state,
      zip: l.zip,
    };
  },
});
export const finish = internalMutation({
  args: {
    listingId: v.id("listings"),
    generation: v.number(),
    addressKey: v.string(),
    candidates: v.array(placeCandidate),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.listingId),
      r = await ctx.db
        .query("listingLocations")
        .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
        .unique();
    if (
      !l ||
      !r ||
      r.generation !== args.generation ||
      r.status !== "looking_up" ||
      r.addressKey !== args.addressKey ||
      addressKey(l) !== args.addressKey
    )
      return null;
    await ctx.db.patch(r._id, {
      status: args.candidates.length ? "candidate" : "failed",
      candidates: args.candidates.slice(0, 5),
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const reserve = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity(),
      user = identity
        ? await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .unique()
        : null;
    const recent = await ctx.db
      .query("geoRequests")
      .withIndex("by_user", (q) =>
        q.eq("userId", user?._id).gt("createdAt", Date.now() - 3600000),
      )
      .take(user ? 21 : 101);
    if (recent.length >= (user ? 20 : 100))
      throw new Error("Location lookup limit reached. Try again later.");
    const name = `geocoding:${new Date().toISOString().slice(0, 10)}`,
      day = await ctx.db
        .query("counters")
        .withIndex("by_name", (q) => q.eq("name", name))
        .unique();
    if ((day?.value ?? 0) >= 500)
      throw new Error("Location lookup is temporarily at its daily limit.");
    if (day) await ctx.db.patch(day._id, { value: day.value + 1 });
    else await ctx.db.insert("counters", { name, value: 1 });
    await ctx.db.insert("geoRequests", {
      userId: user?._id,
      createdAt: Date.now(),
    });
    return null;
  },
});
async function lookup(
  text: string,
  structured?: { address: string; city: string; state: string; zip: string },
) {
  let url: URL, provider: "census" | "geoapify";
  if (process.env.GEOAPIFY_API_KEY) {
    provider = "geoapify";
    url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.searchParams.set("apiKey", process.env.GEOAPIFY_API_KEY);
    url.searchParams.set("filter", "countrycode:us");
    url.searchParams.set("limit", "5");
    url.searchParams.set("text", text);
  } else {
    provider = "census";
    url = new URL(
      "https://geocoding.geo.census.gov/geocoder/locations/" +
        (structured ? "address" : "onelineaddress"),
    );
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("format", "json");
    if (structured) {
      for (const [key, value] of Object.entries({
        street: structured.address,
        city: structured.city,
        state: structured.state,
        zip: structured.zip,
      }))
        url.searchParams.set(key, value);
    } else url.searchParams.set("address", text);
  }
  const response = await fetch(url.toString(), {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") ?? 0) > 512000
  )
    throw new Error(
      "Location service is unavailable. Try later or contact support.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Location service returned no data.");
  let size = 0,
    body = "";
  const decoder = new TextDecoder();
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > 512000) {
      await reader.cancel();
      throw new Error("Location response exceeded its limit.");
    }
    body += decoder.decode(item.value, { stream: true });
  }
  body += decoder.decode();
  const json = JSON.parse(body);
  if (structured) {
    const number = structured.address
        .trim()
        .match(/^\d+[A-Za-z-]*/)?.[0]
        ?.toUpperCase(),
      state = normalizeState(structured.state),
      zip = structured.zip.split("-")[0];
    if (!number) throw new Error("A numbered street address is required.");
    if (provider === "census" && json.result?.addressMatches)
      json.result.addressMatches = json.result.addressMatches.filter(
        (m: any) =>
          normalizeState(m.addressComponents?.state ?? "") === state &&
          String(m.addressComponents?.zip ?? "").split("-")[0] === zip &&
          m.matchedAddress?.match(/^\d+[A-Za-z-]*/)?.[0]?.toUpperCase() ===
            number,
      );
    if (provider === "geoapify" && json.features)
      json.features = json.features.filter(
        (f: any) =>
          f.properties?.result_type === "building" &&
          normalizeState(f.properties.state_code ?? "") === state &&
          String(f.properties.postcode ?? "").split("-")[0] === zip &&
          String(f.properties.housenumber ?? "").toUpperCase() === number,
      );
  }
  return provider === "census" ? parseCensus(json) : parseGeoapify(json);
}
export const lookupListing = action({
  args: {
    listingId: v.id("listings"),
    consent: v.boolean(),
    expectedProvider: v.optional(
      v.union(v.literal("census"), v.literal("geoapify")),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.consent)
      throw new Error("Confirm sending this address to the location provider.");
    if (
      args.expectedProvider &&
      args.expectedProvider !==
        (process.env.GEOAPIFY_API_KEY ? "geoapify" : "census")
    )
      throw new Error(
        "The location provider changed. Review the provider permission again.",
      );
    const request = await ctx.runMutation(internal.geo.begin, {
      listingId: args.listingId,
    });
    try {
      await ctx.runMutation(internal.geo.reserve, {});
      const candidates = await lookup(
        `${request.address}, ${request.city}, ${request.state} ${request.zip}`,
        request,
      );
      await ctx.runMutation(internal.geo.finish, {
        listingId: args.listingId,
        generation: request.generation,
        addressKey: request.addressKey,
        candidates,
      });
    } catch {
      await ctx.runMutation(internal.geo.finish, {
        listingId: args.listingId,
        generation: request.generation,
        addressKey: request.addressKey,
        candidates: [],
      });
      throw new Error(
        "Could not confirm an address match. Retry later or contact support.",
      );
    }
    return null;
  },
});
export const searchPlaces = action({
  args: {
    text: v.string(),
    consent: v.boolean(),
    expectedProvider: v.optional(
      v.union(v.literal("census"), v.literal("geoapify")),
    ),
  },
  returns: v.object({
    candidates: v.array(placeCandidate),
    provider: v.union(v.literal("census"), v.literal("geoapify")),
  }),
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (
      args.expectedProvider &&
      args.expectedProvider !==
        (process.env.GEOAPIFY_API_KEY ? "geoapify" : "census")
    )
      throw new Error(
        "The location provider changed. Review the provider permission again.",
      );
    if (!args.consent)
      throw new Error("Confirm sending this search to the location provider.");
    if (text.length < 3 || text.length > 200)
      throw new Error("Enter a location of 3–200 characters.");
    await ctx.runMutation(internal.geo.reserve, {});
    try {
      return {
        candidates: await lookup(text),
        provider: process.env.GEOAPIFY_API_KEY
          ? ("geoapify" as const)
          : ("census" as const),
      };
    } catch {
      throw new Error(
        "Location lookup failed. Use city/state or try again later.",
      );
    }
  },
});
export const confirm = mutation({
  args: {
    listingId: v.id("listings"),
    generation: v.number(),
    candidate: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      l = await ctx.db.get(args.listingId);
    if (!l || (l.landlordId !== user._id && user.role !== "admin"))
      throw new Error("Not authorized.");
    const r = await ctx.db
      .query("listingLocations")
      .withIndex("by_listing", (q) => q.eq("listingId", l._id))
      .unique();
    if (
      !r ||
      r.status !== "candidate" ||
      r.generation !== args.generation ||
      r.addressKey !== addressKey(l) ||
      !Number.isInteger(args.candidate) ||
      !r.candidates[args.candidate]
    )
      throw new Error(
        "The address or lookup changed. Inspect the current match.",
      );
    const c = r.candidates[args.candidate],
      p = approximatePoint(c);
    await ctx.db.patch(r._id, {
      status: "confirmed",
      exactLatitude: c.latitude,
      exactLongitude: c.longitude,
      provider: c.provider,
      matchedAddress: c.label,
      confirmedBy: user._id,
      candidates: [],
      updatedAt: Date.now(),
    });
    const patch = {
      mapLatitude: p.latitude,
      mapLongitude: p.longitude,
      locationConfirmedAt: Date.now(),
      revision: (l.revision ?? 0) + 1,
      approvalStatus: "pending" as const,
      approvedRevision: undefined,
      status: "pending" as const,
    };
    await ctx.db.patch(l._id, patch);
    await syncGeo(ctx, { ...l, ...patch });
    await ctx.db.insert("locationAudit", {
      listingId: l._id,
      actorId: user._id,
      action: "confirmed",
      note: "Provider address match confirmed; public map uses an approximate cell center",
      createdAt: Date.now(),
    });
    return null;
  },
});
export const correctAddress = mutation({
  args: {
    listingId: v.id("listings"),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") throw new Error("Staff access required.");
    const l = await ctx.db.get(args.listingId);
    if (!l) throw new Error("Property not found.");
    if (
      args.note.trim().length < 10 ||
      args.note.length > 2000 ||
      !args.address.trim() ||
      args.address.length > 300
    )
      throw new Error(
        "Enter an address and a correction note of 10–2000 characters.",
      );
    if (
      normalizeCity(args.city) !== normalizeCity(l.city) ||
      normalizeState(args.state) !== normalizeState(l.state) ||
      args.zip.split("-")[0] !== l.zip.split("-")[0] ||
      args.address.match(/^\d+[A-Za-z-]*/)?.[0] !==
        l.address.match(/^\d+[A-Za-z-]*/)?.[0]
    )
      throw new Error(
        "A different property, city, ZIP or street number requires a new listing.",
      );
    await removeGeo(ctx, l);
    const r = await ctx.db
      .query("listingLocations")
      .withIndex("by_listing", (q) => q.eq("listingId", l._id))
      .unique();
    if (r) await ctx.db.delete(r._id);
    await ctx.db.patch(l._id, {
      address: args.address.trim(),
      mapLatitude: undefined,
      mapLongitude: undefined,
      locationConfirmedAt: undefined,
      revision: (l.revision ?? 0) + 1,
      approvalStatus: "pending",
      approvedRevision: undefined,
      status: "pending",
    });
    await ctx.db.insert("locationAudit", {
      listingId: l._id,
      actorId: user._id,
      action: "address_corrected",
      note: args.note.trim(),
      createdAt: Date.now(),
    });
    return null;
  },
});

export const reindex = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("listings")
      .paginate({ cursor: args.cursor, numItems: 8 });
    for (const l of page.page) await syncGeo(ctx, l);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.geo.reindex, {
        cursor: page.continueCursor,
      });
    return null;
  },
});

export const history = query({
  args: {
    listingId: v.id("listings"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      action: v.string(),
      note: v.string(),
      createdAt: v.number(),
      actorId: v.id("users"),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") throw new Error("Staff access required.");
    const page = await ctx.db
      .query("locationAudit")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, args.paginationOpts.numItems),
      });
    return {
      ...page,
      page: page.page.map(({ action, note, createdAt, actorId }) => ({
        action,
        note,
        createdAt,
        actorId,
      })),
    };
  },
});
export const cleanupRequests = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("geoRequests")
      .withIndex("by_time", (q) => q.lt("createdAt", Date.now() - 7 * 86400000))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.geo.cleanupRequests, {});
    return null;
  },
});

export const capabilities = query({
  args: {},
  returns: v.object({
    provider: v.union(v.literal("census"), v.literal("geoapify")),
    placeNames: v.boolean(),
  }),
  handler: async () => ({
    provider: process.env.GEOAPIFY_API_KEY
      ? ("geoapify" as const)
      : ("census" as const),
    placeNames: !!process.env.GEOAPIFY_API_KEY,
  }),
});
