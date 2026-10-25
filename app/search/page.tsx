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
import { ListingFilters } from "@/components/listing-filters";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  const {
    results: listings,
    status,
    loadMore,
  } = useRentalSearch(applied, !!parsed.error);
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
    loading = status === "LoadingFirstPage";
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
        userId={user?._id}
      />
      {loadControl}
    </>
  );
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white/90 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 space-y-3">
          {!parsed.error && <AppliedSearchSummary filters={applied} />}
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/" className="font-semibold text-[#0f2044] text-[17px]">
              FurnishFinder
            </Link>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                apply();
              }}
              className="flex flex-1 gap-2 items-center min-w-64"
            >
              <label className="sr-only" htmlFor="search-location">
                City, state, ZIP or property ID
              </label>
              <div className="flex flex-1 gap-2 items-center bg-slate-100 rounded-2xl p-3">
                <MapPin className="w-4 h-4 text-slate-400" />
                <input
                  id="search-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, state, ZIP or property ID"
                  maxLength={200}
                  className="bg-transparent text-sm outline-none w-full"
                />
              </div>
              <Button type="submit" aria-label="Search properties">
                <Search className="w-4 h-4" />
              </Button>
            </form>
            <Button
              variant="outline"
              aria-expanded={showFilters}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filters
            </Button>
            <Button
              variant="outline"
              disabled={!!parsed.error}
              onClick={() => {
                if (!user) {
                  router.push(
                    `/sign-in?redirect_url=${encodeURIComponent(buildSearchUrl(applied))}`,
                  );
                  return;
                }
                setSaveName(
                  locationLabel === "All locations"
                    ? "My search"
                    : locationLabel,
                );
                setSaveOpen(true);
              }}
            >
              <BookmarkPlus className="w-4 h-4 mr-2" />
              Save search
            </Button>
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              {(["list", "split", "map"] as const).map((mode) => (
                <button
                  key={mode}
                  aria-label={`${mode} view`}
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "rounded-lg p-2",
                    viewMode === mode && "bg-white shadow-sm text-[#0f2044]",
                  )}
                >
                  {mode === "map" ? (
                    <Map className="w-4 h-4" />
                  ) : mode === "list" ? (
                    <List className="w-4 h-4" />
                  ) : (
                    <span className="flex">
                      <List className="w-3 h-4" />
                      <Map className="w-3 h-4" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
            className="flex gap-3 items-end flex-wrap"
          >
            <label className="text-xs text-slate-600">
              Move-in
              <input
                type="date"
                value={moveIn}
                onChange={(e) => setMoveIn(e.target.value)}
                className="block rounded-lg border p-2 text-sm bg-white"
              />
            </label>
            <label className="text-xs text-slate-600">
              Move-out (checkout)
              <input
                type="date"
                value={moveOut}
                onChange={(e) => setMoveOut(e.target.value)}
                className="block rounded-lg border p-2 text-sm bg-white"
              />
            </label>
            <label className="text-xs text-slate-600">
              Date flexibility
              <select
                value={draft.flexibleDays ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, flexibleDays: Number(e.target.value) })
                }
                className="block rounded-lg border p-2 text-sm bg-white"
              >
                <option value={0}>Exact dates</option>
                {[7, 14, 30].map((n) => (
                  <option key={n} value={n}>
                    ±{n} days
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline">
              Apply dates
            </Button>
            <Button type="button" variant="ghost" onClick={clearDates}>
              Clear dates
            </Button>
            <p className="text-xs text-slate-500 flex-1 min-w-48 pb-2">
              Minimum stay 30 days. With flexibility, each date may move within
              the chosen range; matching stay dates appear on each result.
            </p>
          </form>
          {(error || parsed.error) && (
            <p role="alert" className="text-sm text-red-700">
              {error || parsed.error}{" "}
              <Link className="underline" href="/search">
                Clear search
              </Link>
            </p>
          )}
          {showFilters && (
            <div className="border-t pt-4 pb-2">
              <ListingFilters filters={draft} onFilterChange={setDraft} />
              <div className="flex gap-3 mt-5">
                <Button onClick={apply}>Apply filters</Button>
                <Button variant="ghost" onClick={() => router.push("/search")}>
                  Clear all
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto w-full p-4 flex items-center justify-between gap-3">
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
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low–High</option>
            <option value="price_desc">Price: High–Low</option>
            <option value="most_viewed">Most viewed</option>
          </select>
        </label>
      </div>
      <div className="mx-auto max-w-screen-2xl w-full px-4 pb-4">
        <LocationSearch
          filters={applied}
          onChange={(filters) => router.push(buildSearchUrl(filters))}
        />
      </div>
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 pb-8">
        {viewMode === "list" ? (
          grid
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">
              Approximate property areas for {mapListings.length} loaded
              matches. {listings.length - mapListings.length} loaded listings
              have no confirmed map location. Pins may group nearby listings.
              Distances use these approximate areas, not travel routes.
            </p>
            <div
              className="flex flex-col md:flex-row gap-4"
              style={{ minHeight: "60vh" }}
            >
              {viewMode === "split" && <div className="md:w-[52%]">{grid}</div>}
              <div className="flex-1 h-[60vh] md:sticky md:top-48">
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
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
function SearchListingCard({
  listing: l,
  selected,
  onSelect,
  userId,
}: {
  listing: Listing;
  selected: boolean;
  onSelect: () => void;
  userId?: Id<"users">;
}) {
  const router = useRouter();
  const saved = useQuery(
      api.saved.isSaved,
      userId ? { tenantId: userId, listingId: l._id } : "skip",
    ),
    save = useMutation(api.saved.save),
    unsave = useMutation(api.saved.unsave);
  const [busy, setBusy] = useState(false);
  const stay = new URLSearchParams();
  if (l.matchedMoveIn !== undefined) {
    stay.set("moveIn", date(l.matchedMoveIn));
    stay.set("moveOut", date(l.matchedMoveOut));
  }
  return (
    <article
      className={cn(
        "bg-white rounded-2xl overflow-hidden shadow-sm ring-1",
        selected ? "ring-[#0f2044] ring-2" : "ring-black/[0.06]",
      )}
    >
      <div className="relative h-52 bg-slate-100">
        <button
          aria-label={
            l.mapLatitude !== undefined
              ? `Show ${l.title} on the map`
              : `Map location unavailable for ${l.title}`
          }
          disabled={l.mapLatitude === undefined}
          onClick={onSelect}
          className="w-full h-full"
        >
          {l.photos[0] ? (
            <img
              src={l.photos[0]}
              alt={l.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <MapPin className="w-10 h-10 mx-auto text-slate-300" />
          )}
        </button>
        <button
          className="absolute top-3 right-3 bg-white/90 rounded-xl p-2 shadow-sm"
          aria-label={saved ? "Unsave property" : "Save property"}
          aria-pressed={!!saved}
          disabled={busy}
          onClick={async () => {
            if (!userId) {
              router.push("/sign-in");
              return;
            }
            setBusy(true);
            try {
              await (saved ? unsave : save)({
                tenantId: userId,
                listingId: l._id,
              });
            } catch {
              toast.error("Unable to update saved property.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Heart
            className={cn(
              "w-4 h-4",
              saved ? "fill-red-500 text-red-500" : "text-slate-600",
            )}
          />
        </button>
        <span className="absolute bottom-3 left-3 bg-white/90 text-xs rounded-lg px-2 py-1">
          {l.propertyType}
        </span>
      </div>
      <div className="p-4">
        <h2 className="font-semibold text-sm truncate">{l.title}</h2>
        <p className="text-xs text-slate-500 mt-1">
          {l.city}, {l.state}
        </p>
        {l.distanceMiles !== undefined && (
          <p className="text-xs text-slate-600 mt-1">
            About {l.distanceMiles.toFixed(1)} miles from your reference ·
            straight-line area estimate
          </p>
        )}
        <p className="text-xs text-slate-400 mt-1 break-all">
          Property ID: {l.publicId ?? l._id}
        </p>
        <div className="flex items-center justify-between my-3">
          <p>
            <strong className="text-[#0f2044] text-lg">
              {formatPrice(l.price)}
            </strong>
            <span className="text-xs text-slate-500"> /mo</span>
          </p>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Bed className="w-3 h-3" />
            {l.bedrooms}
            <Bath className="w-3 h-3" />
            {l.bathrooms}
          </p>
        </div>
        {l.matchedMoveIn !== undefined && (
          <p className="rounded-lg bg-blue-50 text-xs text-blue-900 p-2 mb-3">
            Available stay: {date(l.matchedMoveIn)} → {date(l.matchedMoveOut)} ·{" "}
            {Math.round((l.matchedMoveOut! - l.matchedMoveIn) / DAY)} nights
          </p>
        )}
        <Link
          href={`/listings/${l._id}${stay.size ? `?${stay}` : ""}`}
          className="block text-center bg-[#0f2044] hover:bg-[#1a3360] text-white rounded-xl py-2 text-sm"
        >
          View listing
        </Link>
      </div>
    </article>
  );
}
