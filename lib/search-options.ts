export const PROPERTY_TYPES = [
  "Apartment",
  "House",
  "Condo",
  "Studio",
  "Townhouse",
  "Room",
] as const;
export const AMENITIES = [
  "WiFi",
  "Parking",
  "Washer/Dryer",
  "Air Conditioning",
  "Heating",
  "Kitchen",
  "Gym",
  "Pool",
  "Pet Friendly",
  "Dishwasher",
  "TV",
  "Balcony",
  "Utilities Included",
  "Elevator",
  "Doorman",
  "Dedicated Workspace",
  "Step-free Entry",
  "Wheelchair Accessible",
  "Accessible Bathroom",
] as const;
export const SORT_OPTIONS = [
  "newest",
  "price_asc",
  "price_desc",
  "most_viewed",
] as const;

// These features have their own labeled switches in the owner editor.
export const OWNER_AMENITIES = AMENITIES.filter(
  (label) => !["Pet Friendly", "Parking", "Utilities Included"].includes(label),
);
