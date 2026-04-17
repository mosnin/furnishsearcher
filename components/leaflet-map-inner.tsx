"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapListing } from "@/components/map-view";
import { formatPrice } from "@/lib/utils";

// Fix Leaflet default icon issue caused by webpack asset bundling
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Props = {
  listings: MapListing[];
  selectedId?: string | null;
  onSelectListing?: (id: string | null) => void;
};

/** Creates a DivIcon price pin in navy pill style */
function createPriceIcon(price: number, selected: boolean): L.DivIcon {
  const label = formatPrice(price);
  if (selected) {
    return L.divIcon({
      className: "",
      html: `<div style="
        background:#1e40af;
        color:#fff;
        border:2.5px solid #fff;
        border-radius:9999px;
        padding:5px 12px;
        font-size:13px;
        font-weight:700;
        font-family:inherit;
        white-space:nowrap;
        box-shadow:0 4px 12px rgba(0,0,0,0.35);
        transform:scale(1.15);
        transform-origin:center bottom;
        cursor:pointer;
      ">${label}</div>`,
      iconAnchor: [28, 20],
      popupAnchor: [0, -24],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div style="
      background:#1e3a8a;
      color:#fff;
      border:2px solid #fff;
      border-radius:9999px;
      padding:4px 10px;
      font-size:12px;
      font-weight:700;
      font-family:inherit;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      cursor:pointer;
    ">${label}</div>`,
    iconAnchor: [24, 16],
    popupAnchor: [0, -20],
  });
}

/** Inner component that uses the map context to fit bounds */
function BoundsFitter({ listings }: { listings: MapListing[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (listings.length === 0) return;
    const bounds = L.latLngBounds(listings.map((l) => [l.lat, l.lng]));
    // Pad so pins aren't right at the edge; only auto-fit on first load
    if (!fitted.current) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
      fitted.current = true;
    }
  }, [map, listings]);

  return null;
}

export default function LeafletMapInner({
  listings,
  selectedId,
  onSelectListing,
}: Props) {
  // Determine a sensible default center
  const defaultCenter: [number, number] =
    listings.length > 0
      ? [listings[0].lat, listings[0].lng]
      : [39.5, -98.35]; // geographic center of the US

  const selected = listings.find((l) => l.id === selectedId) ?? null;

  return (
    <MapContainer
      center={defaultCenter}
      zoom={listings.length > 0 ? 10 : 4}
      scrollWheelZoom={true}
      style={{ width: "100%", height: "100%", borderRadius: "0.75rem" }}
      className="z-0"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <BoundsFitter listings={listings} />

      {listings.map((listing) => {
        const isSelected = selectedId === listing.id;
        const icon = createPriceIcon(listing.price, isSelected);

        return (
          <Marker
            key={listing.id}
            position={[listing.lat, listing.lng]}
            icon={icon}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={{
              click: () => {
                onSelectListing?.(isSelected ? null : listing.id);
              },
            }}
          >
            {isSelected && selected && (
              <Popup
                autoPan
                closeButton={true}
                eventHandlers={{ remove: () => onSelectListing?.(null) }}
              >
                <div style={{ minWidth: 200, maxWidth: 240, fontFamily: "inherit" }}>
                  <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 2px", lineHeight: 1.3 }}>
                    {selected.title}
                  </p>
                  <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 6px" }}>
                    {selected.city}, {selected.state}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ color: "#1e3a8a", fontWeight: 700, fontSize: 15 }}>
                      {formatPrice(selected.price)}
                      <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 11 }}>/mo</span>
                    </span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>
                      {selected.bedrooms} bd &middot; {selected.bathrooms} ba
                    </span>
                  </div>
                  <a
                    href={`/listings/${selected.id}`}
                    style={{
                      display: "block",
                      textAlign: "center",
                      background: "#1e3a8a",
                      color: "#fff",
                      padding: "6px 0",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    View Listing
                  </a>
                </div>
              </Popup>
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
