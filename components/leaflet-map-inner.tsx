"use client";
import { useEffect, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapListing } from "./map-view";
import { wrapLongitude } from "@/lib/geo";
import type { Bounds, Point } from "@/lib/geo";
import { formatPrice } from "@/lib/utils";
import { Button } from "./ui/button";
type Props = {
  listings: MapListing[];
  selectedId?: string | null;
  onSelectListing?: (id: string | null) => void;
  onViewport?: (bounds: Bounds | null) => void;
  fitKey?: string;
  bounds?: Bounds;
  reference?: Point;
};
function Viewport({
  listings,
  onViewport,
  fitKey,
  bounds,
  reference,
}: {
  listings: MapListing[];
  onViewport?: Props["onViewport"];
  fitKey?: string;
  bounds?: Bounds;
  reference?: Point;
}) {
  const map = useMap(),
    fitted = useRef<string | null>(null);
  useMapEvents({
    moveend() {
      const b = map.getBounds();
      const west = wrapLongitude(b.getWest()),
        east = wrapLongitude(b.getEast());
      if (b.getEast() - b.getWest() >= 180) {
        onViewport?.(null);
        return;
      }
      if (west !== east)
        onViewport?.({
          south: Math.max(-85, b.getSouth()),
          north: Math.min(85, b.getNorth()),
          west,
          east,
        });
    },
  });
  useEffect(() => {
    const key = fitKey ?? "initial";
    if (fitted.current === key) return;
    if (bounds) {
      map.fitBounds(
        [
          [bounds.south, bounds.west],
          [
            bounds.north,
            bounds.east < bounds.west ? bounds.east + 360 : bounds.east,
          ],
        ],
        { animate: false },
      );
      fitted.current = key;
    } else if (listings.length) {
      map.fitBounds(L.latLngBounds(listings.map((l) => [l.lat, l.lng])), {
        padding: [45, 45],
        maxZoom: 13,
        animate: false,
      });
      fitted.current = key;
    } else if (reference) {
      map.setView([reference.latitude, reference.longitude], 11, {
        animate: false,
      });
      fitted.current = key;
    }
  }, [map, listings, bounds, reference, fitKey]);
  return null;
}
export default function LeafletMapInner(p: Props) {
  const groups = useMemo(() => {
    const groups = new Map<string, MapListing[]>();
    for (const l of p.listings) {
      const key = `${l.lat},${l.lng}`;
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    return [...groups.entries()];
  }, [p.listings]);
  const selected = p.listings.find((l) => l.id === p.selectedId),
    group = selected
      ? (groups.find(([, rows]) =>
          rows.some((r) => r.id === selected.id),
        )?.[1] ?? [])
      : [];
  const index = selected ? group.findIndex((l) => l.id === selected.id) : 0;
  return (
    <MapContainer
      center={[39.5, -98.35]}
      zoom={4}
      scrollWheelZoom
      style={{ width: "100%", height: "100%", borderRadius: "0.75rem" }}
      className="z-0"
      worldCopyJump
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Viewport
        listings={p.listings}
        onViewport={p.onViewport}
        fitKey={p.fitKey}
        bounds={p.bounds}
        reference={p.reference}
      />
      {p.reference && (
        <Circle
          center={[p.reference.latitude, p.reference.longitude]}
          radius={100}
          pathOptions={{
            color: "#b45309",
            fillColor: "#f59e0b",
            fillOpacity: 0.4,
          }}
        />
      )}
      {groups.map(([key, rows]) => {
        const active = rows.some((r) => r.id === p.selectedId),
          price = Math.min(...rows.map((r) => r.price));
        const icon = L.divIcon({
          className: "",
          html: `<span style="display:block;background:${active ? "#1e40af" : "#0f2044"};color:white;border:2px solid white;border-radius:999px;padding:5px 10px;font-weight:700;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px #0004">${formatPrice(price)}${rows.length > 1 ? ` +${rows.length - 1}` : ""}</span>`,
          iconAnchor: [30, 18],
        });
        return (
          <Marker
            key={key}
            position={[rows[0].lat, rows[0].lng]}
            icon={icon}
            title={`${rows.length} loaded ${rows.length === 1 ? "rental" : "rentals"} in this approximate area`}
            eventHandlers={{
              click: () => p.onSelectListing?.(active ? null : rows[0].id),
            }}
          />
        );
      })}
      {selected && (
        <>
          <Circle
            center={[selected.lat, selected.lng]}
            radius={800}
            pathOptions={{ color: "#1e40af", fillOpacity: 0.08 }}
          />
          <Popup
            position={[selected.lat, selected.lng]}
            closeButton={false}
            autoPan
          >
            <div className="space-y-2 min-w-52 max-w-64">
              <button
                aria-label="Close map listing"
                className="float-right p-1"
                onClick={() => p.onSelectListing?.(null)}
              >
                ×
              </button>
              <p className="font-semibold text-sm">{selected.title}</p>
              <p className="text-xs text-slate-600">
                {selected.city}, {selected.state}
              </p>
              <p>
                {formatPrice(selected.price)}/mo · {selected.bedrooms} bd ·{" "}
                {selected.bathrooms} ba
              </p>
              <p className="text-xs text-slate-500">
                Approximate area. The exact address is private.
              </p>
              {group.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Previous listing in map group"
                    onClick={() =>
                      p.onSelectListing?.(
                        group[(index - 1 + group.length) % group.length].id,
                      )
                    }
                  >
                    ←
                  </Button>
                  <span className="text-xs">
                    {index + 1} of {group.length} loaded listings
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Next listing in map group"
                    onClick={() =>
                      p.onSelectListing?.(group[(index + 1) % group.length].id)
                    }
                  >
                    →
                  </Button>
                </div>
              )}
              <a
                href={selected.href ?? `/listings/${selected.id}`}
                className="block rounded bg-[#0f2044] p-2 text-center text-white"
              >
                View listing
              </a>
            </div>
          </Popup>
        </>
      )}
    </MapContainer>
  );
}
