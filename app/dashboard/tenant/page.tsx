"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, formatPrice, formatDate } from "@/lib/utils";

type ConvDoc<T> = T & { _id: string };

type ConvUser = {
  _id: string;
  name: string;
  email: string;
  role: "tenant" | "landlord" | "admin";
};

type ConvListing = {
  _id: string;
  landlordId: string;
  title: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  photos: string[];
};

type SavedEntry = {
  _id: string;
  listing: ConvListing | null;
};

type ConvConversation = {
  _id: string;
  tenantId: string;
  landlordId: string;
  lastMessage: string;
  lastMessageAt: number;
  tenantRead: boolean;
  landlordRead: boolean;
  listing: { title: string } | null;
  otherUser: { name: string } | null;
};
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Heart,
  MessageSquare,
  Home,
  CalendarDays,
  MapPin,
  BedDouble,
  Bath,
  ArrowRight,
  Search,
  Clock,
} from "lucide-react";

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 font-medium">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
            )}
          </div>
          <div className="h-12 w-12 rounded-full bg-[#0f2044]/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-[#0f2044]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ListingCard({
  listing,
  userId,
}: {
  listing: {
    _id: string;
    title: string;
    city: string;
    state: string;
    price: number;
    bedrooms: number;
    bathrooms: number;
    photos: string[];
    landlordId: string;
  };
  userId: string;
}) {
  const photo = listing.photos[0];
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="h-40 bg-slate-200 relative overflow-hidden">
        {photo ? (
          <img
            src={photo}
            alt={listing.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home className="h-10 w-10 text-slate-400" />
          </div>
        )}
      </div>
      <CardContent className="flex-1 flex flex-col p-4">
        <h3 className="font-semibold text-slate-900 line-clamp-1">{listing.title}</h3>
        <div className="flex items-center gap-1 text-slate-500 text-sm mt-1">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            {listing.city}, {listing.state}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500 mt-2">
          <span className="flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5" />
            {listing.bedrooms} bd
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" />
            {listing.bathrooms} ba
          </span>
        </div>
        <p className="text-[#0f2044] font-bold mt-2">
          {formatPrice(listing.price)}<span className="font-normal text-slate-500 text-sm">/mo</span>
        </p>
        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
          <Button asChild size="sm" className="flex-1">
            <Link href={`/listings/${listing._id}`}>View</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link href={`/dashboard/messages?listing=${listing._id}&landlord=${listing.landlordId}`}>
              Message
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TenantDashboardPage() {
  const router = useRouter();
  const { userId, isLoaded } = useAuth();

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const savedListings = useQuery(
    api.saved.getSaved,
    convexUser?._id ? { tenantId: convexUser._id } : "skip"
  ) as SavedEntry[] | undefined;

  const conversations = useQuery(
    api.messages.getConversations,
    convexUser?._id ? { userId: convexUser._id } : "skip"
  ) as ConvConversation[] | undefined;

  const featuredListings = useQuery(api.listings.getFeatured, {}) as ConvListing[] | undefined;

  const isLoading = !isLoaded || convexUser === undefined;
  const firstName = convexUser?.name?.split(" ")[0] ?? "there";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const unreadMessages =
    conversations?.filter((c) => {
      const isTenant = c.tenantId === convexUser?._id;
      return isTenant ? !c.tenantRead : !c.landlordRead;
    }).length ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-40 mt-2" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome back, {firstName}!
              </h1>
              <p className="text-slate-500 text-sm mt-1">{today}</p>
            </>
          )}
        </div>
        <Button asChild>
          <Link href="/listings">
            <Search className="h-4 w-4 mr-2" />
            Browse Listings
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Saved Listings"
          value={savedListings?.length ?? 0}
          icon={Heart}
          loading={isLoading || savedListings === undefined}
        />
        <StatCard
          title="Messages"
          value={unreadMessages > 0 ? `${unreadMessages} unread` : conversations?.length ?? 0}
          icon={MessageSquare}
          loading={isLoading || conversations === undefined}
        />
        <StatCard
          title="Active Stays"
          value={0}
          icon={Home}
          loading={isLoading}
        />
        <StatCard
          title="Upcoming Move-ins"
          value={0}
          icon={CalendarDays}
          loading={isLoading}
        />
      </div>

      {/* Saved Listings */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Saved Listings</h2>
          <Button asChild variant="link" size="sm" className="text-[#0f2044]">
            <Link href="/dashboard/tenant/saved">
              View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>

        {savedListings === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-40 w-full rounded-none" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : savedListings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Heart className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-base font-medium text-slate-900 mb-1">No saved listings yet</h3>
              <p className="text-sm text-slate-500 mb-4">
                Browse listings and save your favorites to compare them later.
              </p>
              <Button asChild>
                <Link href="/listings">Browse Listings</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedListings.slice(0, 3).map((entry) =>
              entry.listing ? (
                <ListingCard
                  key={entry._id}
                  listing={entry.listing!}
                  userId={convexUser?._id ?? ""}
                />
              ) : null
            )}
          </div>
        )}
      </section>

      {/* Recent Messages */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent Messages</h2>
          <Button asChild variant="link" size="sm" className="text-[#0f2044]">
            <Link href="/dashboard/messages">
              View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>

        {conversations === undefined ? (
          <Card>
            <CardContent className="p-0 divide-y divide-slate-100">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3.5 w-48" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : conversations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-base font-medium text-slate-900 mb-1">No messages yet</h3>
              <p className="text-sm text-slate-500 mb-4">
                Find a listing you love and reach out to the landlord.
              </p>
              <Button asChild>
                <Link href="/listings">Browse Listings</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-slate-100">
              {conversations.slice(0, 3).map((conv) => {
                const isTenant = conv.tenantId === convexUser?._id;
                const isUnread = isTenant ? !conv.tenantRead : !conv.landlordRead;
                return (
                  <Link
                    key={conv._id}
                    href={`/dashboard/messages?conv=${conv._id}`}
                    className="flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-[#0f2044]/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-[#0f2044]">
                        {conv.otherUser?.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm font-medium", isUnread ? "text-slate-900" : "text-slate-700")}>
                          {conv.otherUser?.name ?? "Unknown"}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(conv.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        Re: {conv.listing?.title ?? "Listing"}
                      </p>
                      <p className={cn("text-sm mt-0.5 truncate", isUnread ? "text-slate-800 font-medium" : "text-slate-500")}>
                        {conv.lastMessage}
                      </p>
                    </div>
                    {isUnread && (
                      <div className="h-2 w-2 rounded-full bg-[#0f2044] mt-2 shrink-0" />
                    )}
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Recommended */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Recommended for You</h2>
          <Button asChild variant="link" size="sm" className="text-[#0f2044]">
            <Link href="/listings">
              See all <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>

        {featuredListings === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-40 w-full rounded-none" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : featuredListings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-base font-medium text-slate-900 mb-1">No listings available yet</h3>
              <p className="text-sm text-slate-500">Check back soon — new listings are added daily.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredListings.slice(0, 3).map((listing) => (
              <ListingCard
                key={listing._id}
                listing={listing}
                userId={convexUser?._id ?? ""}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
