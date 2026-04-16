"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { formatPrice, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, DollarSign, Clock } from "lucide-react";

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-28 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
            )}
            {description && (
              <p className="text-xs text-slate-400 mt-1">{description}</p>
            )}
          </div>
          <div className="ml-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f2044]/10 shrink-0">
            <Icon className="h-5 w-5 text-[#0f2044]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminReportsPage() {
  const listings = useQuery(api.listings.getAll) as Doc<"listings">[] | undefined;
  const platformStats = useQuery(api.analytics.getPlatformStats);
  const allUsers = useQuery(api.users.getAll) as Doc<"users">[] | undefined;

  const isLoading =
    listings === undefined ||
    platformStats === undefined ||
    allUsers === undefined;

  const recentListings = listings?.slice(0, 10) ?? [];

  const statusColor = (status: string) => {
    if (status === "active") return "text-emerald-600 bg-emerald-50";
    if (status === "pending") return "text-amber-600 bg-amber-50";
    return "text-slate-600 bg-slate-100";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-500 text-sm mt-1">
          Platform-wide metrics and recent activity
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Revenue"
          value="$0"
          description="No booking fees by design — direct contact model"
          icon={DollarSign}
          loading={false}
        />
        <StatCard
          title="Active Listings"
          value={isLoading ? "—" : (platformStats?.totalListings ?? 0).toLocaleString()}
          description="Currently visible to renters"
          icon={Building2}
          loading={isLoading}
        />
        <StatCard
          title="Total Users"
          value={isLoading ? "—" : (allUsers?.length ?? 0).toLocaleString()}
          description="All registered users"
          icon={Users}
          loading={isLoading}
        />
      </div>

      {/* Platform stats row */}
      {!isLoading && platformStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">
              {platformStats.totalLandlords.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">Active Landlords</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">
              {formatPrice(platformStats.avgPrice)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Avg. Monthly Price</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">
              {platformStats.cities.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">Cities Represented</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">
              {listings?.filter((l) => l.status === "pending").length ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">Pending Review</p>
          </div>
        </div>
      )}

      {/* Recent platform activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base font-semibold text-slate-900">
              Recent Platform Activity
            </CardTitle>
          </div>
          <p className="text-xs text-slate-500">Last 10 listings created</p>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : recentListings.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">
              No listings yet
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentListings.map((listing) => (
                <li
                  key={listing._id}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {listing.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {listing.city}, {listing.state} &mdash; {formatPrice(listing.price)}/mo
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor(listing.status)}`}
                    >
                      {listing.status}
                    </span>
                    <span className="text-xs text-slate-400 hidden sm:block">
                      {formatDate(listing.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
