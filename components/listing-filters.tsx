"use client";

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const PROPERTY_TYPES = ["Apartment", "House", "Condo", "Studio", "Townhouse"] as const;
const BED_OPTIONS = [1, 2, 3, 4] as const;

export interface FilterState {
  propertyTypes: string[];
  minBeds: number;
  minPrice: number;
  maxPrice: number;
  petFriendly: boolean;
  utilitiesIncluded: boolean;
}

const DEFAULT_FILTERS: FilterState = {
  propertyTypes: [],
  minBeds: 0,
  minPrice: 0,
  maxPrice: 0,
  petFriendly: false,
  utilitiesIncluded: false,
};

interface ListingFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  className?: string;
}

export function ListingFilters({ filters, onFilterChange, className }: ListingFiltersProps) {
  const update = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      onFilterChange({ ...filters, [key]: value });
    },
    [filters, onFilterChange]
  );

  const togglePropertyType = useCallback(
    (type: string) => {
      const next = filters.propertyTypes.includes(type)
        ? filters.propertyTypes.filter((t) => t !== type)
        : [...filters.propertyTypes, type];
      update("propertyTypes", next);
    },
    [filters.propertyTypes, update]
  );

  const clearAll = useCallback(() => {
    onFilterChange(DEFAULT_FILTERS);
  }, [onFilterChange]);

  const hasActiveFilters =
    filters.propertyTypes.length > 0 ||
    filters.minBeds > 0 ||
    filters.minPrice > 0 ||
    filters.maxPrice > 0 ||
    filters.petFriendly ||
    filters.utilitiesIncluded;

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground text-base">Filters</h2>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="text-xs text-muted-foreground h-7 px-2 hover:text-foreground"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Property Type */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Property Type</h3>
        <div className="flex flex-col gap-2.5">
          {PROPERTY_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-2.5">
              <Checkbox
                id={`type-${type}`}
                checked={filters.propertyTypes.includes(type)}
                onCheckedChange={() => togglePropertyType(type)}
              />
              <Label
                htmlFor={`type-${type}`}
                className="text-sm text-foreground cursor-pointer font-normal"
              >
                {type}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Bedrooms */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Bedrooms</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => update("minBeds", 0)}
            className={cn(
              "h-9 min-w-[40px] px-3 rounded-md border text-sm font-medium transition-colors",
              filters.minBeds === 0
                ? "border-[#0f2044] bg-[#0f2044] text-white"
                : "border-border bg-background text-foreground hover:border-[#0f2044] hover:text-[#0f2044]"
            )}
          >
            Any
          </button>
          {BED_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => update("minBeds", n)}
              className={cn(
                "h-9 min-w-[40px] px-3 rounded-md border text-sm font-medium transition-colors",
                filters.minBeds === n
                  ? "border-[#0f2044] bg-[#0f2044] text-white"
                  : "border-border bg-background text-foreground hover:border-[#0f2044] hover:text-[#0f2044]"
              )}
            >
              {n}+
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Price Range */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Price Range</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label htmlFor="min-price" className="text-xs text-muted-foreground mb-1 block">
              Min
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="min-price"
                type="number"
                min={0}
                placeholder="0"
                value={filters.minPrice || ""}
                onChange={(e) => update("minPrice", Number(e.target.value) || 0)}
                className="pl-7 text-sm"
              />
            </div>
          </div>
          <span className="text-muted-foreground text-sm mt-5">—</span>
          <div className="flex-1">
            <Label htmlFor="max-price" className="text-xs text-muted-foreground mb-1 block">
              Max
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="max-price"
                type="number"
                min={0}
                placeholder="Any"
                value={filters.maxPrice || ""}
                onChange={(e) => update("maxPrice", Number(e.target.value) || 0)}
                className="pl-7 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Boolean toggles */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="pet-friendly" className="text-sm font-medium text-foreground cursor-pointer">
            Pet Friendly
          </Label>
          <Switch
            id="pet-friendly"
            checked={filters.petFriendly}
            onCheckedChange={(v) => update("petFriendly", v)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="utilities-included" className="text-sm font-medium text-foreground cursor-pointer">
            Utilities Included
          </Label>
          <Switch
            id="utilities-included"
            checked={filters.utilitiesIncluded}
            onCheckedChange={(v) => update("utilitiesIncluded", v)}
          />
        </div>
      </div>
    </div>
  );
}
