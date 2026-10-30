"use client";
import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useQuery,
  useMutation,
  usePaginatedQuery,
  useConvexAuth,
} from "convex/react";
import { useAuth } from "@clerk/nextjs";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  Map,
  List,
  Heart,
  Bed,
  Bath,
  MapPin,
  BookmarkPlus,
} from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { toast } from "sonner";
import { RemoveSavedDialog } from "@/components/remove-saved-dialog";
import { useRentalSearch } from "@/components/use-rental-search";
import LeafletMap from "@/components/leaflet-map";
import type { MapListing } from "@/components/map-view";
import { radiusBounds } from "@/lib/geo";
import type { Bounds } from "@/lib/geo";
import { LocationSearch } from "@/components/location-search";
import {
  parseSearchParams,
  buildSearchUrl,
  normalizeSearch,
  parseDate,
  type SearchFilters,
} from "@/lib/search";
import { ListingCard } from "@/components/listing-card";
import { ListingFilters } from "@/components/listing-filters";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSearchAppearance } from "@/components/use-listing-observation";
import { AppliedSearchSummary } from "@/components/applied-search-summary";
import { DAY } from "@/lib/stays";
type Listing = FunctionReturnType<typeof api.search.listings>["page"][number];
type ViewMode = "list" | "map" | "split";
const date = (value?: number) =>
  value === undefined ? "" : new Date(value).toISOString().slice(0, 10);
function SearchPageInner() {
  const params = useSearchParams(),
    router = useRouter(),
    { userId } = useAuth(),
    { isAuthenticated } = useConvexAuth();
  const query = params.toString();
  const parsed = useMemo(() => {
    try {
      return {
        filters: parseSearchParams(new URLSearchParams(query)),
        error: "",
      };
    } catch (error) {
      return {
        filters: {} as SearchFilters,
        error: error instanceof Error ? error.message : "Invalid search.",
      };
    }
  }, [query]);
  const applied = parsed.filters;
  const [draft, setDraft] = useState(applied),
    [location, setLocation] = useState(
      applied.propertyId ??
        applied.location ??
        [applied.city, applied.state].filter(Boolean).join(", "),
    );
  const [moveIn, setMoveIn] = useState(date(applied.moveIn)),
    [moveOut, setMoveOut] = useState(date(applied.moveOut)),
    [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split"),
    [selectedListingId, setSelectedListingId] = useState<string | null>(null),
    [showFilters, setShowFilters] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false),
    [saveName, setSaveName] = useState(""),
    [emailAlerts, setEmailAlerts] = useState(false),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(applied);
    setLocation(
      applied.propertyId ??
        applied.location ??
        [applied.city, applied.state].filter(Boolean).join(", "),
    );
    setMoveIn(date(applied.moveIn));
    setMoveOut(date(applied.moveOut));
    setError("");
    setSelectedListingId(null);
  }, [query]);
  const user = useQuery(
    api.users.getByClerkId,
    isAuthenticated && userId ? { clerkId: userId } : "skip",
  );
  const save = useMutation(api.savedSearches.save);
  const recommendationsReady = useQuery(api.recommendations.status);
  const mapIndexReady = useQuery(api.geo.indexStatus);
  const preparingMap =
    !!(applied.mapBounds || applied.nearLatitude !== undefined) &&
    !mapIndexReady;
  const preparingRecommendations =
    applied.sort === "recommended" && !recommendationsReady;
  const {
    results: listings,
    status,
    loadMore,
  } = useRentalSearch(
    applied,
    !!parsed.error || preparingRecommendations || preparingMap,
  );
  function apply() {
    try {
      const original =
        applied.propertyId ??
        applied.location ??
        [applied.city, applied.state].filter(Boolean).join(", ");
      const filters: SearchFilters = {
        ...draft,
        ...(location.trim() === original
          ? {
              location: applied.location,
              city: applied.city,
              state: applied.state,
              propertyId: applied.propertyId,
            }
          : {
              location: location.trim() || undefined,
              mapBounds: undefined,
              nearLatitude: undefined,
              nearLongitude: undefined,
              radiusMiles: undefined,
              nearLabel: undefined,
              city: undefined,
              state: undefined,
              propertyId: undefined,
              propertyGroupId: undefined,
            }),
        moveIn: undefined,
        moveOut: undefined,
      };
      if (moveIn || moveOut) {
        if (!moveIn || !moveOut) throw new Error("Choose both stay dates.");
        filters.moveIn = parseDate(moveIn);
        filters.moveOut = parseDate(moveOut);
      } else filters.flexibleDays = undefined;
      router.push(buildSearchUrl(filters));
      setError("");
      setShowFilters(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Check your search fields.",
      );
    }
  }
  function clearDates() {
    setMoveIn("");
    setMoveOut("");
    router.push(
      buildSearchUrl({
        ...applied,
        moveIn: undefined,
        moveOut: undefined,
        flexibleDays: undefined,
      }),
    );
  }
  const locationLabel = applied.propertyGroupId
    ? "Rental spaces at this property"
    : applied.propertyId
      ? `Property ${applied.propertyId}`
      : applied.nearLabel ||
        (applied.mapBounds ? "Selected map area" : undefined) ||
        applied.location ||
        [applied.city, applied.state].filter(Boolean).join(", ") ||
        "All locations";
  const [viewport, setViewport] = useState<Bounds | null>(null);
  const mapListings: MapListing[] = useMemo(
    () =>
      listings.flatMap((l) =>
        l.mapLatitude !== undefined && l.mapLongitude !== undefined
          ? [
              {
                id: l._id,
                title: l.title,
                price: l.price,
                lat: l.mapLatitude,
                lng: l.mapLongitude,
                city: l.city,
                state: l.state,
                bedrooms: l.bedrooms,
                bathrooms: l.bathrooms,
                photos: l.photos,
                href: `/listings/${l._id}${l.matchedMoveIn !== undefined ? `?moveIn=${date(l.matchedMoveIn)}&moveOut=${date(l.matchedMoveOut)}` : ""}`,
              },
            ]
          : [],
      ),
    [listings],
  );
  const more = status === "CanLoadMore",
    loading =
      status === "LoadingFirstPage" || preparingRecommendations || preparingMap;
  const loadControl = (
    <div className="py-5 text-center space-y-2">
      {more && (
        <Button variant="outline" onClick={() => loadMore(24)}>
          {listings.length ? "Load more matches" : "Continue searching"}
        </Button>
      )}
      {status === "LoadingMore" && (
        <p role="status" className="text-sm text-slate-500">
          Searching more properties…
        </p>
      )}
      {more && (
        <p className="text-xs text-slate-500">
          More properties remain to be checked against your criteria.
        </p>
      )}
    </div>
  );
  const grid = (
    <>
      <ListingsGrid
        listings={listings}
        loading={loading && !parsed.error}
        exhausted={status === "Exhausted"}
        selectedId={selectedListingId}
        onSelect={setSelectedListingId}
        userId={user?.role === "tenant" ? user._id : undefined}
      />
      {loadControl}
    </>
  );
  return (
    <div className="public-results min-h-screen flex flex-col">
      <div className="w-search-tools"><button className="w-filter-trigger" aria-expanded={showFilters} onClick={()=>setShowFilters(true)}><SlidersHorizontal size={17}/>Filters</button><button className="w-save-search" disabled={!!parsed.error || (!!user && user.role!=="tenant")} onClick={()=>{if(!user){router.push(`/sign-in?redirect_url=${encodeURIComponent(buildSearchUrl(applied))}`);return;}setSaveName(locationLabel==='All locations'?'My search':locationLabel);setSaveOpen(true);}}>Save search</button><div className="w-view-controls">{(["list","split","map"] as const).map(mode=><button key={mode} aria-label={`${mode} view`} aria-pressed={viewMode===mode} onClick={()=>setViewMode(mode)}>{mode==='map'?<Map size={17}/>:mode==='list'?<List size={17}/>:<span>List & map</span>}</button>)}</div></div>
      <Dialog open={showFilters} onOpenChange={setShowFilters}><DialogContent className="w-filter-dialog"><DialogHeader><DialogTitle>Filters</DialogTitle><DialogDescription className="sr-only">Refine your monthly rental search.</DialogDescription></DialogHeader><div className="w-filter-scroll">      <div className="mx-auto max-w-screen-2xl w-full px-4 pb-4">
        <LocationSearch
          filters={applied}
          onChange={(filters) => router.push(buildSearchUrl(filters))}
        />
      </div>
            <p className="text-xs text-slate-500 mb-3">
              Approximate property areas for {mapListings.length} loaded
              matches. {listings.length - mapListings.length} loaded listings
              have no confirmed map location. Pins may group nearby listings.
              Distances use these approximate areas, not travel routes.
            </p>
<ListingFilters filters={draft} onFilterChange={setDraft} prices={listings.map(l=>l.price)}/></div><div className="w-filter-footer"><button className="w-text-button" onClick={()=>setDraft({location:applied.location,city:applied.city,state:applied.state,propertyId:applied.propertyId,moveIn:applied.moveIn,moveOut:applied.moveOut,flexibleDays:applied.flexibleDays,sort:applied.sort})}>Clear all</button><button className="w-black-button" onClick={apply}>Show results</button></div></DialogContent></Dialog>
      {(error||parsed.error)&&<p role="alert" className="w-search-error px-6">{error||parsed.error} <Link href="/search">Clear search</Link></p>}
      <div className="public-results-header mx-auto w-full flex items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold">
            {loading && !parsed.error
              ? "Searching…"
              : `${listings.length} ${listings.length === 1 ? "match" : "matches"}${more || status === "LoadingMore" ? " loaded" : ""}`}{" "}
            · {locationLabel}
          </h1>
          {applied.moveIn !== undefined && (
            <p className="text-xs text-slate-500">
              Requested {date(applied.moveIn)} → {date(applied.moveOut)}
              {applied.flexibleDays
                ? ` · ±${applied.flexibleDays} days`
                : " · Exact dates"}
            </p>
          )}
        </div>
        <label className="text-xs text-slate-500">
          Sort
          <select
            className="ml-2 rounded-xl border p-2 text-sm bg-white text-slate-700"
            value={applied.sort ?? "newest"}
            onChange={(e) =>
              router.push(
                buildSearchUrl({
                  ...applied,
                  sort: e.target.value as SearchFilters["sort"],
                }),
              )
            }
          >
            <option value="recommended" disabled={!recommendationsReady}>
              Recommended
            </option>
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low–High</option>
            <option value="price_desc">Price: High–Low</option>
            <option value="most_viewed">Most viewed</option>
          </select>
        </label>
      </div>
      {preparingMap && (
        <p
          className="mx-auto max-w-screen-2xl w-full px-4 pb-4 text-sm text-slate-600"
          role="status"
        >
          Preparing map search. You can use a list search while it finishes.
        </p>
      )}
      {applied.sort === "recommended" && (
        <p
          className="mx-auto max-w-screen-2xl w-full px-4 pb-4 text-sm text-slate-600"
          role="status"
        >
          {preparingRecommendations
            ? "Preparing recommended order. You can use another sort while it finishes."
            : "Matching rentals ordered by measured reply history, then recency. New rentals start with a neutral score."}
        </p>
      )}
      <main className="public-results-main flex-1 mx-auto w-full">
        {viewMode === "list" ? (
          grid
        ) : (
          <>
            <div
              className="w-search-split"
              style={{ minHeight: "60vh" }}
            >
              {viewMode === "split" && <div className="w-search-cards">{grid}</div>}
              <div className="w-search-map">
                <div className="flex gap-2 mb-2">
                  <Button
                    variant="outline"
                    disabled={!viewport}
                    onClick={() =>
                      viewport &&
                      router.push(
                        buildSearchUrl({
                          ...applied,
                          mapBounds: viewport,
                          city: undefined,
                          state: undefined,
                          location: undefined,
                          propertyId: undefined,
                        }),
                      )
                    }
                  >
                    Search this map area
                  </Button>
                  {applied.mapBounds && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        router.push(
                          buildSearchUrl({ ...applied, mapBounds: undefined }),
                        )
                      }
                    >
                      Clear map area
                    </Button>
                  )}
                </div>
                <LeafletMap
                  observeSearch
                  fitKey={query}
                  bounds={
                    applied.mapBounds ??
                    (applied.nearLatitude !== undefined
                      ? radiusBounds(
                          {
                            latitude: applied.nearLatitude,
                            longitude: applied.nearLongitude!,
                          },
                          applied.radiusMiles!,
                        )
                      : undefined)
                  }
                  reference={
                    applied.nearLatitude !== undefined
                      ? {
                          latitude: applied.nearLatitude,
                          longitude: applied.nearLongitude!,
                        }
                      : undefined
                  }
                  onViewport={setViewport}
                  listings={mapListings}
                  selectedId={selectedListingId}
                  onSelectListing={setSelectedListingId}
                />
              </div>
            </div>
            {viewMode === "map" && loadControl}
          </>
        )}
      </main>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>
              Save every applied filter, including dates, amenities and sorting.
              Alerts check the same criteria.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return;
              setSaving(true);
              try {
                await save({
                  ...applied,
                  userId: user._id,
                  name: saveName,
                  emailAlerts,
                });
                setSaveOpen(false);
                toast.success("Search saved");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Unable to save search.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <label className="text-sm">
              Search name
              <input
                required
                maxLength={100}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="block w-full rounded-md border p-2 mt-2"
              />
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
              />
              Email me about new matching listings
            </label>
            <Button disabled={saving}>
              {saving ? "Saving…" : "Save search"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading search…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
function ListingsGrid({
  listings,
  loading,
  exhausted,
  selectedId,
  onSelect,
  userId,
}: {
  listings: Listing[];
  loading: boolean;
  exhausted: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  userId?: Id<"users">;
}) {
  if (loading)
    return (
      <div className="w-results-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-72 rounded-2xl bg-slate-200 animate-pulse"
          />
        ))}
      </div>
    );
  if (!listings.length)
    return (
      <div className="text-center py-16 text-slate-500">
        <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <h2 className="font-semibold">
          {exhausted
            ? "No matching listings"
            : "No matches in the properties checked yet"}
        </h2>
        <p className="text-sm mt-2">
          {exhausted
            ? "Adjust your dates, location or filters."
            : "Continue searching to check more properties."}
        </p>
      </div>
    );
  return (
    <div className="w-results-grid">
      {listings.map((l) => (
        <SearchListingCard
          key={l._id}
          listing={l}
          userId={userId}
          selected={selectedId === l._id}
          onSelect={() => onSelect(selectedId === l._id ? null : l._id)}
        />
      ))}
    </div>
  );
}
function SearchListingCard({listing,selected,onSelect}:{listing:Listing;selected:boolean;onSelect:()=>void;userId?:Id<"users">}) {
 const appearanceRef=useSearchAppearance(listing._id);
 const stay=new URLSearchParams();if(listing.matchedMoveIn!==undefined){stay.set('moveIn',date(listing.matchedMoveIn));stay.set('moveOut',date(listing.matchedMoveOut));}
 return <article ref={appearanceRef} className="w-search-result" data-selected={selected}><ListingCard listing={listing} href={`/listings/${listing._id}${stay.size?`?${stay}`:''}`}/>{listing.matchedMoveIn!==undefined&&<p className="w-matched-stay">{date(listing.matchedMoveIn)} – {date(listing.matchedMoveOut)}</p>}{listing.distanceMiles!==undefined&&<p className="w-matched-stay">About {listing.distanceMiles.toFixed(1)} miles from your reference</p>}{listing.mapLatitude!==undefined&&<button className="w-show-on-map" aria-pressed={selected} onClick={onSelect}>Show on map</button>}</article>;
}
