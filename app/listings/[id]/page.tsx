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
  Wifi,
  WashingMachine,
  AirVent,
  Flame,
  UtensilsCrossed,
  Dumbbell,
  Waves,
  Tv,
  Zap,
  ArrowUpDown,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PhotoGallery } from "@/components/photo-gallery";
import { ContactModal } from "@/components/contact-modal";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { StarRating } from "@/components/star-rating";
import { ReviewCard } from "@/components/review-card";
import { ReviewForm } from "@/components/review-form";
import { LandlordBadges } from "@/components/landlord-badges";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { cn, formatPrice, formatDate } from "@/lib/utils";

const AMENITY_ICONS: Record<string, React.ElementType> = {
  WiFi: Wifi,
  Parking: Car,
  "Washer/Dryer": WashingMachine,
  "Air Conditioning": AirVent,
  Heating: Flame,
  Kitchen: UtensilsCrossed,
  Gym: Dumbbell,
  Pool: Waves,
  "Pet Friendly": PawPrint,
  Dishwasher: UtensilsCrossed,
  TV: Tv,
  Balcony: Sun,
  "Utilities Included": Zap,
  Elevator: ArrowUpDown,
  Doorman: ShieldCheck,
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

  // Availability blocks for this listing
  const availabilityBlocks = useQuery(
    api.availability.getByListing,
    listing?._id ? { listingId: listing._id } : "skip"
  );

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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">

        {/* Breadcrumb */}
        <nav className="text-[13px] text-slate-500 mb-4 flex items-center gap-1.5 flex-wrap">
          <Link href="/" className="hover:text-slate-800 transition-colors">Home</Link>
          <span className="text-slate-300">/</span>
          <Link href="/search" className="hover:text-slate-800 transition-colors">Rentals</Link>
          <span className="text-slate-300">/</span>
          <Link
            href={`/search?location=${encodeURIComponent(`${city}, ${state}`)}`}
            className="hover:text-slate-800 transition-colors"
          >
            {city}, {state}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-medium truncate max-w-[200px]">{title}</span>
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
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[12px] font-medium capitalize">{propertyType}</span>
                {petFriendly && <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[12px] font-medium border border-emerald-100">Pet Friendly</span>}
                {utilitiesIncluded && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-[12px] font-medium border border-blue-100">Utilities Included</span>
                )}
              </div>
              <h1 className="text-[26px] sm:text-[30px] font-bold text-slate-900 leading-tight mb-2">
                {title}
              </h1>
              <div className="flex items-center gap-1.5 text-slate-500">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-[14px]">
                  {city}, {state}
                </span>
              </div>
            </div>

            {/* Price */}
            <div>
              <p className="text-[36px] font-bold text-[#0f2044] leading-none">
                {formatPrice(price)}
                <span className="text-[17px] font-normal text-slate-500 ml-1">/month</span>
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
              <h2 className="text-[17px] font-semibold text-slate-900 mb-3">About this property</h2>
              <p className="text-slate-600 text-[14px] leading-relaxed whitespace-pre-line">
                {description}
              </p>
            </section>

            {/* Amenities */}
            {amenities && amenities.length > 0 && (
              <>
                <Separator />
                <section>
                  <h2 className="text-[17px] font-semibold text-slate-900 mb-3">Amenities</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {amenities.map((amenity: string) => {
                      const AmenityIcon = AMENITY_ICONS[amenity] ?? CheckCircle2;
                      return (
                        <div
                          key={amenity}
                          className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] text-slate-700 bg-white"
                        >
                          <AmenityIcon className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="font-medium truncate">{amenity}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* Availability */}
            <Separator />
            <section>
              <h2 className="text-[17px] font-semibold text-slate-900 mb-3">Availability</h2>
              <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 mb-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-slate-900">
                    Available from {formatDate(availableFrom)}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    Minimum stay: {minStay} month{minStay === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {availabilityBlocks === undefined ? (
                <Skeleton className="h-64 w-full rounded-xl" />
              ) : availabilityBlocks.length > 0 ? (
                <AvailabilityCalendar
                  blocks={availabilityBlocks}
                  editable={false}
                />
              ) : null}
            </section>
          </div>

          {/* ── Right column (40%, sticky) ── */}
          <div className="lg:w-[380px] shrink-0">
            <div className="sticky top-6">
              <div className="bg-white rounded-2xl ring-1 ring-black/[0.06] shadow-sm p-6 flex flex-col gap-5">

                  {/* Price summary */}
                  <div className="text-center pb-4 border-b border-slate-100">
                    <p className="text-[26px] font-bold text-[#0f2044] leading-none">
                      {formatPrice(price)}
                      <span className="text-[15px] font-normal text-slate-500 ml-1">/month</span>
                    </p>
                    <p className="text-[12px] text-slate-500 mt-1">
                      {minStay}+ month minimum stay
                    </p>
                  </div>

                  {/* Landlord info */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      {landlordAvatar && (
                        <AvatarImage src={landlordAvatar} alt={landlordName} />
                      )}
                      <AvatarFallback className="text-[13px] font-semibold bg-slate-100 text-[#0f2044]">
                        {landlordInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-[14px] truncate">{landlordName}</p>
                      <p className="text-[12px] text-slate-500">Property Owner</p>
                      {ratingStats && ratingStats.count > 0 && landlord && (
                        <LandlordBadges
                          averageRating={ratingStats.average}
                          reviewCount={ratingStats.count}
                          memberSinceMs={landlord.createdAt}
                          className="mt-1"
                        />
                      )}
                    </div>
                  </div>

                  {/* Contact button */}
                  <button
                    onClick={handleContactClick}
                    className="w-full h-11 bg-[#0f2044] hover:bg-[#1a3360] text-white text-[15px] font-semibold rounded-xl transition-colors shadow-sm"
                  >
                    Contact Landlord
                  </button>

                  {/* Save + Share */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveToggle}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border text-[14px] font-medium transition-colors",
                        displaySaved
                          ? "border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <Heart
                        className={cn(
                          "h-4 w-4",
                          displaySaved && "fill-rose-500 text-rose-500"
                        )}
                      />
                      {displaySaved ? "Saved" : "Save"}
                    </button>
                    <button
                      onClick={handleShare}
                      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-slate-200 text-slate-700 text-[14px] font-medium hover:bg-slate-50 transition-colors"
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </button>
                  </div>

                  {/* Trust indicators */}
                  <div className="rounded-xl bg-slate-50 px-4 py-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[12px] text-slate-500">
                      <Shield className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>No booking fees — contact directly</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-slate-500">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Verified listing on FurnishFinder</span>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>

        {/* Similar listings */}
        {similarListings.length > 0 && (
          <section className="mt-14">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[19px] font-semibold text-slate-900">Similar Listings</h2>
              <Link href={`/search?location=${encodeURIComponent(`${city}, ${state}`)}`} className="text-[14px] text-[#0f2044] font-medium hover:underline">
                See all in {city}
              </Link>
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
              <h2 className="text-[19px] font-semibold text-slate-900">Reviews</h2>
              {ratingStats && ratingStats.count > 0 && (
                <div className="flex items-center gap-2">
                  <StarRating rating={ratingStats.average} size="sm" />
                  <span className="text-[13px] text-slate-500">
                    {ratingStats.count} {ratingStats.count === 1 ? "review" : "reviews"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {clerkUser && convexUser?.role === "tenant" && (
                <button
                  onClick={() => setReviewFormOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Write a Review
                </button>
              )}
              <Link href={`/landlords/${landlordId}`} className="text-[13px] text-[#0f2044] font-medium hover:underline">
                See all reviews
              </Link>
            </div>
          </div>

          {listingReviews === undefined ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : listingReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
              <p className="text-slate-500 text-[14px]">
                No reviews yet for this listing.
              </p>
              {clerkUser && convexUser?.role === "tenant" && (
                <button
                  onClick={() => setReviewFormOpen(true)}
                  className="text-[13px] text-[#0f2044] font-medium hover:underline"
                >
                  Be the first to leave a review
                </button>
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
                <Link href={`/landlords/${landlordId}`} className="self-center px-5 py-2 rounded-xl border border-slate-200 text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  See all {listingReviews.length} reviews
                </Link>
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
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-4 text-center">
      <div className="text-slate-400">{icon}</div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={cn("text-[13px] font-semibold text-slate-900", valueClass)}>{value}</p>
    </div>
  );
}

function ListingDetailSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
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
