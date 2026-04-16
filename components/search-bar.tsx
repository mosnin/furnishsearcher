"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Calendar, DollarSign, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUDGET_OPTIONS } from "@/lib/utils";
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", location.trim());
    if (date) params.set("date", date);
    if (budget) params.set("budget", budget);
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className={cn("w-full", className)}>
      <form onSubmit={handleSearch}>
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/20 border border-white/80 overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Location Field */}
            <div className="flex-1 flex items-center gap-3 px-5 py-4 md:border-r border-b md:border-b-0 border-gray-100 group focus-within:bg-gray-50/50 transition-colors">
              <MapPin className="w-5 h-5 text-[#0f2044] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, zip, or neighborhood"
                  className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent outline-none font-medium"
                />
              </div>
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
