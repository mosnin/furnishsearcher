import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatDate(date: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

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
] as const;

export const BUDGET_OPTIONS = [
  { label: "Under $1,500/mo", value: "1500" },
  { label: "Under $2,000/mo", value: "2000" },
  { label: "Under $2,500/mo", value: "2500" },
  { label: "Under $3,000/mo", value: "3000" },
  { label: "Under $4,000/mo", value: "4000" },
  { label: "Under $5,000/mo", value: "5000" },
  { label: "$5,000+/mo", value: "9999" },
] as const;
