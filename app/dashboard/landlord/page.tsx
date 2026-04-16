"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPrice, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Building2,
  Eye,
  MessageSquare,
  Heart,
  Plus,
  ArrowRight,
  BedDouble,
  Bath,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Clock,
  Home,
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

function StatusBadge({ status }: { status: "active" | "inactive" | "pending" }) {
  const variants = {
    active: "success",
    inactive: "secondary",
    pending: "outline",
  } as const;
  return (
    <Badge variant={variants[status]} className="capitalize">
      {status}
    </Badge>
  );
}

export default function LandlordDashboardPage() {
  const { userId } = useAuth();

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const listings = useQuery(
    api.listings.getByLandlord,
    convexUser?._id ? { landlordId: convexUser._id } : "skip"
  );

  const conversations = useQuery(
    api.messages.getConversations,
    convexUser?._id ? { userId: convexUser._id } : "skip"
  );

  const publishMutation = useMutation(api.listings.publish);
  const unpublishMutation = useMutation(api.listings.unpublish);

  const isLoading = convexUser === undefined || listings === undefined;

  const activeListings = listings?.filter((l) => l.status === "active") ?? [];
  const totalViews = listings?.reduce((sum, l) => sum + l.views, 0) ?? 0;
  const unreadCount =
    conversations?.filter((c) => {
      const isLandlord = c.landlordId === convexUser?._id;
      return isLandlord ? !c.landlordRead : !c.tenantRead;
    }).length ?? 0;

  const handleToggle = async (
    listingId: Id<"listings">,
    currentStatus: string
  ) => {
    try {
      if (currentStatus === "active") {
        await unpublishMutation({ id: listingId });
        toast.success("Listing set to inactive");
      } else {
        await publishMutation({ id: listingId });
        toast.success("Listing is now active");
      }
    } catch (err) {
      toast.error("Failed to update listing status");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Landlord Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your listings and communicate with tenants
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/landlord/listings/new">
            <Plus className="h-4 w-4 mr-2" />
            Add New Listing
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Listings"
          value={activeListings.length}
          icon={Building2}
          loading={isLoading}
        />
        <StatCard
          title="Total Views"
          value={totalViews.toLocaleString()}
          icon={Eye}
          loading={isLoading}
        />
        <StatCard
          title="Messages"
          value={unreadCount > 0 ? `${unreadCount} new` : conversations?.length ?? 0}
          icon={MessageSquare}
          loading={isLoading || conversations === undefined}
        />
        <StatCard
          title="Saved by Tenants"
          value="—"
          icon={Heart}
          loading={isLoading}
        />
      </div>

      {/* Empty state — no listings */}
      {!isLoading && listings?.length === 0 && (
        <Card className="border-dashed border-2 border-slate-300">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-[#0f2044]/10 flex items-center justify-center mb-4">
              <Building2 className="h-8 w-8 text-[#0f2044]" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Create Your First Listing
            </h3>
            <p className="text-slate-500 max-w-sm mb-6">
              Start attracting tenants by listing your furnished property. It only
              takes a few minutes to get started.
            </p>
            <Button asChild size="lg">
              <Link href="/dashboard/landlord/listings/new">
                <Plus className="h-5 w-5 mr-2" />
                Create Listing
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* My Listings */}
      {(isLoading || (listings && listings.length > 0)) && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">My Listings</h2>
            <Button asChild variant="link" size="sm" className="text-[#0f2044]">
              <Link href="/dashboard/landlord/listings">
                Manage all <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <Skeleton className="h-16 w-24 rounded-md shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3.5 w-32" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {listings!.slice(0, 5).map((listing) => {
                const photo = listing.photos[0];
                return (
                  <Card key={listing._id}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-16 w-24 rounded-md bg-slate-200 overflow-hidden shrink-0">
                        {photo ? (
                          <img
                            src={photo}
                            alt={listing.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Home className="h-6 w-6 text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <h3 className="font-medium text-slate-900 truncate">
                            {listing.title}
                          </h3>
                          <StatusBadge status={listing.status} />
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1 flex-wrap">
                          <span>{formatPrice(listing.price)}/mo</span>
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3.5 w-3.5" />
                            {listing.bedrooms} bd
                          </span>
                          <span className="flex items-center gap-1">
                            <Bath className="h-3.5 w-3.5" />
                            {listing.bathrooms} ba
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" />
                            {listing.views} views
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/landlord/listings/${listing._id}/edit`}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggle(listing._id as Id<"listings">, listing.status)}
                          title={listing.status === "active" ? "Set inactive" : "Set active"}
                        >
                          {listing.status === "active" ? (
                            <ToggleRight className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-slate-400" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Recent Inquiries */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent Inquiries</h2>
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
                  <Skeleton className="h-8 w-16 shrink-0" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : conversations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-base font-medium text-slate-900 mb-1">
                No inquiries yet
              </h3>
              <p className="text-sm text-slate-500">
                When tenants message you about your listings, they'll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-slate-100">
              {conversations.slice(0, 5).map((conv) => {
                const isLandlord = conv.landlordId === convexUser?._id;
                const isUnread = isLandlord ? !conv.landlordRead : !conv.tenantRead;
                return (
                  <div key={conv._id} className="p-4 flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-[#0f2044]/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-[#0f2044]">
                        {conv.otherUser?.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {conv.otherUser?.name ?? "Unknown Tenant"}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(conv.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        Re: {conv.listing?.title ?? "Listing"}
                      </p>
                      <p className="text-sm text-slate-500 truncate mt-0.5">
                        {conv.lastMessage}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isUnread && (
                        <div className="h-2 w-2 rounded-full bg-[#0f2044]" />
                      )}
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/messages?conv=${conv._id}`}>
                          Reply
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
