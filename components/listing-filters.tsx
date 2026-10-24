"use client";
import type { SearchFilters } from "@/lib/search";
import { PROPERTY_TYPES, AMENITIES } from "@/lib/search-options";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export type FilterState = SearchFilters;
export function ListingFilters({
  filters,
  onFilterChange,
  className,
}: {
  filters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
  className?: string;
}) {
  function update<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K],
  ) {
    onFilterChange({ ...filters, [key]: value });
  }
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Filters</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onFilterChange({
              location: filters.location,
              city: filters.city,
              state: filters.state,
              propertyId: filters.propertyId,
              moveIn: filters.moveIn,
              moveOut: filters.moveOut,
              flexibleDays: filters.flexibleDays,
              sort: filters.sort,
            })
          }
        >
          Clear filters
        </Button>
      </div>
      <fieldset className="space-y-3">
        <legend className="font-medium text-sm mb-2">Property types</legend>
        <div className="flex flex-wrap gap-3">
          {PROPERTY_TYPES.map((type) => (
            <label key={type} className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.propertyTypes?.includes(type) ?? false}
                onChange={(e) =>
                  update(
                    "propertyTypes",
                    e.target.checked
                      ? [...(filters.propertyTypes ?? []), type]
                      : filters.propertyTypes?.filter((t) => t !== type),
                  )
                }
              />
              {type === "Room" ? "Room for rent" : type}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 my-5">
        {(
          [
            ["minPrice", "Minimum monthly rent"],
            ["maxPrice", "Maximum monthly rent"],
            ["bedrooms", "Minimum bedrooms"],
            ["bathrooms", "Minimum bathrooms"],
            ["occupants", "Occupants"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`search-${key}`}>{label}</Label>
            <Input
              id={`search-${key}`}
              type="number"
              min={key === "occupants" ? 1 : 0}
              step={key === "bathrooms" ? 0.5 : 1}
              max={key.includes("Price") ? 10000000 : 30}
              value={filters[key] ?? ""}
              onChange={(e) =>
                update(
                  key,
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              placeholder="Any"
            />
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        {(
          [
            ["petFriendly", "Pets", "Pet friendly", "No pets"],
            ["utilitiesIncluded", "Utilities", "Included", "Not included"],
            ["parkingIncluded", "Parking", "Included", "Not included"],
          ] as const
        ).map(([key, label, yes, no]) => (
          <label key={key} className="text-sm space-y-2">
            {label}
            <select
              className="block w-full rounded-md border p-2 bg-white"
              value={filters[key] === undefined ? "" : String(filters[key])}
              onChange={(e) =>
                update(
                  key,
                  e.target.value === "" ? undefined : e.target.value === "true",
                )
              }
            >
              <option value="">Any</option>
              <option value="true">{yes}</option>
              <option value="false">{no}</option>
            </select>
          </label>
        ))}
      </div>
      <fieldset>
        <legend className="font-medium text-sm mb-3">
          Amenities & accessibility · all selected features required
        </legend>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {AMENITIES.filter(
            (a) =>
              !["Pet Friendly", "Parking", "Utilities Included"].includes(a),
          ).map((a) => (
            <label key={a} className="flex gap-2 items-center text-sm">
              <input
                type="checkbox"
                checked={filters.amenities?.includes(a) ?? false}
                onChange={(e) =>
                  update(
                    "amenities",
                    e.target.checked
                      ? [...(filters.amenities ?? []), a]
                      : filters.amenities?.filter((item) => item !== a),
                  )
                }
              />
              {a}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-slate-500 mt-4">
        Amenities and accessibility features are described by the owner. Confirm
        that the property meets your needs before arranging a stay.
      </p>
    </div>
  );
}
