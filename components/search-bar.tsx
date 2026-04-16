"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Calendar, DollarSign, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUDGET_OPTIONS } from "@/lib/utils";
import { TOP_CITIES } from "@/lib/cities";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DATE_OPTIONS = [
  { label: "Flexible", value: "flexible" },
  { label: "This Month", value: "this-month" },
  { label: "Next Month", value: "next-month" },
  { label: "May 2026", value: "2026-05" },
  { label: "June 2026", value: "2026-06" },
  { label: "July 2026", value: "2026-07" },
  { label: "August 2026", value: "2026-08" },
  { label: "September 2026", value: "2026-09" },
  { label: "October 2026", value: "2026-10" },
];

interface SearchBarProps {
  className?: string;
  defaultLocation?: string;
  defaultDate?: string;
  defaultBudget?: string;
}

export default function SearchBar({
  className,
  defaultLocation = "",
  defaultDate = "",
  defaultBudget = "",
}: SearchBarProps) {
  const router = useRouter();
  const [location, setLocation] = React.useState(defaultLocation);
  const [date, setDate] = React.useState(defaultDate);
  const [budget, setBudget] = React.useState(defaultBudget);

  // Autocomplete state
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const filteredCities = React.useMemo(() => {
    const q = location.trim().toLowerCase();
    if (q.length < 2) return [];
    return TOP_CITIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.stateCode.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [location]);

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocation(e.target.value);
    setActiveIndex(-1);
    setShowDropdown(true);
  };

  const selectCity = (cityName: string, stateCode: string) => {
    setLocation(`${cityName}, ${stateCode}`);
    setShowDropdown(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredCities.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < filteredCities.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : filteredCities.length - 1
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const city = filteredCities[activeIndex];
      selectCity(city.name, city.stateCode);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Delay so click on dropdown item fires first
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    }, 150);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowDropdown(false);
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", location.trim());
    if (date) params.set("date", date);
    if (budget) params.set("budget", budget);
    router.push(`/search?${params.toString()}`);
  };

  const dropdownVisible = showDropdown && filteredCities.length > 0;

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={handleSearch}>
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/20 border border-white/80 overflow-visible">
          <div className="flex flex-col md:flex-row">
            {/* Location Field */}
            <div className="flex-1 relative flex items-center gap-3 px-5 py-4 md:border-r border-b md:border-b-0 border-gray-100 group focus-within:bg-gray-50/50 transition-colors rounded-tl-2xl rounded-bl-2xl">
              <MapPin className="w-5 h-5 text-[#0f2044] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                  Location
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={location}
                  onChange={handleLocationChange}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  onFocus={() => {
                    if (filteredCities.length > 0) setShowDropdown(true);
                  }}
                  placeholder="City, zip, or neighborhood"
                  autoComplete="off"
                  className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent outline-none font-medium"
                />
              </div>

              {/* Autocomplete Dropdown */}
              {dropdownVisible && (
                <div
                  ref={dropdownRef}
                  className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {filteredCities.map((city, idx) => (
                    <button
                      key={`${city.name}-${city.stateCode}`}
                      type="button"
                      onMouseDown={() => selectCity(city.name, city.stateCode)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
                        idx === activeIndex
                          ? "bg-[#0f2044] text-white"
                          : "text-gray-700 hover:bg-[#0f2044] hover:text-white"
                      )}
                    >
                      <MapPin
                        className={cn(
                          "w-4 h-4 flex-shrink-0",
                          idx === activeIndex ? "text-white" : "text-[#0f2044]"
                        )}
                      />
                      <span className="font-medium">{city.name}</span>
                      <span
                        className={cn(
                          "ml-auto text-xs",
                          idx === activeIndex ? "text-white/70" : "text-gray-400"
                        )}
                      >
                        {city.stateCode}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Field */}
            <div className="flex-1 flex items-center gap-3 px-5 py-4 md:border-r border-b md:border-b-0 border-gray-100 focus-within:bg-gray-50/50 transition-colors">
              <Calendar className="w-5 h-5 text-[#0f2044] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                  Move-in Date
                </label>
                <Select value={date} onValueChange={setDate}>
                  <SelectTrigger className="h-auto p-0 border-0 shadow-none focus:ring-0 text-sm font-medium text-gray-900 data-[placeholder]:text-gray-400 bg-transparent [&>svg]:hidden">
                    <SelectValue placeholder="When do you need it?" />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Budget Field */}
            <div className="flex-1 flex items-center gap-3 px-5 py-4 focus-within:bg-gray-50/50 transition-colors">
              <DollarSign className="w-5 h-5 text-[#0f2044] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                  Monthly Budget
                </label>
                <Select value={budget} onValueChange={setBudget}>
                  <SelectTrigger className="h-auto p-0 border-0 shadow-none focus:ring-0 text-sm font-medium text-gray-900 data-[placeholder]:text-gray-400 bg-transparent [&>svg]:hidden">
                    <SelectValue placeholder="Any budget" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUDGET_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search Button */}
            <div className="flex items-center p-3 md:p-4">
              <button
                type="submit"
                className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#0f2044] hover:bg-[#1a3360] active:bg-[#0a1830] text-white font-semibold rounded-xl px-7 py-3.5 transition-all duration-200 shadow-lg shadow-[#0f2044]/30 hover:shadow-xl hover:shadow-[#0f2044]/40 hover:-translate-y-0.5 text-sm"
              >
                <Search className="w-4 h-4" />
                Search
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Hint below search */}
      <div className="mt-3 flex items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 border border-white/20">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <p className="text-white/90 text-xs font-medium">
            New! Search near your workplace or hospital
          </p>
        </div>
      </div>
    </div>
  );
}
