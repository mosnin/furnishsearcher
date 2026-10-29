"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  useQuery,
  useMutation,
  usePaginatedQuery,
  useConvexAuth,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import Image from "next/image";
import { Heart, Bed, Bath, MapPin, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RemoveSavedDialog } from "@/components/remove-saved-dialog";
import { toast } from "sonner";

export default function SavedListingsPage() {
  const { userId: clerkId } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convexUser = useQuery(
    api.users.getByClerkId,
    isAuthenticated && clerkId ? { clerkId } : "skip",
  );
  const {
    results: saved,
    status,
    loadMore,
  } = usePaginatedQuery(api.saved.mine, convexUser?._id ? {} : "skip", {
    initialNumItems: 18,
  });
  const unsave = useMutation(api.saved.unsave);
  const [pending, setPending] = useState<Id<"listings"> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPending(null);
  }, [convexUser?._id]);
  async function remove() {
    if (!pending || !convexUser || busy) return;
    setBusy(true);
    try {
      await unsave({ tenantId: convexUser._id, listingId: pending });
      setPending(null);
      toast.success("Removed from saved");
    } catch {
      toast.error("Could not remove. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!isLoading && !isAuthenticated)
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Saved Listings</h1>
        <p>Sign in to see your saved listings.</p>
        <Button asChild>
          <Link href="/sign-in?redirect_url=/dashboard/tenant/saved">
            Sign in
          </Link>
        </Button>
      </div>
    );
  if (
    isLoading ||
    convexUser === undefined ||
    (convexUser && status === "LoadingFirstPage")
  )
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  if (!convexUser)
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Saved Listings</h1>
        <p>Complete your account to manage saved listings.</p>
        <Button asChild>
          <Link href="/onboarding">Complete account</Link>
        </Button>
      </div>
    );
  const more = status === "CanLoadMore" || status === "LoadingMore";
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Saved Listings</h1>
        <p className="text-slate-500 text-sm mt-1" role="status">
          {!saved.length
            ? "You haven't saved any listings yet."
            : `${saved.length} saved ${saved.length === 1 ? "listing" : "listings"} loaded${more ? " · More available below" : ""}`}
        </p>
      </header>
      {!saved.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Heart className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No saved listings yet</p>
          <p className="text-slate-500 text-sm mt-1 mb-4">
            Tap the heart on any listing to save it for later.
          </p>
          <Button asChild className="bg-primary hover:bg-primary">
            <Link href="/search">Browse listings</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {saved.map((entry) => {
            const l = entry.listing;
            return (
              <article
                key={entry._id}
                className="group rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
              >
                {l ? (
                  <>
                    <Link
                      href={`/listings/${l._id}`}
                      className="block relative aspect-[4/3] bg-slate-100"
                    >
                      {l.photos[0] ? (
                        <Image
                          src={l.photos[0]}
                          unoptimized={l.photos[0].startsWith("http://")}
                          alt={l.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, 33vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          No photo
                        </div>
                      )}
                    </Link>
                    <div className="p-4 space-y-2">
                      <Link
                        href={`/listings/${l._id}`}
                        className="block font-semibold text-slate-900 line-clamp-1 hover:text-primary"
                      >
                        {l.title}
                      </Link>
                      <div className="flex items-center text-slate-500 text-sm gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {l.city}, {l.state}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-primary font-bold text-lg">
                          {formatPrice(l.price)}
                          <span className="text-slate-400 font-normal text-sm">
                            /mo
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-xs">
                          <span className="flex items-center gap-0.5">
                            <Bed className="h-3.5 w-3.5" />
                            {l.bedrooms}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Bath className="h-3.5 w-3.5" />
                            {l.bathrooms}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-6 space-y-3">
                    <Heart className="h-8 w-8 text-slate-300" />
                    <h2 className="font-semibold text-slate-900">
                      Listing unavailable
                    </h2>
                    <p className="text-sm text-slate-500">
                      This saved listing is not currently public. Keep it here
                      to check again later, or remove it from your list.
                    </p>
                  </div>
                )}
                <div className="px-4 pb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-red-500 hover:text-red-600 hover:bg-red-50"
                    aria-label={`Remove ${l?.title ?? "unavailable listing"} from saved`}
                    onClick={() => setPending(entry.listingId)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {more && (
        <Button
          variant="outline"
          className="w-full"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(18)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more saved listings"}
        </Button>
      )}
      <RemoveSavedDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={() => void remove()}
        busy={busy}
      />
    </div>
  );
}
