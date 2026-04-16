"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
} from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
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

  const ITEMS_PER_PAGE = 12;

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [minBeds, setMinBeds] = useState(0);
  const [maxPrice, setMaxPrice] = useState(Number(budgetParam) || 0);
  const [petFriendly, setPetFriendly] = useState(false);
  const [utilitiesIncluded, setUtilitiesIncluded] = useState(false);

  const rawListings = useQuery(api.listings.search, {
    city: cityParam || undefined,
    state: stateParam || undefined,
    maxPrice: maxPrice > 0 ? maxPrice : undefined,
    bedrooms: minBeds > 0 ? minBeds : undefined,
    propertyType: selectedTypes.length === 1 ? selectedTypes[0] : undefined,
    petFriendly: petFriendly || undefined,
  });

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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mapListings: MapListing[] = useMemo(() =>
    listings
      .map((l) => {
        const cityData = TOP_CITIES.find(
          (c) => c.name.toLowerCase() === l.city.toLowerCase()
        );
        if (!cityData) return null;
        return {
          id: l._id,
          title: l.title,
          price: l.price,
          lat: cityData.lat + (Math.random() - 0.5) * 0.04,
          lng: cityData.lng + (Math.random() - 0.5) * 0.04,
          city: l.city,
          state: l.state,
          bedrooms: l.bedrooms,
          bathrooms: l.bathrooms,
          photos: l.photos,
        } satisfies MapListing;
      })
      .filter(Boolean) as MapListing[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top search bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link href="/" className="font-bold text-[#1e3a8a] text-lg whitespace-nowrap">
            FurnishFinder
          </Link>

          <div className="flex flex-1 items-center bg-gray-100 rounded-full px-4 py-2 max-w-2xl min-w-0">
            <div className="flex items-center gap-2 flex-1 border-r border-gray-300 pr-3 min-w-0">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="City, zip, or neighborhood"
                className="bg-transparent text-sm font-medium outline-none w-full truncate"
              />
            </div>
            <span className="hidden sm:block px-3 border-r border-gray-300 text-sm text-gray-600 whitespace-nowrap">
              {dateParam || "Any date"}
            </span>
            <span className="hidden md:block px-3 text-sm text-gray-600 whitespace-nowrap">
              {budgetParam ? `Up to $${Number(budgetParam).toLocaleString()}` : "$0–$20k+"}
            </span>
            <button
              onClick={handleSearch}
              className="ml-2 bg-[#1e3a8a] text-white rounded-full p-2 hover:bg-blue-900 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-colors",
              activeFilterCount > 0
                ? "border-[#1e3a8a] text-[#1e3a8a] bg-blue-50"
                : "border-gray-300 text-gray-700 hover:border-gray-400"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-[#1e3a8a] text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* View toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 ml-auto shrink-0">
            {(["list", "split", "map"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={`${mode} view`}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                  viewMode === mode ? "bg-white shadow text-[#1e3a8a]" : "text-gray-500 hover:text-gray-700"
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
          <div className="border-t border-gray-100 bg-white px-4 py-4 max-w-screen-2xl mx-auto">
            <div className="flex flex-wrap gap-6 items-start">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Property Type</p>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-full border transition-colors",
                        selectedTypes.includes(t) ? "border-[#1e3a8a] bg-blue-50 text-[#1e3a8a] font-medium" : "border-gray-200 text-gray-700 hover:border-gray-400"
                      )}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bedrooms</p>
                <div className="flex gap-2">
                  <button onClick={() => setMinBeds(0)} className={cn("px-3 py-1.5 text-sm rounded-full border", minBeds === 0 ? "border-[#1e3a8a] bg-blue-50 text-[#1e3a8a]" : "border-gray-200 text-gray-700")}>Any</button>
                  {BED_OPTIONS.map((n) => (
                    <button key={n} onClick={() => setMinBeds(n)} className={cn("px-3 py-1.5 text-sm rounded-full border", minBeds === n ? "border-[#1e3a8a] bg-blue-50 text-[#1e3a8a]" : "border-gray-200 text-gray-700")}>{n}+</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Max Monthly Rent</p>
                <select value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
                  <option value={0}>No limit</option>
                  {[1500,2000,2500,3000,4000,5000,7500,10000].map((v) => (
                    <option key={v} value={v}>${v.toLocaleString()}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Amenities</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={petFriendly} onChange={(e) => setPetFriendly(e.target.checked)} className="accent-[#1e3a8a]" /> Pet Friendly
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={utilitiesIncluded} onChange={(e) => setUtilitiesIncluded(e.target.checked)} className="accent-[#1e3a8a]" /> Utilities Included
                  </label>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <button onClick={() => { setSelectedTypes([]); setMinBeds(0); setMaxPrice(0); setPetFriendly(false); setUtilitiesIncluded(false); }} className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 ml-auto mt-auto">
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
          <div className="h-5 w-64 bg-gray-200 rounded animate-pulse" />
        ) : (
          <h1 className="text-[#1e3a8a] font-semibold text-base">
            <span className="font-bold">{listings.length}</span> furnished monthly rentals
            {locationLabel !== "All Locations" && <span className="font-bold"> near {locationLabel}</span>}
          </h1>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 hidden sm:block">Sort:</span>
          <div className="relative">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="appearance-none text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-white focus:outline-none cursor-pointer">
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low–High</option>
              <option value="price_desc">Price: High–Low</option>
              <option value="most_viewed">Most Viewed</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

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
              <p className="text-sm text-gray-500 mb-3">
                Showing{" "}
                <span className="font-medium text-gray-700">
                  {(page - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(page * ITEMS_PER_PAGE, listings.length)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-gray-700">{listings.length}</span>{" "}
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
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#1e3a8a] border-t-transparent rounded-full" /></div>}>
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
        <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse shadow-sm">
          <div className="h-48 bg-gray-200" />
          <div className="p-4 space-y-2"><div className="h-4 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-200 rounded w-1/2" /><div className="h-5 bg-gray-200 rounded w-1/3" /></div>
        </div>
      ))}
    </div>
  );

  if (listings.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"><Search className="w-8 h-8 text-gray-400" /></div>
      <h3 className="text-lg font-semibold text-gray-700 mb-2">No listings found</h3>
      <p className="text-gray-500 text-sm max-w-sm">Try broadening your search — adjust the location, price, or remove some filters.</p>
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
            "flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
            page === 1
              ? "border-gray-200 text-gray-300 cursor-not-allowed"
              : "border-gray-300 text-gray-700 hover:border-[#1e3a8a] hover:text-[#1e3a8a]"
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
              <span key={`ellipsis-${i}`} className="px-2 py-2 text-sm text-gray-400">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                aria-label={`Page ${p}`}
                aria-current={page === p ? "page" : undefined}
                className={cn(
                  "w-9 h-9 text-sm font-medium rounded-lg border transition-colors",
                  page === p
                    ? "border-[#1e3a8a] bg-[#1e3a8a] text-white"
                    : "border-gray-200 text-gray-700 hover:border-[#1e3a8a] hover:text-[#1e3a8a]"
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
            "flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
            page === totalPages
              ? "border-gray-200 text-gray-300 cursor-not-allowed"
              : "border-gray-300 text-gray-700 hover:border-[#1e3a8a] hover:text-[#1e3a8a]"
          )}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Page X of N */}
      <p className="text-xs text-gray-400">
        Page <span className="font-medium text-gray-600">{page}</span> of{" "}
        <span className="font-medium text-gray-600">{totalPages}</span>
      </p>
    </div>
  );
}

function SearchListingCard({ listing: l, isSelected, onSelect }: { listing: ListingDoc; isSelected: boolean; onSelect: () => void; }) {
  const [saved, setSaved] = useState(false);
  return (
    <div onClick={onSelect} className={cn("bg-white rounded-xl overflow-hidden border-2 transition-all duration-150 cursor-pointer hover:shadow-md", isSelected ? "border-[#1e3a8a] shadow-lg" : "border-transparent shadow-sm")}>
      <div className="relative h-52 bg-gradient-to-br from-blue-100 to-blue-200 overflow-hidden">
        {l.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.photos[0]} alt={l.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><MapPin className="w-10 h-10 text-blue-300" /></div>
        )}
        <button onClick={(e) => { e.stopPropagation(); setSaved(!saved); }} className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow hover:bg-white">
          <Heart className={cn("w-4 h-4 transition-colors", saved ? "fill-red-500 text-red-500" : "text-gray-600")} />
        </button>
        <span className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm text-gray-700 text-xs font-medium px-2 py-1 rounded-full">{l.propertyType}</span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-sm truncate mb-0.5">{l.title}</h3>
        <p className="text-xs text-gray-500 mb-3">{l.city}, {l.state}</p>
        <div className="flex items-center justify-between mb-2">
          <div><span className="text-[#1e3a8a] font-bold text-lg">{formatPrice(l.price)}</span><span className="text-gray-400 text-xs ml-1">/mo</span></div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" />{l.bedrooms}</span>
            <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{l.bathrooms}</span>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {l.petFriendly && <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Pet friendly</span>}
          {l.utilitiesIncluded && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">Utilities incl.</span>}
        </div>
        <Link href={`/listings/${l._id}`} onClick={(e) => e.stopPropagation()} className="block text-center text-xs bg-[#1e3a8a] text-white py-2 rounded-lg hover:bg-blue-900 transition-colors font-medium">
          View Listing
        </Link>
      </div>
    </div>
  );
}
