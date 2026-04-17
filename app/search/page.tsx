"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  Map,
  List,
  Heart,
  Bed,
  Bath,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  BookmarkPlus,
} from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { toast } from "sonner";
import LeafletMap from "@/components/leaflet-map";
import { type MapListing } from "@/components/map-view";
import { TOP_CITIES } from "@/lib/cities";

type SortOption = "price_asc" | "price_desc" | "newest" | "most_viewed";
type ViewMode = "list" | "map" | "split";

const PROPERTY_TYPES = ["Apartment", "House", "Condo", "Studio", "Townhouse", "Room"];
const BED_OPTIONS = [1, 2, 3, 4];

function SearchPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { userId } = useAuth();

  const locationParam = params.get("location") ?? "";
  const cityParam = params.get("city") ?? "";
  const stateParam = params.get("state") ?? "";
  const budgetParam = params.get("budget") ?? "";
  const dateParam = params.get("date") ?? "";

  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [localSearch, setLocalSearch] = useState(locationParam);
  const [page, setPage] = useState(1);

  // Save search state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveEmailAlerts, setSaveEmailAlerts] = useState(false);
  const [saving, setSaving] = useState(false);

  const ITEMS_PER_PAGE = 12;

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [minBeds, setMinBeds] = useState(0);
  const [maxPrice, setMaxPrice] = useState(Number(budgetParam) || 0);
  const [petFriendly, setPetFriendly] = useState(false);
  const [utilitiesIncluded, setUtilitiesIncluded] = useState(false);

  const convexUser = useQuery(api.users.getByClerkId, userId ? { clerkId: userId } : "skip");
  const saveSearchMutation = useMutation(api.savedSearches.save);

  const rawListings = useQuery(api.listings.search, {
    city: cityParam || undefined,
    state: stateParam || undefined,
    maxPrice: maxPrice > 0 ? maxPrice : undefined,
    bedrooms: minBeds > 0 ? minBeds : undefined,
    propertyType: selectedTypes.length === 1 ? selectedTypes[0] : undefined,
    petFriendly: petFriendly || undefined,
  }) as Doc<"listings">[] | undefined;

  const listings = useMemo(() => {
    if (!rawListings) return [];
    let list = [...rawListings];
    if (selectedTypes.length > 1) list = list.filter((l) => selectedTypes.includes(l.propertyType));
    if (utilitiesIncluded) list = list.filter((l) => l.utilitiesIncluded);
    switch (sortBy) {
      case "price_asc": list.sort((a, b) => a.price - b.price); break;
      case "price_desc": list.sort((a, b) => b.price - a.price); break;
      case "most_viewed": list.sort((a, b) => b.views - a.views); break;
      default: list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [rawListings, selectedTypes, utilitiesIncluded, sortBy]);

  // Reset to page 1 whenever the filtered result set or sort changes
  useEffect(() => {
    setPage(1);
  }, [listings.length, sortBy]);

  // Paginated slice — only used in list view; map/split views show all for accuracy
  const paginated = listings.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(listings.length / ITEMS_PER_PAGE));

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const mapListings: MapListing[] = useMemo(() =>
    listings
      .map((l) => {
        const cityData = TOP_CITIES.find(
          (c) => c.name.toLowerCase() === l.city.toLowerCase()
        );
        if (!cityData) return null;
        // Deterministic jitter derived from listing id — prevents pin drift on re-renders
        let seed = 0;
        for (let i = 0; i < l._id.length; i++) {
          seed = (seed * 31 + l._id.charCodeAt(i)) | 0;
        }
        const jitterLat = ((seed % 1000) / 1000 - 0.5) * 0.04;
        const jitterLng = (((seed >> 8) % 1000) / 1000 - 0.5) * 0.04;
        return {
          id: l._id,
          title: l.title,
          price: l.price,
          lat: cityData.lat + jitterLat,
          lng: cityData.lng + jitterLng,
          city: l.city,
          state: l.state,
          bedrooms: l.bedrooms,
          bathrooms: l.bathrooms,
          photos: l.photos,
        } satisfies MapListing;
      })
      .filter(Boolean) as MapListing[],
    [listings]
  );

  const locationLabel =
    cityParam
      ? stateParam ? `${cityParam}, ${stateParam}` : cityParam
      : locationParam || "All Locations";

  const handleSearch = () => {
    const sp = new URLSearchParams();
    if (localSearch) sp.set("location", localSearch);
    const matched = TOP_CITIES.find(
      (c) =>
        c.name.toLowerCase() === localSearch.toLowerCase() ||
        `${c.name}, ${c.stateCode}`.toLowerCase() === localSearch.toLowerCase()
    );
    if (matched) { sp.set("city", matched.name); sp.set("state", matched.stateCode); }
    if (budgetParam) sp.set("budget", budgetParam);
    if (dateParam) sp.set("date", dateParam);
    router.push(`/search?${sp.toString()}`);
  };

  const activeFilterCount =
    selectedTypes.length + (minBeds > 0 ? 1 : 0) + (maxPrice > 0 ? 1 : 0) +
    (petFriendly ? 1 : 0) + (utilitiesIncluded ? 1 : 0);

  const openSaveDialog = () => {
    const parts: string[] = [];
    if (cityParam) parts.push(cityParam);
    if (stateParam && !cityParam) parts.push(stateParam);
    if (minBeds > 0) parts.push(`${minBeds}+ beds`);
    if (maxPrice > 0) parts.push(`≤$${maxPrice.toLocaleString()}`);
    setSaveName(parts.length ? parts.join(", ") : "My Search");
    setShowSaveDialog(true);
  };

  const handleSaveSearch = async () => {
    if (!convexUser || !saveName.trim()) return;
    setSaving(true);
    try {
      await saveSearchMutation({
        userId: convexUser._id,
        name: saveName.trim(),
        city: cityParam || undefined,
        state: stateParam || undefined,
        maxPrice: maxPrice > 0 ? maxPrice : undefined,
        bedrooms: minBeds > 0 ? minBeds : undefined,
        propertyType: selectedTypes.length === 1 ? selectedTypes[0] : undefined,
        petFriendly: petFriendly || undefined,
        emailAlerts: saveEmailAlerts,
      });
      toast.success("Search saved!");
      setShowSaveDialog(false);
      setSaveName("");
      setSaveEmailAlerts(false);
    } catch {
      toast.error("Failed to save search");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top search bar */}
      <div className="bg-white/90 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link href="/" className="font-semibold text-[#0f2044] text-[17px] whitespace-nowrap tracking-tight">
            FurnishFinder
          </Link>

          <div className="flex flex-1 items-center bg-slate-100/80 rounded-2xl px-4 py-2 max-w-2xl min-w-0">
            <div className="flex items-center gap-2 flex-1 border-r border-slate-200 pr-3 min-w-0">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="City, zip, or neighborhood"
                className="bg-transparent text-[14px] font-medium outline-none w-full truncate text-slate-800 placeholder:text-slate-400"
              />
            </div>
            <span className="hidden sm:block px-3 border-r border-slate-200 text-[13px] text-slate-500 whitespace-nowrap">
              {dateParam || "Any date"}
            </span>
            <span className="hidden md:block px-3 text-[13px] text-slate-500 whitespace-nowrap">
              {budgetParam ? `Up to $${Number(budgetParam).toLocaleString()}` : "$0–$20k+"}
            </span>
            <button
              onClick={handleSearch}
              className="ml-2 bg-[#0f2044] text-white rounded-xl p-2 hover:bg-[#1a3360] transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl border text-[14px] font-medium transition-colors",
              activeFilterCount > 0
                ? "border-[#0f2044] text-[#0f2044] bg-[#0f2044]/5"
                : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-[#0f2044] text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px] font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Save Search button — only shown to signed-in users */}
          {convexUser && (
            <button
              onClick={openSaveDialog}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-[14px] font-medium text-slate-700 hover:border-[#0f2044] hover:text-[#0f2044] transition-colors shrink-0"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span className="hidden sm:block">Save Search</span>
            </button>
          )}

          {/* View toggle */}
          <div className="flex items-center bg-slate-100/80 rounded-xl p-1 gap-0.5 ml-auto shrink-0">
            {(["list", "split", "map"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={`${mode} view`}
                className={cn(
                  "px-3 py-1.5 text-[13px] font-medium rounded-lg capitalize transition-colors",
                  viewMode === mode ? "bg-white shadow-sm text-[#0f2044] ring-1 ring-black/[0.05]" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {mode === "list" ? <List className="w-4 h-4" /> : mode === "map" ? <Map className="w-4 h-4" /> : (
                  <span className="flex gap-0.5 items-center"><List className="w-3 h-3" /><Map className="w-3 h-3" /></span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="border-t border-slate-100 bg-white/95 px-4 py-4 max-w-screen-2xl mx-auto">
            <div className="flex flex-wrap gap-6 items-start">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Property Type</p>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                      className={cn(
                        "px-3 py-1.5 text-[13px] rounded-xl border transition-colors",
                        selectedTypes.includes(t) ? "border-[#0f2044] bg-[#0f2044]/5 text-[#0f2044] font-medium" : "border-slate-200 text-slate-700 hover:border-slate-300"
                      )}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Bedrooms</p>
                <div className="flex gap-2">
                  <button onClick={() => setMinBeds(0)} className={cn("px-3 py-1.5 text-[13px] rounded-xl border transition-colors", minBeds === 0 ? "border-[#0f2044] bg-[#0f2044]/5 text-[#0f2044] font-medium" : "border-slate-200 text-slate-700 hover:border-slate-300")}>Any</button>
                  {BED_OPTIONS.map((n) => (
                    <button key={n} onClick={() => setMinBeds(n)} className={cn("px-3 py-1.5 text-[13px] rounded-xl border transition-colors", minBeds === n ? "border-[#0f2044] bg-[#0f2044]/5 text-[#0f2044] font-medium" : "border-slate-200 text-slate-700 hover:border-slate-300")}>{n}+</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Max Monthly Rent</p>
                <select value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className="text-[13px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0f2044]/20">
                  <option value={0}>No limit</option>
                  {[1500,2000,2500,3000,4000,5000,7500,10000].map((v) => (
                    <option key={v} value={v}>${v.toLocaleString()}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Amenities</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer text-slate-700">
                    <input type="checkbox" checked={petFriendly} onChange={(e) => setPetFriendly(e.target.checked)} className="accent-[#0f2044]" /> Pet Friendly
                  </label>
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer text-slate-700">
                    <input type="checkbox" checked={utilitiesIncluded} onChange={(e) => setUtilitiesIncluded(e.target.checked)} className="accent-[#0f2044]" /> Utilities Included
                  </label>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <button onClick={() => { setSelectedTypes([]); setMinBeds(0); setMaxPrice(0); setPetFriendly(false); setUtilitiesIncluded(false); }} className="flex items-center gap-1 text-[13px] text-red-500 hover:text-red-700 ml-auto mt-auto transition-colors">
                  <X className="w-4 h-4" /> Clear all
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results header */}
      <div className="max-w-screen-2xl mx-auto w-full px-4 py-3 flex items-center justify-between">
        {rawListings === undefined ? (
          <div className="h-5 w-64 bg-slate-200 rounded animate-pulse" />
        ) : (
          <h1 className="text-slate-900 font-semibold text-[15px]">
            <span className="font-bold">{listings.length}</span> furnished monthly rentals
            {locationLabel !== "All Locations" && <span className="text-[#0f2044]"> near {locationLabel}</span>}
          </h1>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-slate-500 hidden sm:block">Sort:</span>
          <div className="relative">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="appearance-none text-[13px] border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0f2044]/20 cursor-pointer">
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low–High</option>
              <option value="price_desc">Price: High–Low</option>
              <option value="most_viewed">Most Viewed</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Save Search dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/[0.06] w-full max-w-md p-6">
            <h3 className="text-[17px] font-semibold text-slate-900 mb-1">Save this search</h3>
            <p className="text-[14px] text-slate-500 mb-5">You&apos;ll find it in your dashboard. Enable alerts to get emailed about new matches.</p>
            <div className="space-y-4">
              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">Search name</label>
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveSearch()}
                  placeholder="e.g. Austin 2BR under $2,500"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0f2044]/20 focus:border-[#0f2044]"
                  autoFocus
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveEmailAlerts}
                  onChange={(e) => setSaveEmailAlerts(e.target.checked)}
                  className="accent-[#0f2044] w-4 h-4 rounded"
                />
                <span className="text-[14px] text-slate-700">Email me when new listings match</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-[14px] font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSearch}
                disabled={!saveName.trim() || saving}
                className="flex-1 px-4 py-2.5 bg-[#0f2044] text-white rounded-xl text-[14px] font-medium hover:bg-[#1a3360] transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Search"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 max-w-screen-2xl mx-auto w-full px-4 pb-8">
        {viewMode === "split" ? (
          <div className="flex gap-4" style={{ height: "calc(100vh - 220px)" }}>
            <div className="w-[52%] overflow-y-auto">
              <ListingsGrid listings={listings} loading={rawListings === undefined} selectedId={selectedListingId} onSelect={setSelectedListingId} />
            </div>
            <div className="flex-1">
              <LeafletMap listings={mapListings} selectedId={selectedListingId} onSelectListing={setSelectedListingId} />
            </div>
          </div>
        ) : viewMode === "map" ? (
          <div style={{ height: "calc(100vh - 220px)" }}>
            <LeafletMap listings={mapListings} selectedId={selectedListingId} onSelectListing={setSelectedListingId} />
          </div>
        ) : (
          <>
            {/* "Showing X–Y of N results" */}
            {rawListings !== undefined && listings.length > 0 && (
              <p className="text-[13px] text-slate-500 mb-3">
                Showing{" "}
                <span className="font-medium text-slate-700">
                  {(page - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(page * ITEMS_PER_PAGE, listings.length)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-slate-700">{listings.length}</span>{" "}
                results
              </p>
            )}
            <ListingsGrid listings={paginated} loading={rawListings === undefined} selectedId={selectedListingId} onSelect={setSelectedListingId} />
            {/* Pagination bar — list view only */}
            {listings.length > ITEMS_PER_PAGE && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin w-8 h-8 border-4 border-[#0f2044] border-t-transparent rounded-full" /></div>}>
      <SearchPageInner />
    </Suspense>
  );
}

type ListingDoc = {
  _id: string;
  title: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  photos: string[];
  petFriendly: boolean;
  utilitiesIncluded: boolean;
  views: number;
  createdAt: number;
};

function ListingsGrid({ listings, loading, selectedId, onSelect }: { listings: ListingDoc[]; loading: boolean; selectedId: string | null; onSelect: (id: string | null) => void; }) {
  if (loading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse ring-1 ring-black/[0.06]">
          <div className="h-48 bg-slate-200" />
          <div className="p-4 space-y-2.5"><div className="h-4 bg-slate-200 rounded-lg w-3/4" /><div className="h-3 bg-slate-200 rounded-lg w-1/2" /><div className="h-5 bg-slate-200 rounded-lg w-1/3" /></div>
        </div>
      ))}
    </div>
  );

  if (listings.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4"><Search className="w-8 h-8 text-slate-400" /></div>
      <h3 className="text-[17px] font-semibold text-slate-700 mb-2">No listings found</h3>
      <p className="text-slate-500 text-[14px] max-w-sm">Try broadening your search — adjust the location, price, or remove some filters.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {listings.map((l) => <SearchListingCard key={l._id} listing={l} isSelected={selectedId === l._id} onSelect={() => onSelect(selectedId === l._id ? null : l._id)} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination component
// ---------------------------------------------------------------------------

function getPageNumbers(page: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [];
  // Always show first page
  pages.push(1);
  // Ellipsis after first if current is far from start
  if (page > 4) pages.push("...");
  // 3 pages around current
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
    pages.push(p);
  }
  // Ellipsis before last if current is far from end
  if (page < totalPages - 3) pages.push("...");
  // Always show last page
  pages.push(totalPages);
  return pages;
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="flex flex-col items-center gap-3 mt-8">
      <div className="flex items-center gap-1">
        {/* Prev */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={cn(
            "flex items-center gap-1 px-3 py-2 text-[13px] font-medium rounded-xl border transition-colors",
            page === 1
              ? "border-slate-200 text-slate-300 cursor-not-allowed"
              : "border-slate-200 text-slate-700 hover:border-[#0f2044] hover:text-[#0f2044]"
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1 mx-1">
          {pageNumbers.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-2 py-2 text-[13px] text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                aria-label={`Page ${p}`}
                aria-current={page === p ? "page" : undefined}
                className={cn(
                  "w-9 h-9 text-[13px] font-medium rounded-xl border transition-colors",
                  page === p
                    ? "border-[#0f2044] bg-[#0f2044] text-white"
                    : "border-slate-200 text-slate-700 hover:border-[#0f2044] hover:text-[#0f2044]"
                )}
              >
                {p}
              </button>
            )
          )}
        </div>

        {/* Next */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={cn(
            "flex items-center gap-1 px-3 py-2 text-[13px] font-medium rounded-xl border transition-colors",
            page === totalPages
              ? "border-slate-200 text-slate-300 cursor-not-allowed"
              : "border-slate-200 text-slate-700 hover:border-[#0f2044] hover:text-[#0f2044]"
          )}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Page X of N */}
      <p className="text-[12px] text-slate-400">
        Page <span className="font-medium text-slate-600">{page}</span> of{" "}
        <span className="font-medium text-slate-600">{totalPages}</span>
      </p>
    </div>
  );
}

function SearchListingCard({ listing: l, isSelected, onSelect }: { listing: ListingDoc; isSelected: boolean; onSelect: () => void; }) {
  const [saved, setSaved] = useState(false);
  return (
    <div onClick={onSelect} className={cn("bg-white rounded-2xl overflow-hidden transition-all duration-150 cursor-pointer hover:shadow-md", isSelected ? "ring-2 ring-[#0f2044] shadow-lg" : "ring-1 ring-black/[0.06] shadow-sm hover:ring-black/[0.1]")}>
      <div className="relative h-52 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
        {l.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.photos[0]} alt={l.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><MapPin className="w-10 h-10 text-slate-300" /></div>
        )}
        <button onClick={(e) => { e.stopPropagation(); setSaved(!saved); }} className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl p-2 shadow-sm hover:bg-white transition-colors">
          <Heart className={cn("w-4 h-4 transition-colors", saved ? "fill-red-500 text-red-500" : "text-slate-600")} />
        </button>
        <span className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm text-slate-700 text-[11px] font-medium px-2.5 py-1 rounded-lg">{l.propertyType}</span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-slate-900 text-[14px] truncate mb-0.5">{l.title}</h3>
        <p className="text-[12px] text-slate-500 mb-3">{l.city}, {l.state}</p>
        <div className="flex items-center justify-between mb-2.5">
          <div><span className="text-[#0f2044] font-bold text-[17px]">{formatPrice(l.price)}</span><span className="text-slate-400 text-[12px] ml-1">/mo</span></div>
          <div className="flex items-center gap-3 text-[12px] text-slate-500">
            <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" />{l.bedrooms}</span>
            <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{l.bathrooms}</span>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {l.petFriendly && <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-100 font-medium">Pet friendly</span>}
          {l.utilitiesIncluded && <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-100 font-medium">Utilities incl.</span>}
        </div>
        <Link href={`/listings/${l._id}`} onClick={(e) => e.stopPropagation()} className="block text-center text-[13px] bg-[#0f2044] text-white py-2 rounded-xl hover:bg-[#1a3360] transition-colors font-medium">
          View Listing
        </Link>
      </div>
    </div>
  );
}
