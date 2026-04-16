"use client";

import { useState, useCallback } from "react";
import { MapPin, X } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";

export type MapListing = {
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

type Props = {
  listings: MapListing[];
  selectedId?: string | null;
  onSelectListing?: (id: string | null) => void;
  center?: { lat: number; lng: number };
};

// Converts lat/lng to pixel position within the map container
function latLngToPercent(
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
) {
  const x =
    ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  const y =
    ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
  return { x: Math.max(2, Math.min(96, x)), y: Math.max(2, Math.min(96, y)) };
}

export default function MapView({
  listings,
  selectedId,
  onSelectListing,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const bounds = useCallback(() => {
    if (!listings.length) {
      return { minLat: 25, maxLat: 48, minLng: -125, maxLng: -66 };
    }
    const lats = listings.map((l) => l.lat);
    const lngs = listings.map((l) => l.lng);
    const pad = 0.5;
    return {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    };
  }, [listings])();

  const selected = listings.find((l) => l.id === selectedId);

  return (
    <div className="relative w-full h-full bg-[#e8f0f7] rounded-xl overflow-hidden border border-gray-200">
      {/* Stylized map background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #dce8f5 0%, #c8dded 30%, #b8d4e8 60%, #a8ccdf 100%)",
        }}
      >
        {/* Grid lines to simulate map */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="grid"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="#4a90c4"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Simulated roads */}
        <svg
          className="absolute inset-0 w-full h-full opacity-30"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="0" y1="30%" x2="100%" y2="35%" stroke="white" strokeWidth="2" />
          <line x1="0" y1="55%" x2="100%" y2="50%" stroke="white" strokeWidth="2" />
          <line x1="25%" y1="0" x2="20%" y2="100%" stroke="white" strokeWidth="1.5" />
          <line x1="55%" y1="0" x2="60%" y2="100%" stroke="white" strokeWidth="1.5" />
          <line x1="80%" y1="0" x2="75%" y2="100%" stroke="white" strokeWidth="1" />
        </svg>
      </div>

      {/* Price pins */}
      {listings.map((listing) => {
        const { x, y } = latLngToPercent(listing.lat, listing.lng, bounds);
        const isSelected = selectedId === listing.id;
        const isHovered = hoveredId === listing.id;
        const active = isSelected || isHovered;

        return (
          <button
            key={listing.id}
            onClick={() => onSelectListing?.(isSelected ? null : listing.id)}
            onMouseEnter={() => setHoveredId(listing.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={cn(
              "absolute transform -translate-x-1/2 -translate-y-1/2 z-10 transition-all duration-150",
              active ? "z-20 scale-110" : "hover:z-20 hover:scale-105"
            )}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-bold shadow-lg border-2 transition-all whitespace-nowrap",
                active
                  ? "bg-[#1e3a8a] text-white border-white scale-110"
                  : "bg-white text-[#1e3a8a] border-[#1e3a8a] hover:bg-[#1e3a8a] hover:text-white"
              )}
            >
              {formatPrice(listing.price)}
            </div>
          </button>
        );
      })}

      {/* Selected listing popup */}
      {selected && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => onSelectListing?.(null)}
            className="absolute top-2 right-2 z-10 bg-white rounded-full p-1 shadow hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5 text-gray-600" />
          </button>

          {selected.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.photos[0]}
              alt={selected.title}
              className="w-full h-36 object-cover"
            />
          ) : (
            <div className="w-full h-36 bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-blue-400" />
            </div>
          )}

          <div className="p-3">
            <p className="font-semibold text-sm text-gray-900 truncate">
              {selected.title}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {selected.city}, {selected.state}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-blue-700 font-bold text-sm">
                {formatPrice(selected.price)}/mo
              </span>
              <span className="text-xs text-gray-500">
                {selected.bedrooms} bd · {selected.bathrooms} ba
              </span>
            </div>
            <a
              href={`/listings/${selected.id}`}
              className="mt-2 block w-full text-center text-xs bg-[#1e3a8a] text-white py-1.5 rounded-lg hover:bg-blue-900 transition-colors font-medium"
            >
              View Listing
            </a>
          </div>
        </div>
      )}

      {/* Map attribution */}
      <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 bg-white/70 px-1.5 py-0.5 rounded">
        Interactive Map
      </div>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
        <button className="w-8 h-8 bg-white rounded shadow text-gray-700 font-bold text-lg hover:bg-gray-50 flex items-center justify-center">
          +
        </button>
        <button className="w-8 h-8 bg-white rounded shadow text-gray-700 font-bold text-lg hover:bg-gray-50 flex items-center justify-center">
          −
        </button>
      </div>

      {/* Fullscreen button */}
      <button className="absolute top-3 left-3 z-10 bg-white rounded shadow p-1.5 hover:bg-gray-50">
        <svg
          className="w-4 h-4 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
          />
        </svg>
      </button>
    </div>
  );
}
