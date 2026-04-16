"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ListingCard } from "@/components/listing-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";

function ListingCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white">
      <Skeleton className="h-52 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-4 pt-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

export default function FeaturedListings() {
  const listings = useQuery(api.listings.getFeatured);
  const isLoading = listings === undefined;

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="inline-block text-xs font-bold text-[#0f2044] uppercase tracking-widest mb-3 bg-blue-50 px-4 py-1.5 rounded-full">
              Just Listed
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              Featured Rentals
            </h2>
            <p className="text-gray-500 mt-2 text-base">
              Hand-picked furnished homes available now
            </p>
          </div>
          <Link
            href="/search"
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-[#0f2044] hover:text-[#1a3360] transition-colors group"
          >
            View all listings
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="text-gray-400 text-lg font-medium mb-2">
              No featured listings yet
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Be the first to list your furnished property.
            </p>
            <Link
              href="/list-your-property"
              className="inline-flex items-center gap-2 bg-[#0f2044] hover:bg-[#1a3360] text-white font-semibold rounded-xl px-6 py-3 text-sm transition-colors"
            >
              List a Property
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <ListingCard
                key={listing._id}
                listing={{
                  _id: listing._id,
                  title: listing.title,
                  city: listing.city,
                  state: listing.state,
                  price: listing.price,
                  bedrooms: listing.bedrooms,
                  bathrooms: listing.bathrooms,
                  propertyType: listing.propertyType,
                  photos: listing.photos,
                  petFriendly: listing.petFriendly,
                  parkingIncluded: listing.parkingIncluded,
                  utilitiesIncluded: listing.utilitiesIncluded,
                  availableFrom: listing.availableFrom,
                  minStay: listing.minStay,
                }}
              />
            ))}
          </div>
        )}

        {/* Mobile CTA */}
        <div className="mt-10 text-center sm:hidden">
          <Link
            href="/search"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f2044] hover:text-[#1a3360] transition-colors"
          >
            View all listings <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
