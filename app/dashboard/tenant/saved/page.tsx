"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import Link from "next/link";
import Image from "next/image";
import { Heart, Bed, Bath, MapPin, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type SavedEntry = Doc<"savedListings"> & {
  listing: Doc<"listings"> | null;
};

export default function SavedListingsPage() {
  const { userId: clerkId } = useAuth();
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkId ? { clerkId } : "skip"
  ) as { _id: Id<"users"> } | null | undefined;

  const saved = useQuery(
    api.saved.getSaved,
    convexUser?._id ? { tenantId: convexUser._id } : "skip"
  ) as SavedEntry[] | undefined;

  const unsave = useMutation(api.saved.unsave);

  const handleUnsave = async (listingId: Id<"listings">) => {
    if (!convexUser?._id) return;
    try {
      await unsave({ tenantId: convexUser._id, listingId });
      toast.success("Removed from saved");
    } catch {
      toast.error("Could not remove");
    }
  };

  if (saved === undefined) {
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
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Saved Listings</h1>
        <p className="text-slate-500 text-sm mt-1">
          {saved.length === 0
            ? "You haven't saved any listings yet."
            : `${saved.length} saved ${saved.length === 1 ? "listing" : "listings"}`}
        </p>
      </div>

      {saved.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Heart className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No saved listings yet</p>
          <p className="text-slate-500 text-sm mt-1 mb-4">
            Tap the heart on any listing to save it for later.
          </p>
          <Button asChild className="bg-[#1e3a8a] hover:bg-[#0f2044]">
            <Link href="/search">Browse listings</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {saved.map((entry) => {
            const l = entry.listing;
            if (!l) return null;
            const firstPhoto = l.photos?.[0];
            return (
              <div
                key={entry._id}
                className="group rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
              >
                <Link
                  href={`/listings/${l._id}`}
                  className="block relative aspect-[4/3] bg-slate-100"
                >
                  {firstPhoto ? (
                    <Image
                      src={firstPhoto}
                      alt={l.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      No photo
                    </div>
                  )}
                </Link>
                <div className="p-4 space-y-2">
                  <Link
                    href={`/listings/${l._id}`}
                    className="block font-semibold text-slate-900 line-clamp-1 hover:text-[#1e3a8a]"
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
                    <div className="text-[#1e3a8a] font-bold text-lg">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 -mx-1 mt-1"
                    onClick={() => handleUnsave(l._id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
