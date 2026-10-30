"use client";

export type MapListing = {
  href?: string;
  id: string;
  title: string;
  price: number;
  lat: number;
  lng: number;
  city: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  photos: string[];
};

// Keep the legacy entry point on the real map implementation.
export { default } from "./leaflet-map";
