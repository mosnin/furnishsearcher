import {
  validatePoint,
  validateBounds,
  contains,
  distanceMiles,
  type Bounds,
} from "./geo";
import { DAY, validateStay, searchDateRange } from "./stays";
import { normalizeCity, normalizeState, US_STATES } from "./locations";
import { AMENITIES, PROPERTY_TYPES, SORT_OPTIONS } from "./search-options";
export type SearchFilters = {
  mapBounds?: Bounds;
  nearLatitude?: number;
  nearLongitude?: number;
  radiusMiles?: number;
  nearLabel?: string;
  location?: string;
  city?: string;
  state?: string;
  propertyId?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  occupants?: number;
  propertyType?: string;
  propertyTypes?: string[];
  petFriendly?: boolean;
  utilitiesIncluded?: boolean;
  parkingIncluded?: boolean;
  amenities?: string[];
  moveIn?: number;
  moveOut?: number;
  flexibleDays?: number;
  sort?: (typeof SORT_OPTIONS)[number];
};
export const SEARCH_KEYS = [
  "mapBounds",
  "nearLatitude",
  "nearLongitude",
  "radiusMiles",
  "nearLabel",
  "location",
  "city",
  "state",
  "propertyId",
  "minPrice",
  "maxPrice",
  "bedrooms",
  "bathrooms",
  "occupants",
  "propertyType",
  "propertyTypes",
  "petFriendly",
  "utilitiesIncluded",
  "parkingIncluded",
  "amenities",
  "moveIn",
  "moveOut",
  "flexibleDays",
  "sort",
] as const;
export function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Use a valid calendar date.");
  const date = Date.parse(value);
  if (
    !Number.isFinite(date) ||
    new Date(date).toISOString().slice(0, 10) !== value
  )
    throw new Error("Use a valid calendar date.");
  return date;
}
export function normalizeSearch(input: SearchFilters): SearchFilters {
  const result: SearchFilters = {};
  if (input.mapBounds) result.mapBounds = validateBounds(input.mapBounds);
  if (
    input.nearLatitude !== undefined ||
    input.nearLongitude !== undefined ||
    input.radiusMiles !== undefined ||
    input.nearLabel
  ) {
    if (
      input.nearLatitude === undefined ||
      input.nearLongitude === undefined ||
      input.radiusMiles === undefined
    )
      throw new Error("Choose a reference location and distance together.");
    validatePoint({
      latitude: input.nearLatitude,
      longitude: input.nearLongitude,
    });
    if (
      !Number.isFinite(input.radiusMiles) ||
      input.radiusMiles < 0.5 ||
      input.radiusMiles > 100
    )
      throw new Error("Choose a distance from 0.5 to 100 miles.");
    result.nearLatitude = input.nearLatitude;
    result.nearLongitude = input.nearLongitude;
    result.radiusMiles = input.radiusMiles;
    if (input.nearLabel) {
      if (input.nearLabel.length > 200)
        throw new Error("Reference location label is too long.");
      result.nearLabel = input.nearLabel.trim();
    }
  }

  for (const key of ["location", "city", "state", "propertyId"] as const) {
    const value = input[key]?.trim().replace(/\s+/g, " ");
    if (value && value.length > (key === "location" ? 200 : 128))
      throw new Error("Search location or property ID is too long.");
    if (value) result[key] = value;
  }
  if (result.state) result.state = normalizeState(result.state);
  if (result.propertyId)
    result.propertyId = result.propertyId.replace(/^fs[ -]?(\d+)$/i, "FS-$1");
  if (
    !result.propertyId &&
    result.location &&
    /^fs[ -]?\d+$/i.test(result.location)
  ) {
    result.propertyId = result.location.replace(/^fs[ -]?(\d+)$/i, "FS-$1");
    delete result.location;
  }
  // An explicit city/state pair avoids dependence on the small autocomplete catalog.
  if (!result.city && result.location?.includes(",")) {
    const parts = result.location.split(",");
    if (parts.length === 2 && US_STATES[normalizeState(parts[1])]) {
      result.city = parts[0].trim();
      result.state = normalizeState(parts[1]);
      delete result.location;
    }
  }
  for (const key of [
    "minPrice",
    "maxPrice",
    "bedrooms",
    "bathrooms",
    "occupants",
  ] as const) {
    const value = input[key];
    if (value === undefined) continue;
    const max = key.includes("Price") ? 10_000_000 : 30;
    if (
      !Number.isFinite(value) ||
      value < (key === "occupants" ? 1 : 0) ||
      value > max ||
      (key !== "minPrice" &&
        key !== "maxPrice" &&
        key !== "bathrooms" &&
        !Number.isInteger(value))
    )
      throw new Error("Enter a valid price, room count or occupancy.");
    result[key] = value;
  }
  if (
    result.minPrice !== undefined &&
    result.maxPrice !== undefined &&
    result.minPrice > result.maxPrice
  )
    throw new Error("Minimum rent cannot exceed maximum rent.");
  const types =
    input.propertyTypes ?? (input.propertyType ? [input.propertyType] : []);
  if (types.length > 10 || (input.amenities?.length ?? 0) > 40)
    throw new Error("Too many search filters.");
  const normalizedTypes = [
    ...new Set(
      types.map((value) => {
        const type = PROPERTY_TYPES.find(
          (t) => t.toLowerCase() === value.trim().toLowerCase(),
        );
        if (!type) throw new Error("Unknown property type.");
        return type;
      }),
    ),
  ].sort();
  if (normalizedTypes.length) result.propertyTypes = normalizedTypes;
  const amenities = [
    ...new Set(
      (input.amenities ?? []).map((value) => {
        const amenity = AMENITIES.find(
          (a) => a.toLowerCase() === value.trim().toLowerCase(),
        );
        if (!amenity) throw new Error("Unknown amenity.");
        return amenity;
      }),
    ),
  ].sort();
  if (amenities.length) result.amenities = amenities;
  for (const key of [
    "petFriendly",
    "parkingIncluded",
    "utilitiesIncluded",
  ] as const)
    if (input[key] !== undefined) result[key] = input[key];
  for (const [label, key] of [
    ["Pet Friendly", "petFriendly"],
    ["Parking", "parkingIncluded"],
    ["Utilities Included", "utilitiesIncluded"],
  ] as const) {
    if (result.amenities?.includes(label)) {
      if (result[key] === false)
        throw new Error("Conflicting amenity filters.");
      result[key] = true;
      result.amenities = result.amenities.filter((a) => a !== label);
    }
  }
  if (!result.amenities?.length) delete result.amenities;
  if (
    input.flexibleDays !== undefined &&
    ![0, 7, 14, 30].includes(input.flexibleDays)
  )
    throw new Error("Choose exact dates or flexibility of 7, 14 or 30 days.");
  if (input.moveIn !== undefined || input.moveOut !== undefined) {
    if (input.moveIn === undefined || input.moveOut === undefined)
      throw new Error("Choose both stay dates.");
    validateStay(input.moveIn, input.moveOut);
    if (Math.abs(input.moveIn) > 8.64e15 || Math.abs(input.moveOut) > 8.64e15)
      throw new Error("Choose valid stay dates.");
    if (
      ![input.moveIn, input.moveOut].every((value) =>
        /^\d{4}-/.test(new Date(value).toISOString()),
      )
    )
      throw new Error("Choose dates with a four-digit year.");
    result.moveIn = input.moveIn;
    result.moveOut = input.moveOut;
    if (![0, 7, 14, 30].includes(input.flexibleDays ?? 0))
      throw new Error("Choose exact dates or flexibility of 7, 14 or 30 days.");
    if (input.flexibleDays) result.flexibleDays = input.flexibleDays;
  } else if (input.flexibleDays)
    throw new Error("Choose dates before adding flexibility.");
  if (input.sort && !SORT_OPTIONS.includes(input.sort))
    throw new Error("Choose a supported sort order.");
  result.sort = input.sort ?? "newest";
  return result;
}
export function parseSearchParams(
  params: Pick<URLSearchParams, "get" | "getAll">,
  now = new Date(),
): SearchFilters {
  const input: SearchFilters = {};
  const bounds = params.get("bounds");
  if (bounds) {
    const values = bounds.split(",").map(Number);
    if (values.length !== 4) throw new Error("Choose valid map bounds.");
    input.mapBounds = {
      south: values[0],
      west: values[1],
      north: values[2],
      east: values[3],
    };
  }
  for (const key of ["nearLatitude", "nearLongitude", "radiusMiles"] as const) {
    const value = params.get(key);
    if (value !== null && value !== "") input[key] = Number(value);
  }
  input.nearLabel = params.get("nearLabel") || undefined;

  for (const key of ["location", "city", "state", "propertyId"] as const)
    input[key] = params.get(key) || undefined;
  for (const key of [
    "minPrice",
    "maxPrice",
    "bedrooms",
    "bathrooms",
    "occupants",
    "flexibleDays",
  ] as const) {
    const value =
      params.get(key) ?? (key === "maxPrice" ? params.get("budget") : null);
    if (
      value !== null &&
      value !== "" &&
      !(key === "maxPrice" && value === "any")
    )
      input[key] = Number(value);
  }
  for (const key of [
    "petFriendly",
    "utilitiesIncluded",
    "parkingIncluded",
  ] as const) {
    const value = params.get(key);
    if (value === null || value === "") continue;
    if (!["true", "false", "1", "0"].includes(value))
      throw new Error("Invalid filter value.");
    input[key] = value === "true" || value === "1";
  }
  input.propertyTypes = params.getAll("propertyType").filter(Boolean);
  input.amenities = params.getAll("amenity").filter(Boolean);
  const start = params.get("moveIn"),
    end = params.get("moveOut");
  if (start || end) {
    if (!start || !end) throw new Error("Choose both stay dates.");
    input.moveIn = parseDate(start);
    input.moveOut = parseDate(end);
  } else if (params.get("date"))
    Object.assign(input, searchDateRange(params.get("date")!, now));
  input.sort = (params.get("sort") || undefined) as SearchFilters["sort"];
  return normalizeSearch(input);
}
export function searchParams(filters: SearchFilters) {
  const f = normalizeSearch(filters),
    params = new URLSearchParams();
  for (const key of [
    "location",
    "city",
    "state",
    "propertyId",
    "minPrice",
    "maxPrice",
    "bedrooms",
    "bathrooms",
    "occupants",
    "petFriendly",
    "utilitiesIncluded",
    "parkingIncluded",
    "flexibleDays",
  ] as const)
    if (f[key] !== undefined) params.set(key, String(f[key]));
  for (const key of [
    "nearLatitude",
    "nearLongitude",
    "radiusMiles",
    "nearLabel",
  ] as const)
    if (f[key] !== undefined) params.set(key, String(f[key]));
  if (f.mapBounds)
    params.set(
      "bounds",
      [
        f.mapBounds.south,
        f.mapBounds.west,
        f.mapBounds.north,
        f.mapBounds.east,
      ].join(","),
    );
  if (f.moveIn !== undefined) {
    params.set("moveIn", new Date(f.moveIn).toISOString().slice(0, 10));
    params.set("moveOut", new Date(f.moveOut!).toISOString().slice(0, 10));
  }
  for (const type of f.propertyTypes ?? []) params.append("propertyType", type);
  for (const amenity of f.amenities ?? []) params.append("amenity", amenity);
  if (f.sort !== "newest") params.set("sort", f.sort!);
  return params;
}
export function buildSearchUrl(filters: SearchFilters) {
  const query = searchParams(filters).toString();
  return `/search${query ? `?${query}` : ""}`;
}
export function criteriaOnly(value: SearchFilters): SearchFilters {
  return Object.fromEntries(
    SEARCH_KEYS.filter((k) => value[k] !== undefined).map((k) => [k, value[k]]),
  );
}

type Listing = {
  mapLatitude?: number;
  mapLongitude?: number;
  _id?: string;
  city: string;
  state: string;
  zip: string;
  title: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  maxOccupancy?: number;
  propertyType: string;
  amenities: string[];
  petFriendly: boolean;
  utilitiesIncluded: boolean;
  parkingIncluded: boolean;
};
export function matchesSearch(listing: Listing, f: SearchFilters) {
  if (f.mapBounds || f.nearLatitude !== undefined) {
    if (listing.mapLatitude === undefined || listing.mapLongitude === undefined)
      return false;
    const p = {
      latitude: listing.mapLatitude,
      longitude: listing.mapLongitude,
    };
    if (f.mapBounds && !contains(f.mapBounds, p)) return false;
    if (
      f.nearLatitude !== undefined &&
      distanceMiles(
        { latitude: f.nearLatitude, longitude: f.nearLongitude! },
        p,
      ) > f.radiusMiles!
    )
      return false;
  }

  if (f.city && normalizeCity(listing.city) !== normalizeCity(f.city))
    return false;
  if (f.state && normalizeState(listing.state) !== normalizeState(f.state))
    return false;
  if (f.location && f.location !== listing._id) {
    const haystack =
      `${listing.city} ${listing.state} ${US_STATES[normalizeState(listing.state)] ?? ""} ${listing.zip} ${listing.title}`.toLowerCase();
    if (
      !f.location
        .toLowerCase()
        .split(/[ ,]+/)
        .filter(Boolean)
        .every((t) => haystack.includes(t))
    )
      return false;
  }
  if (
    (f.minPrice !== undefined && listing.price < f.minPrice) ||
    (f.maxPrice !== undefined && listing.price > f.maxPrice)
  )
    return false;
  if (
    (f.bedrooms !== undefined && listing.bedrooms < f.bedrooms) ||
    (f.bathrooms !== undefined && listing.bathrooms < f.bathrooms)
  )
    return false;
  if (
    f.occupants !== undefined &&
    (listing.maxOccupancy === undefined || listing.maxOccupancy < f.occupants)
  )
    return false;
  if (
    f.propertyTypes?.length &&
    !f.propertyTypes.some(
      (t) => t.toLowerCase() === listing.propertyType.toLowerCase(),
    )
  )
    return false;
  for (const key of [
    "petFriendly",
    "utilitiesIncluded",
    "parkingIncluded",
  ] as const)
    if (f[key] !== undefined && listing[key] !== f[key]) return false;
  return !f.amenities?.some((a) => !listing.amenities.includes(a));
}
export function availableSearchStay(
  listing: {
    availableFrom: number;
    minStay: number;
    calendarSyncThrough?: number;
  },
  blocks: { startDate: number; endDate: number }[],
  f: SearchFilters,
  today = Math.floor(Date.now() / DAY) * DAY,
) {
  if (f.moveIn === undefined || f.moveOut === undefined) return null;
  const flex = (f.flexibleDays ?? 0) * DAY,
    minimum = Math.ceil(Math.max(1, listing.minStay) * 30) * DAY;
  const lowStart = Math.max(f.moveIn - flex, listing.availableFrom, today),
    highEnd = Math.min(
      f.moveOut + flex,
      listing.calendarSyncThrough ?? Infinity,
    );
  if (lowStart + minimum > highEnd) return null;
  const ordered = [...blocks]
    .filter((b) => b.endDate > lowStart && b.startDate < highEnd)
    .sort((a, b) => a.startDate - b.startDate);
  const free: [number, number][] = [];
  let cursor = lowStart;
  for (const b of ordered) {
    if (b.startDate > cursor) free.push([cursor, b.startDate]);
    cursor = Math.max(cursor, b.endDate);
  }
  if (cursor < highEnd) free.push([cursor, highEnd]);
  let best: {
    moveIn: number;
    moveOut: number;
    score: number;
    startDistance: number;
  } | null = null;
  for (const [a, b] of free) {
    const lastStart = Math.min(
      f.moveIn + flex,
      b - minimum,
      f.moveOut + flex - minimum,
    );
    for (
      let start = Math.ceil(a / DAY) * DAY;
      start <= lastStart;
      start += DAY
    ) {
      const lowEnd = Math.max(f.moveOut - flex, start + minimum),
        high = Math.min(f.moveOut + flex, Math.floor(b / DAY) * DAY);
      if (lowEnd > high) continue;
      const end = Math.max(lowEnd, Math.min(f.moveOut, high)),
        startDistance = Math.abs(start - f.moveIn),
        score = startDistance + Math.abs(end - f.moveOut);
      if (
        !best ||
        score < best.score ||
        (score === best.score && startDistance < best.startDistance)
      )
        best = { moveIn: start, moveOut: end, score, startDistance };
    }
  }
  return best ? { moveIn: best.moveIn, moveOut: best.moveOut } : null;
}
