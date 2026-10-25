"use client";
import { useState, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { SearchFilters } from "@/lib/search";
import type { PlaceCandidate } from "@/lib/geo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function LocationSearch({
  filters,
  onChange,
}: {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}) {
  const capabilities = useQuery(api.geo.capabilities, {});
  const search = useAction(api.geo.searchPlaces),
    [text, setText] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [radius, setRadius] = useState(String(filters.radiusMiles ?? 10)),
    [places, setPlaces] = useState<PlaceCandidate[]>([]),
    [message, setMessage] = useState("");
  useEffect(
    () => setRadius(String(filters.radiusMiles ?? 10)),
    [filters.radiusMiles],
  );
  async function find() {
    setBusy(true);
    setMessage("");
    setPlaces([]);
    try {
      const result = await search({
        text,
        consent,
        expectedProvider: capabilities?.provider,
      });
      setPlaces(result.candidates);
      if (!result.candidates.length)
        setMessage(
          result.provider === "census"
            ? "No address match. Enter a full US street address, or use city/state above."
            : "No location matched. Include a city or a full address.",
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Location lookup failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border bg-white p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {filters.nearLatitude !== undefined
          ? `Within ${filters.radiusMiles} miles of ${filters.nearLabel ?? "your reference location"}`
          : capabilities?.placeNames
            ? "Search near a workplace, address, ZIP or neighborhood"
            : "Search near a workplace or street address"}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">
          {capabilities?.placeNames
            ? "Search by a US address, workplace, neighborhood or ZIP."
            : "Enter a full US street address. Place-name and neighborhood lookup is not available here yet."}{" "}
          Distances use approximate property areas and are straight-line
          estimates, not commute times.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="flex-1 min-w-48 text-sm">
            Reference location
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              placeholder="Hospital address, workplace, neighborhood or ZIP"
            />
          </label>
          <label className="text-sm">
            Miles
            <select
              className="block rounded border p-2"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
            >
              {[0.5, 1, 2, 5, 10, 15, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            Send this search to{" "}
            {capabilities?.provider === "geoapify"
              ? "Geoapify"
              : "the US Census Bureau's geocoder"}
            . Do not include confidential information.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={
              busy || !capabilities || !consent || text.trim().length < 3
            }
            onClick={find}
          >
            {busy ? "Finding location…" : "Find location"}
          </Button>
          {filters.nearLatitude !== undefined && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  ...filters,
                  nearLatitude: undefined,
                  nearLongitude: undefined,
                  radiusMiles: undefined,
                  nearLabel: undefined,
                })
              }
            >
              Clear distance filter
            </Button>
          )}
        </div>
        {message && (
          <p role="status" className="text-sm text-amber-800">
            {message}
          </p>
        )}
        <ul className="space-y-2">
          {places.map((p, i) => (
            <li key={`${p.label}-${i}`}>
              <Button
                className="h-auto whitespace-normal text-left"
                variant="outline"
                onClick={() =>
                  onChange({
                    ...filters,
                    location: undefined,
                    city: undefined,
                    state: undefined,
                    propertyId: undefined,
                    mapBounds: undefined,
                    nearLatitude: p.latitude,
                    nearLongitude: p.longitude,
                    radiusMiles: Number(radius),
                    nearLabel: p.label.slice(0, 200),
                  })
                }
              >
                {p.label} · Search within {radius} miles
              </Button>
            </li>
          ))}
        </ul>
        {places.some((p) => p.provider === "geoapify") && (
          <a
            className="text-xs underline"
            href="https://www.geoapify.com/"
            target="_blank"
            rel="noreferrer"
          >
            Geocoding by Geoapify · OpenStreetMap contributors
          </a>
        )}
      </div>
    </details>
  );
}
