"use client";
import { use, useState } from "react";
import {
  useConvexAuth,
  useQuery,
  useAction,
  useMutation,
  usePaginatedQuery,
} from "convex/react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import LeafletMap from "@/components/leaflet-map";
export default function ListingLocation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    listingId = id as Id<"listings">,
    { isAuthenticated } = useConvexAuth(),
    { userId } = useAuth();
  const me = useQuery(
      api.users.getByClerkId,
      isAuthenticated && userId ? { clerkId: userId } : "skip",
    ),
    listing = useQuery(api.listings.getById, me ? { id: listingId } : "skip"),
    state = useQuery(api.geo.mine, listing ? { listingId } : "skip");
  const capabilities = useQuery(api.geo.capabilities, {});
  const lookup = useAction(api.geo.lookupListing),
    confirm = useMutation(api.geo.confirm),
    correct = useMutation(api.geo.correctAddress);
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [address, setAddress] = useState(""),
    [note, setNote] = useState("");
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not update location.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (listing === undefined)
    return (
      <p role="status" className="p-6">
        Loading property location…
      </p>
    );
  if (!listing) return <p className="p-6">This property is unavailable.</p>;
  if (listing.parentListingId)
    return (
      <main className="max-w-3xl p-6 space-y-4">
        <h1 className="text-2xl font-bold">Shared property location</h1>
        <p>
          This unit uses its property’s confirmed address and approximate map
          area.
        </p>
        <Link
          className="underline"
          href={`/dashboard/landlord/listings/${listing.parentListingId}/location`}
        >
          Manage shared property location
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5">
      <Link className="text-sm underline" href="/dashboard/landlord/listings">
        Back to properties
      </Link>
      <h1 className="text-2xl font-bold">Confirm property location</h1>
      <p className="text-sm text-slate-600">{listing.title}</p>
      <div className="rounded-xl border bg-white p-4 space-y-2">
        <p className="font-medium">Private property address</p>
        <p>
          {listing.address}, {listing.city}, {listing.state} {listing.zip}
        </p>
        <p className="text-sm text-slate-600">
          The public map shows an approximate area about one kilometer across.
          The exact address and source coordinates remain private. A confirmed
          match changes the content revision and requires staff approval again.
        </p>
      </div>
      {state?.status === "confirmed" ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-800">
            Address match confirmed: {state.matchedAddress}
          </p>
          <p className="text-sm text-slate-600">
            Contact support for a minor address correction. Use a new listing
            for a different property.
          </p>
          {listing.mapLatitude !== undefined &&
            listing.mapLongitude !== undefined && (
              <div className="h-80">
                <LeafletMap
                  fitKey={id}
                  selectedId={id}
                  listings={[
                    {
                      id,
                      title: listing.title,
                      lat: listing.mapLatitude,
                      lng: listing.mapLongitude,
                      price: listing.price,
                      city: listing.city,
                      state: listing.state,
                      bedrooms: listing.bedrooms,
                      bathrooms: listing.bathrooms,
                      photos: listing.photos,
                    },
                  ]}
                />
              </div>
            )}
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              Send this address to{" "}
              {capabilities?.provider === "geoapify"
                ? "Geoapify"
                : "the US Census Bureau's geocoder"}{" "}
              to find an address match. I will confirm that the result matches
              my property.
            </span>
          </label>
          <Button
            disabled={busy || !capabilities || !consent}
            onClick={() =>
              run(
                () =>
                  lookup({
                    listingId,
                    consent,
                    expectedProvider: capabilities?.provider,
                  }),
                "Address lookup finished. Inspect the match before confirming.",
              )
            }
          >
            {busy ? "Finding address…" : "Find address match"}
          </Button>
          {state?.status === "failed" && (
            <p className="text-sm text-amber-800">
              No matching street number, state and ZIP was confirmed. Check the
              address or contact support. A city center will not be used as a
              property pin.
            </p>
          )}
          {state?.candidates.map((c, i) => (
            <div
              key={`${state.generation}-${i}`}
              className="rounded border p-3 space-y-2"
            >
              <p>{c.label}</p>
              <p className="text-xs text-slate-500">
                Provider: {c.provider} · Confirm only if this is the same
                property. Geocoding is an estimated address location.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      confirm({
                        listingId,
                        generation: state.generation,
                        candidate: i,
                      }),
                    "Location confirmed. Request staff review of the new content revision.",
                  )
                }
              >
                Confirm this property address
              </Button>
            </div>
          ))}
        </div>
      )}
      {me?.role === "admin" && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">
            Staff: correct a minor address error
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-600">
              Street number, city, state and ZIP must remain the same. This
              removes the old map point and approval until a new address match
              is confirmed and reviewed.
            </p>
            <label className="block text-sm">
              Corrected street address
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={300}
              />
            </label>
            <label className="block text-sm">
              Private audit note
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
              />
            </label>
            <Button
              variant="outline"
              disabled={busy || !address.trim() || note.trim().length < 10}
              onClick={() =>
                run(
                  () =>
                    correct({
                      listingId,
                      address,
                      city: listing.city,
                      state: listing.state,
                      zip: listing.zip,
                      note,
                    }),
                  "Correction recorded. Confirm a new provider match before requesting review.",
                )
              }
            >
              Record address correction
            </Button>
          </div>
        </details>
      )}
      {me?.role === "admin" && <LocationHistory listingId={listingId} />}
      <Link className="underline text-sm" href="/dashboard/support">
        Contact support about this location
      </Link>
    </main>
  );
}

function LocationHistory({ listingId }: { listingId: Id<"listings"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.geo.history,
    { listingId },
    { initialNumItems: 10 },
  );
  return (
    <details className="rounded border p-4">
      <summary className="cursor-pointer">Private location audit</summary>
      <div className="space-y-2 pt-3">
        {results.map((r, i) => (
          <div key={`${r.createdAt}-${i}`} className="text-sm">
            <p className="font-medium">
              {r.action} · {new Date(r.createdAt).toLocaleString()}
            </p>
            <p>{r.note}</p>
            <p className="text-xs text-slate-500">Actor: {r.actorId}</p>
          </div>
        ))}
        {status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => loadMore(10)}>
            Older location changes
          </Button>
        )}
      </div>
    </details>
  );
}
