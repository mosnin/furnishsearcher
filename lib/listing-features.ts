/** The dedicated flags are authoritative for these overlapping amenity labels. */
export function listingAmenities(listing: {
  amenities: readonly string[];
  petFriendly: boolean;
  parkingIncluded: boolean;
  utilitiesIncluded: boolean;
}): string[] {
  const aliases = new Set(["pet friendly", "parking", "utilities included"]);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of listing.amenities) {
    const label = value.trim(),
      key = label.toLowerCase();
    if (!label || aliases.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  for (const [enabled, label] of [
    [listing.petFriendly, "Pet Friendly"],
    [listing.parkingIncluded, "Parking"],
    [listing.utilitiesIncluded, "Utilities Included"],
  ] as const)
    if (enabled) result.push(label);
  return result;
}
