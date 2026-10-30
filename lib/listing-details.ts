export interface ListingDetails {
  bathroomDetails?: { name: string; description: string }[];
  rooms: { name: string; beds: string }[];
  fees: {
    name: string;
    amount: number;
    refundable: boolean;
    frequency: "once" | "monthly";
  }[];
  smoking: "unspecified" | "allowed" | "prohibited";
  maxVehicles?: number;
  rules: string;
  facilities: { name: string; miles: number }[];
}
export const emptyListingDetails = (): ListingDetails => ({
  rooms: [],
  fees: [],
  smoking: "unspecified",
  rules: "",
  facilities: [],
});
export function validateListingDetails(
  details: ListingDetails,
): ListingDetails {
  const text = (value: string, label: string, max: number, required = true) => {
    const clean = value.trim();
    if ((required && !clean) || clean.length > max)
      throw new Error(
        `${label} must be ${required ? "1" : "0"}–${max} characters.`,
      );
    return clean;
  };
  if (
    (details.bathroomDetails?.length ?? 0) > 30 ||
    details.rooms.length > 30 ||
    details.fees.length > 20 ||
    details.facilities.length > 20
  )
    throw new Error(
      "Use at most 30 bathrooms, 30 rooms, 20 fees, and 20 nearby facilities.",
    );
  if (
    details.maxVehicles !== undefined &&
    (!Number.isInteger(details.maxVehicles) ||
      details.maxVehicles < 0 ||
      details.maxVehicles > 30)
  )
    throw new Error("Maximum vehicles must be 0–30.");
  return {
    ...details,
    ...(details.bathroomDetails
      ? {
          bathroomDetails: details.bathroomDetails.map((room) => ({
            name: text(room.name, "Bathroom name", 80),
            description: text(room.description, "Bathroom description", 300),
          })),
        }
      : {}),
    rooms: details.rooms.map((room) => ({
      name: text(room.name, "Room name", 80),
      beds: text(room.beds, "Bed configuration", 300),
    })),
    fees: details.fees.map((fee) => {
      if (
        !Number.isFinite(fee.amount) ||
        fee.amount < 0 ||
        fee.amount > 1_000_000 ||
        Math.abs(fee.amount * 100 - Math.round(fee.amount * 100)) > 0.000001
      )
        throw new Error(
          "Fee amounts must be valid dollar amounts with at most two decimal places.",
        );
      return { ...fee, name: text(fee.name, "Fee name", 80) };
    }),
    rules: text(details.rules, "House rules", 4000, false),
    facilities: details.facilities.map((facility) => {
      if (
        !Number.isFinite(facility.miles) ||
        facility.miles < 0 ||
        facility.miles > 500
      )
        throw new Error("Facility distance must be 0–500 miles.");
      return { ...facility, name: text(facility.name, "Facility name", 160) };
    }),
  };
}
