import { normalizeState } from "./locations";
export type Point = { latitude: number; longitude: number };
export type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};
export function validatePoint(p: Point) {
  if (
    !Number.isFinite(p.latitude) ||
    !Number.isFinite(p.longitude) ||
    Math.abs(p.latitude) > 85 ||
    p.longitude < -180 ||
    p.longitude > 180
  )
    throw new Error("Choose a valid map location.");
  return p;
}
export function validateBounds(b: Bounds) {
  validatePoint({ latitude: b.south, longitude: b.west });
  validatePoint({ latitude: b.north, longitude: b.east });
  const span = (b.east - b.west + 360) % 360;
  if (b.south >= b.north || span === 0 || span >= 180)
    throw new Error("Zoom in to a map area narrower than half the globe.");
  return b;
}
/** Public cell centers only. Exact source coordinates must never reach public filters or the spatial index. */
export function approximatePoint(p: Point): Point {
  validatePoint(p);
  return {
    latitude: Number(
      Math.min(
        84.995,
        Math.max(-84.995, Math.floor(p.latitude * 100) / 100 + 0.005),
      ).toFixed(3),
    ),
    longitude: Number(
      Math.min(
        179.995,
        Math.max(-179.995, Math.floor(p.longitude * 100) / 100 + 0.005),
      ).toFixed(3),
    ),
  };
}
export function distanceMiles(a: Point, b: Point) {
  const rad = (x: number) => (x * Math.PI) / 180,
    dlat = rad(b.latitude - a.latitude),
    dlng = rad(b.longitude - a.longitude);
  const x =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dlng / 2) ** 2;
  return (
    3958.7613 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)))
  );
}
export function contains(b: Bounds, p: Point) {
  return (
    p.latitude >= b.south &&
    p.latitude <= b.north &&
    (b.west <= b.east
      ? p.longitude >= b.west && p.longitude <= b.east
      : p.longitude >= b.west || p.longitude <= b.east)
  );
}
export function wrapLongitude(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}
export function radiusBounds(p: Point, miles: number): Bounds {
  validatePoint(p);
  const angle = miles / 3958.7613,
    latitude = (angle * 180) / Math.PI,
    longitude =
      (Math.asin(
        Math.min(1, Math.sin(angle) / Math.cos((p.latitude * Math.PI) / 180)),
      ) *
        180) /
      Math.PI;
  return {
    south: Math.max(-85, p.latitude - latitude),
    north: Math.min(85, p.latitude + latitude),
    west: wrapLongitude(p.longitude - longitude),
    east: wrapLongitude(p.longitude + longitude),
  };
}
export function addressKey(a: {
  address: string;
  city: string;
  state: string;
  zip: string;
}) {
  return [a.address, a.city, normalizeState(a.state), a.zip]
    .map((x) => x.trim().replace(/\s+/g, " ").toUpperCase())
    .join("|");
}
export type PlaceCandidate = Point & {
  label: string;
  provider: "census" | "geoapify";
  placeId?: string;
};
export function parseCensus(value: any): PlaceCandidate[] {
  return (
    Array.isArray(value?.result?.addressMatches)
      ? value.result.addressMatches
      : []
  )
    .slice(0, 5)
    .flatMap((m: any) => {
      try {
        const p = validatePoint({
          latitude: m.coordinates?.y,
          longitude: m.coordinates?.x,
        });
        if (
          typeof m.matchedAddress !== "string" ||
          m.matchedAddress.length > 500
        )
          return [];
        return [{ ...p, label: m.matchedAddress, provider: "census" as const }];
      } catch {
        return [];
      }
    });
}
export function parseGeoapify(value: any): PlaceCandidate[] {
  return (Array.isArray(value?.features) ? value.features : [])
    .slice(0, 5)
    .flatMap((f: any) => {
      try {
        const p = validatePoint({
          latitude: f.properties?.lat,
          longitude: f.properties?.lon,
        });
        if (
          f.properties?.country_code !== "us" ||
          typeof f.properties?.formatted !== "string" ||
          f.properties.formatted.length > 500
        )
          return [];
        return [
          {
            ...p,
            label: f.properties.formatted,
            provider: "geoapify" as const,
            placeId:
              typeof f.properties.place_id === "string"
                ? f.properties.place_id
                : undefined,
          },
        ];
      } catch {
        return [];
      }
    });
}
