"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatDate, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Building2,
  Users,
  MessageSquare,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  ShieldCheck,
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

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { variant: "default" | "success" | "secondary" | "outline"; label: string }> = {
    admin: { variant: "default", label: "Admin" },
    landlord: { variant: "success", label: "Landlord" },
    tenant: { variant: "secondary", label: "Tenant" },
  };
  const config = map[role] ?? { variant: "outline", label: role };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function AdminDashboardPage() {
  const { userId } = useAuth();

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const allListings = useQuery(api.listings.getAll, {});

  const publishMutation = useMutation(api.listings.publish);
  const deleteMutation = useMutation(api.listings.deleteListing);

  const isLoading = convexUser === undefined || allListings === undefined;

  const pendingListings = allListings?.filter((l) => l.status === "pending") ?? [];
  const activeListings = allListings?.filter((l) => l.status === "active") ?? [];

  const handleApprove = async (id: Id<"listings">, title: string) => {
    try {
      await publishMutation({ id });
      toast.success(`"${title}" is now live`);
    } catch {
      toast.error("Failed to approve listing");
    }
  };

  const handleReject = async (id: Id<"listings">, title: string) => {
    try {
      await deleteMutation({ id });
      toast.success(`"${title}" rejected and removed`);
    } catch {
      toast.error("Failed to reject listing");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-[#0f2044]" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Platform overview and moderation tools
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Listings"
          value={allListings?.length ?? 0}
          icon={Building2}
          loading={isLoading}
        />
        <StatCard
          title="Active Listings"
          value={activeListings.length}
          icon={BarChart3}
          loading={isLoading}
        />
        <StatCard
          title="Pending Review"
          value={pendingListings.length}
          icon={Clock}
          loading={isLoading}
        />
        <StatCard
          title="Total Messages"
          value="—"
          icon={MessageSquare}
          loading={isLoading}
        />
      </div>

      {/* Listings Pending Review */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Listings Pending Review</h2>
          {!isLoading && pendingListings.length > 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
              {pendingListings.length} pending
            </Badge>
          )}
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-0 divide-y divide-slate-100">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3.5 w-64" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : pendingListings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-400 mb-4" />
              <h3 className="text-base font-medium text-slate-900 mb-1">
                All caught up!
              </h3>
              <p className="text-sm text-slate-500">
                There are no listings waiting for review.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Listing
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                      Location
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                      Price
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">
                      Submitted
                    </th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingListings.map((listing) => (
                    <tr key={listing._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900 text-sm">{listing.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {listing.propertyType} · {listing.bedrooms} bd / {listing.bathrooms} ba
                        </p>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <p className="text-sm text-slate-700">
                          {listing.city}, {listing.state}
                        </p>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="text-sm font-medium text-slate-900">
                          {formatPrice(listing.price)}/mo
                        </p>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <p className="text-sm text-slate-500">
                          {formatDate(listing.createdAt)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() =>
                              handleApprove(listing._id as Id<"listings">, listing.title)
                            }
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              handleReject(listing._id as Id<"listings">, listing.title)
                            }
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* Recent Listings */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">All Listings Overview</h2>
        {isLoading ? (
          <Card>
            <CardContent className="p-0 divide-y divide-slate-100">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3.5 w-40" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : allListings && allListings.length > 0 ? (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Title
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                      Location
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                      Price
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Status
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">
                      Views
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allListings.slice(0, 10).map((listing) => (
                    <tr key={listing._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 text-sm">{listing.title}</p>
                        <p className="text-xs text-slate-500">{listing.propertyType}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-sm text-slate-700">
                          {listing.city}, {listing.state}
                        </p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-sm text-slate-700">
                          {formatPrice(listing.price)}/mo
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            listing.status === "active"
                              ? "success"
                              : listing.status === "pending"
                              ? "outline"
                              : "secondary"
                          }
                          className="capitalize"
                        >
                          {listing.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <p className="text-sm text-slate-500">{listing.views}</p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <p className="text-sm text-slate-500">
                          {formatDate(listing.createdAt)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-12 text-center">
              <div>
                <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 text-sm">No listings on the platform yet.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Platform Stats Summary */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Platform Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-[#0f2044]">
                {allListings?.filter((l) => l.status === "active").length ?? "—"}
              </p>
              <p className="text-sm text-slate-500 mt-1">Live Listings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-[#0f2044]">
                {allListings?.reduce((s, l) => s + l.views, 0).toLocaleString() ?? "—"}
              </p>
              <p className="text-sm text-slate-500 mt-1">Total Listing Views</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-[#0f2044]">
                {pendingListings.length}
              </p>
              <p className="text-sm text-slate-500 mt-1">Awaiting Approval</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
