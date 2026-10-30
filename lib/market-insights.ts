import { normalizeCity, normalizeState, US_STATES } from "./locations";
import { AMENITIES, PROPERTY_TYPES } from "./search-options";
import type { SearchFilters } from "./search";
export const MARKET_DAY = 86400000;
export const MIN_MARKET_CONTRIBUTORS = 10;
export type Bucket = { dimension: string; key: string; count: number };
export function marketScope(city?: string, state?: string) {
  if (!city && !state) return "all";
  const c = normalizeCity(city ?? ""),
    s = normalizeState(state ?? "");
  if (!c || c.length > 100 || !US_STATES[s] || /[\u0000-\u001f|]/.test(c))
    throw new Error("Choose a city and US state together.");
  return `${s}|${c}`;
}
export const bedroomBucket = (n?: number) =>
  n === undefined ? "Any" : n === 0 ? "Studio" : n >= 4 ? "4+" : String(n);
export const budgetBucket = (n?: number) =>
  n === undefined
    ? "Not specified"
    : n < 1000
      ? "Under $1,000"
      : n < 2000
        ? "$1,000–1,999"
        : n < 3000
          ? "$2,000–2,999"
          : n < 4000
            ? "$3,000–3,999"
            : "$4,000+";
export type DemandShape = {
  city?: string;
  state?: string;
  bedrooms: string;
  budget: string;
  types: string[];
  amenities: string[];
  pets: boolean;
  lead: string;
  duration: string;
};
export function demandShape(
  filters: SearchFilters,
  now = Date.now(),
): DemandShape {
  const city = filters.city?.trim().replace(/\s+/g, " "),
    state = filters.state ? normalizeState(filters.state) : undefined;
  const hasCity = city && state && US_STATES[state];
  const days =
    filters.moveIn === undefined
      ? undefined
      : Math.max(0, (filters.moveIn - now) / MARKET_DAY);
  const duration =
    filters.moveIn !== undefined && filters.moveOut !== undefined
      ? (filters.moveOut - filters.moveIn) / MARKET_DAY
      : undefined;
  return {
    ...(hasCity ? { city, state } : {}),
    bedrooms: bedroomBucket(filters.bedrooms),
    budget: budgetBucket(filters.maxPrice),
    types: [
      ...new Set(
        [
          ...(filters.propertyTypes ?? []),
          ...(filters.propertyType ? [filters.propertyType] : []),
        ].filter((x) => (PROPERTY_TYPES as readonly string[]).includes(x)),
      ),
    ].sort(),
    amenities: [
      ...new Set(
        (filters.amenities ?? []).filter((x) =>
          (AMENITIES as readonly string[]).includes(x),
        ),
      ),
    ].sort(),
    pets: filters.petFriendly === true,
    lead:
      days === undefined
        ? "Not specified"
        : days < 30
          ? "Under 30 days"
          : days < 90
            ? "30–89 days"
            : "90+ days",
    duration:
      duration === undefined
        ? "Not specified"
        : duration <= 60
          ? "30–60 days"
          : duration <= 90
            ? "61–90 days"
            : duration <= 180
              ? "91–180 days"
              : "181+ days",
  };
}
export function shapeBuckets(shape: DemandShape): Bucket[] {
  return [
    { dimension: "bedrooms", key: shape.bedrooms, count: 1 },
    { dimension: "budget", key: shape.budget, count: 1 },
    ...(shape.types.length ? shape.types : ["Any"]).map((key) => ({
      dimension: "type",
      key,
      count: 1,
    })),
    ...shape.amenities.map((key) => ({ dimension: "amenity", key, count: 1 })),
    {
      dimension: "pets",
      key: shape.pets ? "Pet-friendly requested" : "Not requested",
      count: 1,
    },
    { dimension: "lead", key: shape.lead, count: 1 },
    { dimension: "duration", key: shape.duration, count: 1 },
  ];
}
export function mergeBuckets(a: Bucket[], b: Bucket[]): Bucket[] {
  const map = new Map(a.map((x) => [`${x.dimension}|${x.key}`, { ...x }]));
  for (const x of b) {
    const key = `${x.dimension}|${x.key}`;
    const previous = map.get(key);
    if (previous) previous.count += x.count;
    else map.set(key, { ...x });
  }
  return [...map.values()].sort(
    (x, y) =>
      x.dimension.localeCompare(y.dimension) || x.key.localeCompare(y.key),
  );
}
