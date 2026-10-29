"use client";

import {
  PropertySectionNav,
  PropertyDescription,
  PropertyAmenities,
} from "@/components/public-experience/property-sections";
import { usePublicAuth } from "@/components/public-experience/auth-context";
import { RemoveSavedDialog } from "@/components/remove-saved-dialog";
import { ShareListingButton } from "@/components/share-listing-button";
import { ListingResponseTime } from "@/components/response-rate-panel";
import { ListingPhoneContact } from "@/components/listing-phone-contact";
import { PropertyUnits } from "@/components/property-units";
import { ListingDetails } from "@/components/listing-details";
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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PhotoGallery } from "@/components/photo-gallery";
import { BookingInquiry } from "@/components/booking-inquiry";
import { ReportDialog } from "@/components/report-dialog";
import { ContactModal } from "@/components/contact-modal";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { StarRating } from "@/components/star-rating";
import LeafletMap from "@/components/leaflet-map";
import { PublicReviews } from "@/components/public-reviews";
import { ReviewForm } from "@/components/review-form";
import { LandlordBadges } from "@/components/landlord-badges";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import {
  useListingPageView,
  useListingObservation,
} from "@/components/use-listing-observation";
import { cn, formatPrice, formatStayDate } from "@/lib/utils";

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
  const openAuth = usePublicAuth();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();

  const [contactOpen, setContactOpen] = useState(false);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveOptimistic, setSaveOptimistic] = useState<boolean | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  useEffect(() => {
    setConfirmRemoval(false);
    setIsSaved(false);
    setSaveOptimistic(null);
  }, [id, clerkUser?.id]);

  // Fetch listing
  const listing = useQuery(api.listings.getById, { id: id as Id<"listings"> });

  // Fetch current user's Convex record
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id ? { clerkId: clerkUser.id } : "skip",
  );

  // Check if saved
  const savedStatus = useQuery(
    api.saved.isSaved,
    convexUser && listing
      ? { tenantId: convexUser._id, listingId: listing._id }
      : "skip",
  );

  // Mutations
  const saveListing = useMutation(api.saved.save);
  const unsaveListing = useMutation(api.saved.unsave);
  useListingPageView(listing?._id);
  const recordShare = useListingObservation("shares");

  // Featured listings for "Similar" section
  const featuredListings = useQuery(api.listings.getFeatured);

  // Availability blocks for this listing
  const availabilityBlocks = useQuery(
    api.availability.getByListing,
    listing?._id ? { listingId: listing._id } : "skip",
  );

  // Reviews for this listing
  const ratingStats = useQuery(
    api.reviews.getAverageRating,
    listing?.landlordId
      ? { landlordId: listing.landlordId, listingId: listing._id }
      : "skip",
  );

  // Sync saved status
  useEffect(() => {
    if (savedStatus !== undefined) {
      setIsSaved(savedStatus);
      setSaveOptimistic(null);
    }
  }, [savedStatus]);

  const displaySaved = saveOptimistic !== null ? saveOptimistic : isSaved;

  const changeSaved = async (next: boolean) => {
    if (saveBusy) return;
    if (!clerkLoaded) return;
    if (!clerkUser) {
      openAuth();
      return;
    }
    if (convexUser === null) {
      router.push("/onboarding");
      return;
    }
    if (!convexUser || !listing) return;
    if (convexUser.role !== "tenant") {
      toast.error("Saving rentals requires a traveler account.");
      return;
    }

    setSaveBusy(true);
    setSaveOptimistic(next);

    try {
      if (next) {
        await saveListing({ tenantId: convexUser._id, listingId: listing._id });
        toast.success("Saved to your list");
      } else {
        await unsaveListing({
          tenantId: convexUser._id,
          listingId: listing._id,
        });
        toast.success("Removed from saved");
      }
    } catch {
      setSaveOptimistic(null);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaveBusy(false);
    }
    setConfirmRemoval(false);
  };
  const handleSaveToggle = () => {
    if (displaySaved) setConfirmRemoval(true);
    else void changeSaved(true);
  };

  const handleContactClick = () => {
    if (!clerkLoaded) return;
    if (!clerkUser) {
      openAuth(`/listings/${id}`);
      return;
    }
    if (convexUser === null) {
      router.push("/onboarding");
      return;
    }
    if (!convexUser) return;
    if (convexUser.role !== "tenant") {
      toast.error(
        "Contacting owners about a stay requires a traveler account.",
      );
      return;
    }
    setContactOpen(true);
  };

  // Loading state
  if (listing === undefined) {
    return <ListingDetailSkeleton />;
  }

  // Not found
  if (listing === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold text-foreground">
          Listing not found
        </h1>
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
    <div className="public-detail w-property">
      <PropertySectionNav
        price={price}
        showRooms={!!listing.details?.rooms.length}
      />
      <div className="public-detail-inner">
        {listing.canManage && (
          <section role="status" className="w-property-manager-notice">
            <strong>
              {listing.isPublic
                ? "You manage this rental"
                : "Private listing preview"}
            </strong>
            <p>
              {listing.isPublic
                ? "This rental is currently public. Traveler controls are shown to traveler accounts."
                : "Only authorized managers can view this draft. It is not available to travelers."}
            </p>
            <Link href={`/dashboard/landlord/listings/${listing._id}/edit`}>
              Edit listing
            </Link>
            <Link href="/dashboard/landlord/listings">
              Publication requirements
            </Link>
          </section>
        )}
        <PhotoGallery
          captions={listing.photoCaptions}
          photos={photos}
          title={title}
        />
        <div className="w-property-columns">
          <div className="w-property-main">
            <header className="w-property-heading">
              <div className="w-property-title-actions">
                <div>
                  <p>
                    {propertyType} in {city}, {state}
                  </p>
                  <h1>{title}</h1>
                </div>
                <div className="w-property-action-buttons">
                  {listing.isPublic &&
                    !listing.canManage &&
                    (!convexUser || convexUser.role === "tenant") && (
                      <button
                        aria-label={
                          displaySaved
                            ? "Remove from wishlist"
                            : "Save to wishlist"
                        }
                        aria-pressed={displaySaved}
                        className="w-property-round-action"
                        disabled={
                          saveBusy ||
                          (clerkLoaded &&
                            !!clerkUser &&
                            (convexUser === undefined ||
                              (!!convexUser && savedStatus === undefined)))
                        }
                        onClick={handleSaveToggle}
                      >
                        <Heart
                          size={20}
                          className={cn(displaySaved && "fill-current")}
                        />
                      </button>
                    )}
                  {listing.isPublic && (
                    <ShareListingButton
                      title={title}
                      onShared={() => recordShare([listing._id])}
                    />
                  )}
                </div>
              </div>
              <p className="w-property-fact-line">
                {bedrooms} {bedrooms === 1 ? "bedroom" : "bedrooms"}
                <span>·</span>
                {bathrooms} {bathrooms === 1 ? "bathroom" : "bathrooms"}
                {listing.maxOccupancy !== undefined && (
                  <>
                    <span>·</span>
                    {listing.maxOccupancy} guests maximum
                  </>
                )}
                {ratingStats && ratingStats.count > 0 && (
                  <>
                    <span>·</span>
                    <a href="#reviews">
                      ★ {ratingStats.average.toFixed(1)} ({ratingStats.count})
                    </a>
                  </>
                )}
              </p>
              {listing.unitName && (
                <p className="w-property-unit">{listing.unitName}</p>
              )}
              <div className="w-property-owner">
                <Avatar className="w-property-owner-avatar">
                  {landlordAvatar && (
                    <AvatarImage src={landlordAvatar} alt={landlordName} />
                  )}
                  <AvatarFallback>{landlordInitials}</AvatarFallback>
                </Avatar>
                <div>
                  <Link href={`/landlords/${landlordId}`}>
                    Hosted by {landlordName}
                  </Link>
                  <p>Property owner</p>
                  <ListingResponseTime listingId={listing._id} />
                  {ratingStats && ratingStats.count > 0 && landlord && (
                    <LandlordBadges
                      averageRating={ratingStats.average}
                      reviewCount={ratingStats.count}
                      memberSinceMs={landlord.createdAt}
                    />
                  )}
                </div>
              </div>
            </header>
            <section id="about" className="w-property-section">
              <h2>About the property</h2>
              <PropertyDescription description={description} />
            </section>
            {!!listing.details &&
              (!!listing.details.rooms.length ||
                !!listing.details.bathroomDetails?.length) && (
                <section id="sleep" className="w-property-section">
                  <h2>
                    {listing.details.rooms.length
                      ? "Where you’ll sleep"
                      : "Bathroom details"}
                  </h2>
                  <div className="w-property-room-grid">
                    {listing.details.rooms.map((room, i) => (
                      <article key={i}>
                        <Bed size={26} />
                        <h3>{room.name}</h3>
                        <p>{room.beds}</p>
                      </article>
                    ))}
                  </div>
                  {!!listing.details.bathroomDetails?.length && (
                    <div className="w-property-bathrooms">
                      {listing.details.bathroomDetails.map((bath, i) => (
                        <article key={i}>
                          <h3>{bath.name}</h3>
                          <p>{bath.description}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            {listing.propertyGroupId && (
              <section className="w-property-section">
                <PropertyUnits
                  propertyGroupId={listing.propertyGroupId}
                  currentId={listing._id}
                />
              </section>
            )}
            <section id="amenities" className="w-property-section">
              <h2>Amenities</h2>
              {amenities.length ? (
                <PropertyAmenities
                  amenities={amenities}
                  renderIcon={(name) => {
                    const Icon = AMENITY_ICONS[name] ?? CheckCircle2;
                    return <Icon size={22} strokeWidth={1.4} />;
                  }}
                />
              ) : (
                <p className="w-property-muted">
                  Ask the owner which amenities are included.
                </p>
              )}
            </section>
            <section id="availability" className="w-property-section">
              <h2>Availability</h2>
              <p className="w-property-muted">
                {listing.calendarSyncThrough === 0
                  ? "Waiting for calendar availability confirmation."
                  : `Available from ${formatStayDate(availableFrom)}.`}{" "}
                Minimum stay: {Math.max(1, minStay)}{" "}
                {minStay === 1 ? "month" : "months"}.
              </p>
              {availabilityBlocks === undefined ? (
                <Skeleton className="h-64 w-full" />
              ) : availabilityBlocks.length > 0 ||
                listing.calendarSyncThrough !== undefined ? (
                <AvailabilityCalendar
                  blocks={availabilityBlocks}
                  availableFrom={availableFrom}
                  syncThrough={listing.calendarSyncThrough}
                  editable={false}
                />
              ) : null}
            </section>
            <section id="reviews" className="w-property-section">
              <div className="w-property-section-heading">
                <h2>
                  {ratingStats && ratingStats.count > 0
                    ? `★ ${ratingStats.average.toFixed(1)} · ${ratingStats.count} ${ratingStats.count === 1 ? "review" : "reviews"}`
                    : "Reviews"}
                </h2>
                {listing.isPublic &&
                  !listing.canManage &&
                  clerkUser &&
                  convexUser &&
                  convexUser._id !== listing.landlordId && (
                    <button
                      className="w-property-pill"
                      onClick={() => setReviewFormOpen(true)}
                    >
                      Write a review
                    </button>
                  )}
              </div>
              <PublicReviews listingId={listing._id} />
              <Link
                className="w-property-inline-link"
                href={`/landlords/${landlordId}`}
              >
                See all owner reviews
              </Link>
            </section>
            <section id="location" className="w-property-section">
              <h2>Where you’ll be</h2>
              <p className="w-property-muted">
                {city}, {state}
              </p>
              {listing.mapLatitude !== undefined &&
              listing.mapLongitude !== undefined ? (
                <>
                  <div className="w-property-map">
                    <LeafletMap
                      fitKey={listing._id}
                      selectedId={listing._id}
                      listings={[
                        {
                          id: listing._id,
                          title,
                          price,
                          lat: listing.mapLatitude,
                          lng: listing.mapLongitude,
                          city,
                          state,
                          bedrooms,
                          bathrooms,
                          photos,
                        },
                      ]}
                    />
                  </div>
                  <p className="w-property-map-caption">
                    Approximate property area. Confirm the exact location and
                    commute with the owner.
                  </p>
                </>
              ) : (
                <p className="w-property-muted">
                  A property area map has not been confirmed. Ask the owner
                  about the location before committing.
                </p>
              )}
            </section>
            <section id="rules" className="w-property-section w-property-rules">
              <h2>Things to know</h2>
              <ListingDetails
                details={
                  listing.details
                    ? { ...listing.details, rooms: [], bathroomDetails: [] }
                    : undefined
                }
                maxOccupancy={listing.maxOccupancy}
                petFriendly={petFriendly}
              />
            </section>
          </div>
          <aside
            className="w-property-aside"
            aria-label="Request a monthly stay"
          >
            <div
              id="stay-request"
              className="public-detail-booking w-property-booking"
            >
              <div className="w-property-price">
                <strong>{formatPrice(price)}</strong>
                <span>per month</span>
              </div>
              {listing.isPublic &&
              !listing.canManage &&
              (!convexUser || convexUser.role === "tenant") ? (
                <BookingInquiry
                  key={`${listing._id}:${convexUser?._id ?? "guest"}`}
                  listingId={listing._id}
                  minStay={minStay}
                  petFriendly={petFriendly}
                  needsProfile={!!clerkUser && convexUser === null}
                  maxOccupancy={listing.maxOccupancy}
                />
              ) : (
                <p className="w-property-muted">
                  {listing.canManage
                    ? "You manage this rental. Open your dashboard to review traveler requests."
                    : "Stay requests are available to traveler accounts."}
                </p>
              )}
              <div className="w-property-owner-direct">
                <Shield size={18} />
                <span>Contact the property owner directly</span>
              </div>
            </div>
            {listing.isPublic &&
              !listing.canManage &&
              (!convexUser || convexUser.role === "tenant") && (
                <div className="w-property-contact">
                  <button
                    className="w-property-contact-button"
                    onClick={handleContactClick}
                    disabled={
                      !clerkLoaded || (!!clerkUser && convexUser === undefined)
                    }
                  >
                    Contact property owner
                  </button>
                  <ListingPhoneContact listingId={listing._id} />
                </div>
              )}
            <div className="w-property-listing-id">
              Property ID: {listing.publicId ?? listing._id}
            </div>
            {listing.isPublic && !listing.canManage && (
              <ReportDialog listingId={listing._id} />
            )}
          </aside>
        </div>
        {similarListings.length > 0 && (
          <section className="w-property-similar">
            <header>
              <h2>More monthly stays</h2>
              <Link
                href={`/search?location=${encodeURIComponent(`${city}, ${state}`)}`}
              >
                See all in {city}
              </Link>
            </header>
            <div className="w-property-similar-grid">
              {similarListings.map((l) => (
                <ListingCard key={l._id} listing={l} />
              ))}
            </div>
          </section>
        )}
        <nav className="w-property-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>›</span>
          <Link href="/search">Rentals</Link>
          <span>›</span>
          <Link
            href={`/search?location=${encodeURIComponent(`${city}, ${state}`)}`}
          >
            {city}, {state}
          </Link>
          <span>›</span>
          <span>{title}</span>
        </nav>
      </div>
      {convexUser && listing.isPublic && !listing.canManage && (
        <ContactModal
          key={`${listing._id}:${convexUser._id}`}
          listingId={listing._id}
          landlordId={landlordId}
          landlordName={landlordName}
          isOpen={contactOpen}
          onClose={() => setContactOpen(false)}
        />
      )}
      {convexUser && (
        <ReviewForm
          listingId={listing._id}
          landlordId={landlordId}
          landlordName={landlordName}
          reviewerId={convexUser._id}
          isOpen={reviewFormOpen}
          onClose={() => setReviewFormOpen(false)}
        />
      )}
      <RemoveSavedDialog
        open={confirmRemoval}
        onOpenChange={setConfirmRemoval}
        onConfirm={() => void changeSaved(false)}
        busy={saveBusy}
      />
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
    <div className="public-key-detail flex flex-col items-center gap-1.5 text-center">
      <div className="text-slate-400">{icon}</div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={cn("text-[13px] font-semibold text-slate-900", valueClass)}>
        {value}
      </p>
    </div>
  );
}

function ListingDetailSkeleton() {
  return (
    <div className="public-detail">
      <div className="public-detail-inner">
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
