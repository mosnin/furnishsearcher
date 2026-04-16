"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Bed,
  Bath,
  Calendar,
  PawPrint,
  Car,
  Heart,
  Share2,
  MapPin,
  CheckCircle2,
  Clock,
  Shield,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { PhotoGallery } from "@/components/photo-gallery";
import { ContactModal } from "@/components/contact-modal";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { StarRating } from "@/components/star-rating";
import { ReviewCard } from "@/components/review-card";
import { ReviewForm } from "@/components/review-form";
import { cn, formatPrice, formatDate } from "@/lib/utils";

// Amenity icon mapping
const AMENITY_ICONS: Record<string, string> = {
  WiFi: "📶",
  Parking: "🅿️",
  "Washer/Dryer": "🧺",
  "Air Conditioning": "❄️",
  Heating: "🔥",
  Kitchen: "🍳",
  Gym: "🏋️",
  Pool: "🏊",
  "Pet Friendly": "🐾",
  Dishwasher: "🍽️",
  TV: "📺",
  Balcony: "🌅",
  "Utilities Included": "💡",
  Elevator: "🛗",
  Doorman: "🚪",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ListingDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();

  const [contactOpen, setContactOpen] = useState(false);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveOptimistic, setSaveOptimistic] = useState<boolean | null>(null);

  // Fetch listing
  const listing = useQuery(api.listings.getById, { id: id as Id<"listings"> });

  // Fetch current user's Convex record
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id ? { clerkId: clerkUser.id } : "skip"
  );

  // Check if saved
  const savedStatus = useQuery(
    api.saved.isSaved,
    convexUser && listing
      ? { tenantId: convexUser._id, listingId: listing._id }
      : "skip"
  );

  // Mutations
  const saveListing = useMutation(api.saved.save);
  const unsaveListing = useMutation(api.saved.unsave);
  const incrementViews = useMutation(api.listings.incrementViews);

  // Featured listings for "Similar" section
  const featuredListings = useQuery(api.listings.getFeatured);

  // Reviews for this listing
  const listingReviews = useQuery(
    api.reviews.getByListing,
    listing?._id ? { listingId: listing._id } : "skip"
  );
  const ratingStats = useQuery(
    api.reviews.getAverageRating,
    listing?.landlordId ? { landlordId: listing.landlordId } : "skip"
  );

  // Sync saved status
  useEffect(() => {
    if (savedStatus !== undefined) {
      setIsSaved(savedStatus);
      setSaveOptimistic(null);
    }
  }, [savedStatus]);

  // Increment view count once on mount
  useEffect(() => {
    if (listing?._id) {
      incrementViews({ id: listing._id }).catch(() => {});
    }
    // Only run on initial listing load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?._id]);

  const displaySaved = saveOptimistic !== null ? saveOptimistic : isSaved;

  const handleSaveToggle = async () => {
    if (!clerkLoaded) return;
    if (!clerkUser) {
      router.push("/sign-in");
      return;
    }
    if (!convexUser || !listing) return;

    const next = !displaySaved;
    setSaveOptimistic(next);

    try {
      if (next) {
        await saveListing({ tenantId: convexUser._id, listingId: listing._id });
        toast.success("Saved to your list");
      } else {
        await unsaveListing({ tenantId: convexUser._id, listingId: listing._id });
        toast.success("Removed from saved");
      }
    } catch {
      setSaveOptimistic(null);
      toast.error("Something went wrong. Please try again.");
    }
  };

  const handleContactClick = () => {
    if (!clerkLoaded) return;
    if (!clerkUser) {
      router.push(`/sign-in?redirect_url=/listings/${id}`);
      return;
    }
    setContactOpen(true);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: listing?.title ?? "FurnishFinder listing", url });
      } catch {
        // User cancelled — that's fine
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  // Loading state
  if (listing === undefined) {
    return <ListingDetailSkeleton />;
  }

  // Not found
  if (listing === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold text-foreground">Listing not found</h1>
        <p className="text-muted-foreground text-sm">
          This listing may have been removed or is no longer available.
        </p>
        <Button asChild>
          <Link href="/">Browse other listings</Link>
        </Button>
      </div>
    );
  }

  const {
    title,
    city,
    state,
    price,
    bedrooms,
    bathrooms,
    propertyType,
    photos,
    petFriendly,
    parkingIncluded,
    utilitiesIncluded,
    availableFrom,
    minStay,
    description,
    amenities,
    landlord,
    landlordId,
  } = listing;

  const landlordName = landlord?.name ?? "Landlord";
  const landlordAvatar = landlord?.avatar;
  const landlordInitials = landlordName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const similarListings = ((featuredListings ?? []) as ListingCardData[])
    .filter((l: ListingCardData) => l._id !== listing._id)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">

        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-1.5 flex-wrap">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>/</span>
          <Link href="/search" className="hover:text-foreground transition-colors">Rentals</Link>
          <span>/</span>
          <Link
            href={`/search?location=${encodeURIComponent(`${city}, ${state}`)}`}
            className="hover:text-foreground transition-colors"
          >
            {city}, {state}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{title}</span>
        </nav>

        {/* Photo gallery */}
        <PhotoGallery photos={photos} title={title} className="mb-8" />

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── Left column (60%) ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">

            {/* Title & location */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="secondary" className="capitalize">{propertyType}</Badge>
                {petFriendly && <Badge variant="success">Pet Friendly</Badge>}
                {utilitiesIncluded && (
                  <Badge variant="success">Utilities Included</Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-2">
                {title}
              </h1>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-sm">
                  {city}, {state}
                </span>
              </div>
            </div>

            {/* Price */}
            <div>
              <p className="text-4xl font-bold text-[#0f2044]">
                {formatPrice(price)}
                <span className="text-lg font-normal text-muted-foreground">/month</span>
              </p>
            </div>

            <Separator />

            {/* Key details row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KeyDetail
                icon={<Bed className="h-5 w-5" />}
                label="Bedrooms"
                value={String(bedrooms)}
              />
              <KeyDetail
                icon={<Bath className="h-5 w-5" />}
                label="Bathrooms"
                value={String(bathrooms)}
              />
              <KeyDetail
                icon={<Clock className="h-5 w-5" />}
                label="Min Stay"
                value={`${minStay} month${minStay === 1 ? "" : "s"}`}
              />
              <KeyDetail
                icon={<Calendar className="h-5 w-5" />}
                label="Available"
                value={formatDate(availableFrom)}
              />
              {petFriendly && (
                <KeyDetail
                  icon={<PawPrint className="h-5 w-5 text-emerald-600" />}
                  label="Pets"
                  value="Welcome"
                  valueClass="text-emerald-600"
                />
              )}
              {parkingIncluded && (
                <KeyDetail
                  icon={<Car className="h-5 w-5" />}
                  label="Parking"
                  value="Included"
                />
              )}
            </div>

            <Separator />

            {/* About */}
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-3">About this property</h2>
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                {description}
              </p>
            </section>

            {/* Amenities */}
            {amenities && amenities.length > 0 && (
              <>
                <Separator />
                <section>
                  <h2 className="text-lg font-semibold text-foreground mb-3">Amenities</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {amenities.map((amenity: string) => (
                      <div
                        key={amenity}
                        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-foreground bg-background"
                      >
                        <span role="img" aria-label={amenity} className="text-base">
                          {AMENITY_ICONS[amenity] ?? "✓"}
                        </span>
                        <span className="font-medium truncate">{amenity}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* Availability */}
            <Separator />
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-3">Availability</h2>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-emerald-50 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Available from {formatDate(availableFrom)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Minimum stay: {minStay} month{minStay === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* ── Right column (40%, sticky) ── */}
          <div className="lg:w-[380px] shrink-0">
            <div className="sticky top-6">
              <Card className="shadow-lg border-border">
                <CardContent className="p-6 flex flex-col gap-5">

                  {/* Price summary */}
                  <div className="text-center pb-2 border-b border-border">
                    <p className="text-2xl font-bold text-[#0f2044]">
                      {formatPrice(price)}
                      <span className="text-sm font-normal text-muted-foreground">/month</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {minStay}+ month minimum stay
                    </p>
                  </div>

                  {/* Landlord info */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      {landlordAvatar && (
                        <AvatarImage src={landlordAvatar} alt={landlordName} />
                      )}
                      <AvatarFallback className="text-sm font-semibold bg-navy-100 text-[#0f2044]">
                        {landlordInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{landlordName}</p>
                      <p className="text-xs text-muted-foreground">Property Owner</p>
                    </div>
                  </div>

                  {/* Contact button */}
                  <Button
                    size="lg"
                    className="w-full text-base font-semibold"
                    onClick={handleContactClick}
                  >
                    Contact Landlord
                  </Button>

                  {/* Save + Share */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 gap-2",
                        displaySaved && "border-rose-300 text-rose-600 hover:bg-rose-50"
                      )}
                      onClick={handleSaveToggle}
                    >
                      <Heart
                        className={cn(
                          "h-4 w-4",
                          displaySaved && "fill-rose-500 text-rose-500"
                        )}
                      />
                      {displaySaved ? "Saved" : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={handleShare}
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </Button>
                  </div>

                  {/* Trust indicators */}
                  <div className="rounded-lg bg-muted/50 px-4 py-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Shield className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>No booking fees — contact directly</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Verified listing on FurnishFinder</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Similar listings */}
        {similarListings.length > 0 && (
          <section className="mt-14">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-foreground">Similar Listings</h2>
              <Button variant="link" asChild className="text-[#0f2044] p-0 h-auto">
                <Link href={`/search?location=${encodeURIComponent(`${city}, ${state}`)}`}>
                  See all in {city}
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {similarListings.map((l) => (
                <ListingCard key={l._id} listing={l} />
              ))}
            </div>
          </section>
        )}

        {/* Reviews section */}
        <section className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-foreground">Reviews</h2>
              {ratingStats && ratingStats.count > 0 && (
                <div className="flex items-center gap-2">
                  <StarRating rating={ratingStats.average} size="sm" />
                  <span className="text-sm text-muted-foreground">
                    {ratingStats.count} {ratingStats.count === 1 ? "review" : "reviews"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {clerkUser && convexUser?.role === "tenant" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setReviewFormOpen(true)}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Write a Review
                </Button>
              )}
              <Button variant="link" asChild className="text-[#0f2044] p-0 h-auto text-sm">
                <Link href={`/landlords/${landlordId}`}>
                  See all reviews
                </Link>
              </Button>
            </div>
          </div>

          {listingReviews === undefined ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : listingReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2 rounded-xl border border-dashed border-border bg-muted/20">
              <p className="text-muted-foreground text-sm">
                No reviews yet for this listing.
              </p>
              {clerkUser && convexUser?.role === "tenant" && (
                <Button
                  variant="link"
                  size="sm"
                  className="text-[#0f2044] p-0 h-auto"
                  onClick={() => setReviewFormOpen(true)}
                >
                  Be the first to leave a review
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {listingReviews.slice(0, 3).map((review) => (
                <ReviewCard
                  key={review._id}
                  rating={review.rating}
                  comment={review.comment}
                  reviewerName={review.reviewerName}
                  reviewerAvatar={review.reviewerAvatar}
                  createdAt={review.createdAt}
                />
              ))}
              {listingReviews.length > 3 && (
                <Button variant="outline" asChild className="self-center">
                  <Link href={`/landlords/${landlordId}`}>
                    See all {listingReviews.length} reviews
                  </Link>
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Contact modal */}
      {convexUser && listing && (
        <ContactModal
          listingId={listing._id}
          landlordId={landlordId}
          landlordName={landlordName}
          isOpen={contactOpen}
          onClose={() => setContactOpen(false)}
        />
      )}

      {/* Review form dialog */}
      {convexUser && listing && (
        <ReviewForm
          listingId={listing._id}
          landlordId={landlordId}
          landlordName={landlordName}
          reviewerId={convexUser._id}
          isOpen={reviewFormOpen}
          onClose={() => setReviewFormOpen(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

function KeyDetail({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-4 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold text-foreground", valueClass)}>{value}</p>
    </div>
  );
}

function ListingDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">
        <Skeleton className="h-4 w-64 mb-4" />
        {/* Gallery */}
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[420px] rounded-xl overflow-hidden mb-8">
          <Skeleton className="col-span-2 row-span-2" />
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 flex flex-col gap-6">
            <div>
              <Skeleton className="h-6 w-24 mb-2" />
              <Skeleton className="h-8 w-full mb-1" />
              <Skeleton className="h-8 w-3/4 mb-2" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-px w-full" />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-px w-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-40 mb-1" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="lg:w-[380px]">
            <Skeleton className="h-[360px] rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
