"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BadgeCheck,
  Building2,
  Clock,
  MessageSquare,
  Star,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { StarRating } from "@/components/star-rating";
import { ReviewCard } from "@/components/review-card";
import { formatDate } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function LandlordProfilePage({ params }: PageProps) {
  const { id } = React.use(params);

  const landlord = useQuery(api.users.getById, {
    id: id as Id<"users">,
  });

  const listings = useQuery(
    api.listings.getByLandlord,
    landlord ? { landlordId: landlord._id } : "skip"
  );

  const reviews = useQuery(
    api.reviews.getByLandlord,
    landlord ? { landlordId: landlord._id } : "skip"
  );

  const ratingStats = useQuery(
    api.reviews.getAverageRating,
    landlord ? { landlordId: landlord._id } : "skip"
  );

  // Loading state
  if (landlord === undefined) {
    return <LandlordProfileSkeleton />;
  }

  // Not found
  if (landlord === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold text-foreground">Landlord not found</h1>
        <p className="text-muted-foreground text-sm">
          This profile may have been removed or does not exist.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Browse listings
        </Link>
      </div>
    );
  }

  const displayName = landlord.displayName ?? landlord.name;
  const avatarSrc = landlord.profilePhoto ?? landlord.avatar;
  const initials = getInitials(displayName);
  const activeListings = (listings ?? []).filter((l) => l.status === "active");
  const totalListings = (listings ?? []).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate">{displayName}</span>
        </nav>

        {/* ── Hero card ── */}
        <Card className="border-border shadow-sm overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-[#0f2044] to-[#1a3a7a]" />
          <CardContent className="px-6 pb-6 pt-0">
            {/* Avatar row */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-10 sm:-mt-12">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-background shadow-md shrink-0">
                {avatarSrc && <AvatarImage src={avatarSrc} alt={displayName} />}
                <AvatarFallback className="text-xl font-bold bg-[#0f2044] text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>

              {/* Response time badge */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1.5 self-start sm:self-auto">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span>Typically responds within 24 hours</span>
              </div>
            </div>

            {/* Name & badges */}
            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
                {landlord.linkedinVerified && (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified Landlord
                  </Badge>
                )}
              </div>

              {(landlord.city || landlord.state) && (
                <p className="text-sm text-muted-foreground">
                  {[landlord.city, landlord.state].filter(Boolean).join(", ")}
                </p>
              )}

              {landlord.occupation && (
                <p className="text-sm text-muted-foreground">{landlord.occupation}</p>
              )}

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Clock className="h-3.5 w-3.5" />
                <span>Member since {formatDate(landlord.createdAt)}</span>
              </div>

              {landlord.bio && (
                <>
                  <Separator className="mt-3" />
                  <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                    {landlord.bio}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={<Building2 className="h-5 w-5 text-[#0f2044]" />}
            label="Total Listings"
            value={String(totalListings)}
          />
          <StatCard
            icon={<Star className="h-5 w-5 text-amber-400 fill-amber-400" />}
            label="Avg. Rating"
            value={
              ratingStats && ratingStats.count > 0
                ? ratingStats.average.toFixed(1)
                : "—"
            }
          >
            {ratingStats && ratingStats.count > 0 && (
              <StarRating
                rating={ratingStats.average}
                size="sm"
                showNumeric={false}
                className="mt-1"
              />
            )}
          </StatCard>
          <StatCard
            icon={<MessageSquare className="h-5 w-5 text-[#0f2044]" />}
            label="Reviews"
            value={String(ratingStats?.count ?? 0)}
          />
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="listings">
          <TabsList className="mb-6">
            <TabsTrigger value="listings">
              Listings
              {totalListings > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({activeListings.length})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reviews">
              Reviews
              {(ratingStats?.count ?? 0) > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({ratingStats?.count})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Listings tab */}
          <TabsContent value="listings">
            {listings === undefined ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-72 rounded-xl" />
                ))}
              </div>
            ) : activeListings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Building2 className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">
                  No active listings at the moment.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {activeListings.map((listing) => (
                  <ListingCard
                    key={listing._id}
                    listing={listing as ListingCardData}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Reviews tab */}
          <TabsContent value="reviews">
            {reviews === undefined ? (
              <div className="flex flex-col gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Star className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">
                  No reviews yet.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {reviews.map((review) => (
                  <ReviewCard
                    key={review._id}
                    rating={review.rating}
                    comment={review.comment}
                    reviewerName={review.reviewerName}
                    reviewerAvatar={review.reviewerAvatar}
                    createdAt={review.createdAt}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatCard({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-4 flex flex-col items-center text-center gap-1.5">
        <div className="mb-1">{icon}</div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {children}
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function LandlordProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        <Skeleton className="h-4 w-48" />

        {/* Hero card skeleton */}
        <Card className="border-border shadow-sm overflow-hidden">
          <Skeleton className="h-24 w-full rounded-none" />
          <CardContent className="px-6 pb-6 pt-0">
            <div className="flex items-end gap-4 -mt-10">
              <Skeleton className="h-20 w-20 rounded-full shrink-0" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </CardContent>
        </Card>

        {/* Stats row skeleton */}
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        {/* Tabs skeleton */}
        <div>
          <Skeleton className="h-10 w-48 mb-6 rounded-lg" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
