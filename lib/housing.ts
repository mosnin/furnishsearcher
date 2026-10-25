import { v, type Infer } from "convex/values";
import type { Doc } from "../convex/_generated/dataModel";
import { housingCriteria } from "../convex/validators/housing";
import { DAY, isAvailable, validateStay } from "./stays";
import { normalizeCity, normalizeState, US_STATES } from "./locations";

const criteria = v.object(housingCriteria);
export type HousingCriteria = Infer<typeof criteria>;

export function prepareCriteria(input: HousingCriteria) {
  const moveOutDate =
    input.moveOutDate ?? input.moveInDate + input.duration * 30 * DAY;
  validateStay(input.moveInDate, moveOutDate);
  if (input.moveInDate < Math.floor(Date.now() / DAY) * DAY)
    throw new Error("Move-in cannot be in the past.");
  const city = input.city.trim().replace(/\s+/g, " "),
    state = normalizeState(input.state);
  if (!city || city.length > 100 || !US_STATES[state])
    throw new Error("Enter a city and a U.S. state.");
  if (
    !Number.isInteger(input.duration) ||
    input.duration < 1 ||
    input.duration > 36
  )
    throw new Error("Choose a duration of 1–36 months.");
  if (
    !Number.isFinite(input.maxBudget) ||
    input.maxBudget <= 0 ||
    input.maxBudget > 1000000
  )
    throw new Error("Enter a valid monthly budget.");
  if (
    !Number.isInteger(input.bedrooms) ||
    input.bedrooms < 0 ||
    input.bedrooms > 30
  )
    throw new Error("Enter 0–30 bedrooms.");
  if (
    input.occupants !== undefined &&
    (!Number.isInteger(input.occupants) ||
      input.occupants < 1 ||
      input.occupants > 30)
  )
    throw new Error("Enter 1–30 occupants.");
  if (
    input.description.length > 2000 ||
    (input.workplace?.length ?? 0) > 200 ||
    (input.propertyType?.length ?? 0) > 80
  )
    throw new Error("Please shorten your request details.");
  const nearbyCities = [
    ...new Map(
      (input.nearbyCities ?? []).map((c) => [
        normalizeCity(c),
        c.trim().replace(/\s+/g, " "),
      ]),
    ).values(),
  ].filter((c) => normalizeCity(c) !== normalizeCity(city));
  if (nearbyCities.length > 5 || nearbyCities.some((c) => !c || c.length > 100))
    throw new Error("Include up to five nearby cities.");
  const amenities = [...new Set(input.amenities ?? [])];
  if (
    amenities.length > 30 ||
    amenities.some((a) => a.length > 80 || !a.trim())
  )
    throw new Error("Choose up to 30 amenities.");
  return {
    ...input,
    allowUnmatched: input.allowUnmatched === true,
    city,
    state,
    moveOutDate,
    duration: Math.ceil((moveOutDate - input.moveInDate) / (30 * DAY)),
    nearbyCities,
    amenities,
    description: input.description.trim(),
    workplace: input.workplace?.trim(),
    contactPreference: input.contactPreference ?? ("platform" as const),
  };
}

export function housingAreaMatches(
  listing: Doc<"listings">,
  request: HousingCriteria,
) {
  const cities = [request.city, ...(request.nearbyCities ?? [])].map(
    normalizeCity,
  );
  return (
    listing.status === "active" &&
    normalizeState(listing.state) === normalizeState(request.state) &&
    cities.includes(normalizeCity(listing.city))
  );
}
export function housingDifferences(
  listing: Doc<"listings">,
  request: HousingCriteria,
) {
  const differences: { field: string; requested: string; offered: string }[] =
    [];
  const add = (field: string, requested: string, offered: string) =>
    differences.push({ field, requested, offered });
  if (listing.price > request.maxBudget)
    add(
      "Monthly budget",
      `${request.maxBudget.toFixed(2)} USD maximum`,
      `${listing.price.toFixed(2)} USD listed`,
    );
  if (listing.bedrooms < request.bedrooms)
    add("Bedrooms", `At least ${request.bedrooms}`, `${listing.bedrooms}`);
  if (request.petFriendly && !listing.petFriendly)
    add("Pets", "Pets allowed", "Pets not allowed");
  if (
    request.propertyType &&
    listing.propertyType.toLowerCase() !== request.propertyType.toLowerCase()
  )
    add("Property type", request.propertyType, listing.propertyType);
  if (request.utilitiesIncluded && !listing.utilitiesIncluded)
    add("Utilities", "Included", "Not included");
  if (request.parkingIncluded && !listing.parkingIncluded)
    add("Parking", "Included", "Not included");
  if (
    listing.maxOccupancy !== undefined &&
    (request.occupants ?? 1) > listing.maxOccupancy
  )
    add(
      "Occupants",
      `${request.occupants ?? 1}`,
      `Maximum ${listing.maxOccupancy}`,
    );
  const missing = (request.amenities ?? []).filter(
    (a) => !listing.amenities.some((b) => a.toLowerCase() === b.toLowerCase()),
  );
  if (missing.length)
    add("Amenities", missing.join(", "), "Not listed for this rental space");
  return differences;
}
export function matchesCriteria(
  listing: Doc<"listings">,
  request: HousingCriteria,
) {
  return (
    housingAreaMatches(listing, request) &&
    housingDifferences(listing, request).length === 0 &&
    isAvailable(
      listing,
      [],
      request.moveInDate,
      request.moveOutDate ?? request.moveInDate + request.duration * 30 * DAY,
    )
  );
}
