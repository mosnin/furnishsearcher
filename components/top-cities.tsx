"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOP_CITIES, STATES, type City } from "@/lib/cities";

type SortOption = "popular" | "alpha" | "state";

export default function TopCities() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [selectedState, setSelectedState] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    let cities = [...TOP_CITIES];

    if (search) {
      const q = search.toLowerCase();
      cities = cities.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.state.toLowerCase().includes(q) ||
          c.stateCode.toLowerCase().includes(q)
      );
    }

    if (selectedState !== "all") {
      cities = cities.filter((c) => c.stateCode === selectedState);
    }

    switch (sortBy) {
      case "alpha":
        cities.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "state":
        cities.sort((a, b) =>
          a.stateCode !== b.stateCode
            ? a.stateCode.localeCompare(b.stateCode)
            : a.name.localeCompare(b.name)
        );
        break;
      case "popular":
      default:
        cities.sort((a, b) => {
          if (a.popular && !b.popular) return -1;
          if (!a.popular && b.popular) return 1;
          return a.name.localeCompare(b.name);
        });
    }

    return cities;
  }, [search, sortBy, selectedState]);

  const displayed = showAll ? filtered : filtered.slice(0, 100);

  return (
    <section className="bg-white py-16 border-t border-gray-100">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-navy-900 mb-1">
            Top 100 cities for travel nurses, corporate travelers, and relocating families
          </h2>
          <p className="text-gray-500 text-sm">
            Click any city to browse available furnished monthly rentals
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-8">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search cities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <span className="text-xs text-gray-500 px-2 font-medium">Sort:</span>
            {(
              [
                { value: "popular", label: "Popular" },
                { value: "alpha", label: "A–Z" },
                { value: "state", label: "By State" },
              ] as { value: SortOption; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  sortBy === opt.value
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* State filter */}
          <div className="relative">
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All States</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {search || selectedState !== "all" ? (
            <button
              onClick={() => {
                setSearch("");
                setSelectedState("all");
              }}
              className="text-xs text-blue-600 hover:text-blue-800 underline px-2"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {/* Results count */}
        {(search || selectedState !== "all") && (
          <p className="text-sm text-gray-500 mb-4">
            {filtered.length} {filtered.length === 1 ? "city" : "cities"} found
          </p>
        )}

        {/* City grid */}
        {sortBy === "state" ? (
          <CityByState cities={displayed} />
        ) : (
          <CityGrid cities={displayed} />
        )}

        {filtered.length > 100 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-6 text-blue-600 hover:text-blue-800 text-sm font-medium underline"
          >
            Show all {filtered.length} cities
          </button>
        )}

        {filtered.length === 0 && (
          <p className="text-gray-400 text-sm py-8 text-center">
            No cities found matching &quot;{search}&quot;.{" "}
            <button
              onClick={() => setSearch("")}
              className="text-blue-600 underline"
            >
              Clear search
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

function CityGrid({ cities }: { cities: City[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-3">
      {cities.map((city) => (
        <CityLink key={`${city.name}-${city.stateCode}`} city={city} />
      ))}
    </div>
  );
}

function CityByState({ cities }: { cities: City[] }) {
  const byState = useMemo(() => {
    const map = new Map<string, City[]>();
    for (const city of cities) {
      if (!map.has(city.stateCode)) map.set(city.stateCode, []);
      map.get(city.stateCode)!.push(city);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [cities]);

  return (
    <div className="space-y-8">
      {byState.map(([stateCode, stateCities]) => (
        <div key={stateCode}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5" />
            {stateCities[0].state} ({stateCode})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2">
            {stateCities.map((city) => (
              <CityLink key={city.name} city={city} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CityLink({ city }: { city: City }) {
  return (
    <Link
      href={`/search?location=${encodeURIComponent(`${city.name}, ${city.stateCode}`)}&city=${encodeURIComponent(city.name)}&state=${encodeURIComponent(city.stateCode)}`}
      className={cn(
        "text-sm text-blue-700 hover:text-blue-900 hover:underline transition-colors",
        city.popular && "font-medium"
      )}
    >
      {city.name}
      {city.popular && (
        <span className="ml-1 text-[10px] text-orange-500 font-semibold">★</span>
      )}
    </Link>
  );
}
