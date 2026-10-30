"use client";
import { use, useState } from "react";
import {
  useConvexAuth,
  useQuery,
  useMutation,
  usePaginatedQuery,
} from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
export default function PropertyUnits({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    listingId = id as Id<"listings">,
    { isAuthenticated } = useConvexAuth();
  const context = useQuery(
    api.units.context,
    isAuthenticated ? { listingId } : "skip",
  );
  const units = usePaginatedQuery(
    api.units.mine,
    context ? { listingId } : "skip",
    { initialNumItems: 10 },
  );
  const audit = usePaginatedQuery(
    api.units.history,
    context ? { listingId } : "skip",
    { initialNumItems: 10 },
  );
  const attach = useMutation(api.units.attachExisting),
    hide = useMutation(api.listings.unpublish),
    publish = useMutation(api.listings.publish);
  const [existing, setExisting] = useState(""),
    [name, setName] = useState(""),
    [independent, setIndependent] = useState(false),
    [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update unit.");
    } finally {
      setBusy(false);
    }
  }
  if (!context)
    return (
      <p role="status" className="p-6">
        Loading property units…
      </p>
    );
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-5">
      <Link className="underline" href="/dashboard/landlord/listings">
        Back to listings
      </Link>
      <h1 className="text-2xl font-bold">Property units</h1>
      <p>
        {context.title} · {context.unitCount} rental{" "}
        {context.unitCount === 1 ? "space" : "spaces"}
      </p>
      <p>
        {context.address}, {context.city}, {context.state} {context.zip}
      </p>
      <p className="text-sm">
        Each space has its own rent, photos, calendar, inquiries and reviews.
        Hiding one leaves other units available. Accepting a stay blocks only
        that unit: coordinate whole-home and room calendars if their physical
        spaces overlap. Each active unit uses one plan slot (Pro: five; Premium:
        unlimited).
      </p>
      <Link
        className="underline"
        href={`/dashboard/landlord/listings/${context.primaryListingId}/location`}
      >
        Manage shared property location
      </Link>
      {context.canAdd ? (
        <Button asChild>
          <Link
            href={`/dashboard/landlord/listings/new?parent=${context.primaryListingId}`}
          >
            Add another rental space
          </Link>
        </Button>
      ) : (
        <div role="status">
          {context.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {units.results.map((unit) => (
          <article key={unit._id} className="border rounded-xl p-4 space-y-2">
            <h2 className="font-semibold">
              {unit.unitName ?? "Main rental space"} · {unit.title}
            </h2>
            <p>
              ${unit.price}/month · {unit.status} · {unit.publicId}
            </p>
            {unit.publication.issues.map((issue) => (
              <p className="text-sm" key={issue}>
                {issue}
              </p>
            ))}
            <div className="flex flex-wrap gap-4 text-sm">
              <Link className="underline" href={`/listings/${unit._id}`}>
                Preview
              </Link>
              <Link
                className="underline"
                href={`/dashboard/landlord/listings/${unit._id}/edit`}
              >
                Edit details and photos
              </Link>
              <Link
                className="underline"
                href={`/dashboard/landlord/listings/${unit._id}/availability`}
              >
                Calendar
              </Link>
              <Button
                disabled={busy}
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    () =>
                      unit.publication.requested
                        ? hide({ id: unit._id })
                        : publish({ id: unit._id }),
                    unit.publication.requested
                      ? "Unit hidden"
                      : "Publication requested",
                  )
                }
              >
                {unit.publication.requested
                  ? "Hide unit"
                  : "Request publication"}
              </Button>
            </div>
          </article>
        ))}
      </div>
      {units.status === "CanLoadMore" && (
        <Button onClick={() => units.loadMore(10)}>More units</Button>
      )}
      {context.canAdd && (
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Group an existing listing</h2>
          <p className="text-sm">
            Enter its listing ID (the last part of its dashboard URL). It must
            belong to you and have exactly the same address. Its history remains
            attached to that listing, and staff must review its content again.
          </p>
          <label className="block">
            Existing listing ID
            <Input
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
            />
          </label>
          <label className="block">
            Unit name
            <Input
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={independent}
              onChange={(e) => setIndependent(e.target.checked)}
            />
            This is a distinct space that can be rented independently.
          </label>
          <Button
            disabled={busy || !existing.trim() || !name.trim() || !independent}
            onClick={() =>
              run(
                () =>
                  attach({
                    parentListingId: context.primaryListingId,
                    listingId: existing.trim() as Id<"listings">,
                    unitName: name,
                    independentSpace: independent,
                  }),
                "Existing listing grouped; review required",
              )
            }
          >
            Group existing space
          </Button>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-semibold">Property history</h2>
        {audit.results.map((event, i) => (
          <p key={`${event.createdAt}-${i}`} className="text-sm">
            {new Date(event.createdAt).toLocaleString()} · {event.note}
          </p>
        ))}
        {audit.status === "CanLoadMore" && (
          <Button onClick={() => audit.loadMore(10)}>More history</Button>
        )}
      </section>
    </main>
  );
}
