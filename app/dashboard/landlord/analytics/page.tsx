"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, formatPrice } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Eye,
  MessageSquare,
  Heart,
  Building2,
  TrendingUp,
  TrendingDown,
  Pencil,
  Plus,
  BarChart2,
  Lightbulb,
  Camera,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

type DateRange = "7" | "30" | "90" | "all";

type ListingPerf = {
  _id: string;
  title: string;
  status: string;
  price: number;
  views: number;
  messages: number;
  saved: number;
  createdAt: number;
};

// ─── Mock time-series generator ───────────────────────────────────────────────

function buildViewsTimeSeries(
  listings: ListingPerf[],
  days: number
): Array<{ date: string; views: number }> {
  const now = Date.now();
  const result: Array<{ date: string; views: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    // Distribute total views across days with some noise
    const base = listings.reduce((s, l) => s + l.views, 0) / days;
    const noise = Math.sin(i * 0.7 + listings.length) * base * 0.35;
    const spike = i % 7 === 0 ? base * 0.4 : 0; // weekly peaks
    const views = Math.max(0, Math.round(base + noise + spike));
    result.push({ date: label, views });
  }
  return result;
}

function buildInquiryBarData(listings: ListingPerf[]): Array<{ name: string; messages: number }> {
  return listings
    .slice(0, 8)
    .map((l) => ({
      name: l.title.length > 18 ? l.title.slice(0, 18) + "…" : l.title,
      messages: l.messages,
    }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  loading?: boolean;
}) {
  return (
    <Card className="border border-slate-200">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500 font-medium">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-20 mt-2" />
            ) : (
              <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
            )}
            {trendLabel && !loading && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-1 text-xs font-medium",
                  trend === "up" && "text-emerald-600",
                  trend === "down" && "text-red-500",
                  trend === "neutral" && "text-slate-400"
                )}
              >
                {trend === "up" && <TrendingUp className="h-3 w-3" />}
                {trend === "down" && <TrendingDown className="h-3 w-3" />}
                {trendLabel}
              </div>
            )}
          </div>
          <div className="h-11 w-11 rounded-full bg-[#1e3a8a]/10 flex items-center justify-center shrink-0 ml-3">
            <Icon className="h-5 w-5 text-[#1e3a8a]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    inactive: "bg-slate-100 text-slate-600",
    pending: "bg-amber-100 text-amber-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        map[status] ?? "bg-slate-100 text-slate-600"
      )}
    >
      {status}
    </span>
  );
}

function TipCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <Card className="border border-slate-200">
      <CardContent className="p-6">
        <div className="flex gap-4">
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-[#1e3a8a]" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{body}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Custom tooltip for views chart
interface ViewsTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}
function ViewsTooltip({ active, payload, label }: ViewsTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="font-semibold text-slate-900 mt-0.5">
        {payload[0].value.toLocaleString()} views
      </p>
    </div>
  );
}

// Custom tooltip for inquiry chart
interface InquiryTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { name: string } }>;
}
function InquiryTooltip({ active, payload }: InquiryTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-900">{payload[0].payload.name}</p>
      <p className="text-slate-600 mt-0.5">{payload[0].value} messages</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LandlordAnalyticsPage() {
  const { userId } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>("30");

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const stats = useQuery(
    api.analytics.getListingStats,
    convexUser?._id ? { landlordId: convexUser._id } : "skip"
  );

  const listingPerf = useQuery(
    api.analytics.getListingPerformance,
    convexUser?._id ? { landlordId: convexUser._id } : "skip"
  ) as ListingPerf[] | undefined;

  const isLoading = convexUser === undefined || stats === undefined || listingPerf === undefined;
  const hasNoListings = !isLoading && listingPerf?.length === 0;

  const rangeDays = dateRange === "7" ? 7 : dateRange === "90" ? 90 : dateRange === "all" ? 180 : 30;

  const viewsData = useMemo(() => {
    if (!listingPerf || listingPerf.length === 0) return [];
    return buildViewsTimeSeries(listingPerf, rangeDays);
  }, [listingPerf, rangeDays]);

  const inquiryData = useMemo(() => {
    if (!listingPerf) return [];
    return buildInquiryBarData(listingPerf);
  }, [listingPerf]);

  // Subsample X-axis ticks based on range
  const xAxisTick = useMemo(() => {
    if (rangeDays <= 14) return undefined; // show all
    if (rangeDays <= 30) return (value: string, index: number) => (index % 5 === 0 ? value : "");
    if (rangeDays <= 90) return (value: string, index: number) => (index % 14 === 0 ? value : "");
    return (value: string, index: number) => (index % 30 === 0 ? value : "");
  }, [rangeDays]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">
            Track your listing performance and renter engagement
          </p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── No listings CTA ── */}
      {hasNoListings && (
        <Card className="border-dashed border-2 border-slate-300">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-[#1e3a8a]/10 flex items-center justify-center mb-4">
              <BarChart2 className="h-8 w-8 text-[#1e3a8a]" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              No Analytics Yet
            </h3>
            <p className="text-slate-500 max-w-sm mb-6">
              Create your first listing to start tracking views, messages, and saves from interested renters.
            </p>
            <Button asChild size="lg">
              <Link href="/dashboard/landlord/listings/new">
                <Plus className="h-5 w-5 mr-2" />
                Create Your First Listing
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Section 1: Stats Row ── */}
      {!hasNoListings && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Views"
            value={isLoading ? "—" : (stats?.totalViews ?? 0).toLocaleString()}
            icon={Eye}
            trend="up"
            trendLabel="Across all listings"
            loading={isLoading}
          />
          <StatCard
            label="Messages Received"
            value={isLoading ? "—" : stats?.totalMessages ?? 0}
            icon={MessageSquare}
            trend="neutral"
            trendLabel="Total inquiries"
            loading={isLoading}
          />
          <StatCard
            label="Saved by Tenants"
            value={isLoading ? "—" : stats?.savedCount ?? 0}
            icon={Heart}
            trend="up"
            trendLabel="Tenant saves"
            loading={isLoading}
          />
          <StatCard
            label="Active Listings"
            value={isLoading ? "—" : stats?.activeListings ?? 0}
            icon={Building2}
            trend="neutral"
            trendLabel={`of ${stats?.totalListings ?? "—"} total`}
            loading={isLoading}
          />
        </section>
      )}

      {/* ── Section 2: Views Over Time ── */}
      {!hasNoListings && (
        <section>
          <Card className="border border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">
                Views Over Time
              </CardTitle>
              <p className="text-sm text-slate-500">
                Estimated daily views based on your listing activity
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="w-full h-64 rounded-md" />
              ) : viewsData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
                  No view data available.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart
                    data={viewsData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickFormatter={xAxisTick ? (val, idx) => (xAxisTick as (v: string, i: number) => string)(val, idx) : undefined}
                      interval={xAxisTick ? 0 : "preserveStartEnd"}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      allowDecimals={false}
                      width={36}
                    />
                    <Tooltip content={<ViewsTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="#1e3a8a"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, fill: "#1e3a8a" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Section 3: Listing Performance Table ── */}
      {!hasNoListings && (
        <section>
          <Card className="border border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">
                Listing Performance
              </CardTitle>
              <p className="text-sm text-slate-500">Sorted by views, highest first</p>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-0 divide-y divide-slate-100">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-5 w-16 ml-auto" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Listing
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Status
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Price
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Views
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Msgs
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Saved
                        </th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(listingPerf ?? []).slice(0, 10).map((l) => (
                        <tr key={l._id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900 line-clamp-1 max-w-[200px] block">
                              {l.title}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={l.status} />
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {formatPrice(l.price)}<span className="text-slate-400 text-xs">/mo</span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {l.views.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {l.messages}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {l.saved}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/dashboard/landlord/listings/${l._id}/edit`}>
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(listingPerf?.length ?? 0) === 0 && (
                    <div className="py-12 text-center text-slate-400 text-sm">
                      No listings to show.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Section 4: Inquiry Trends ── */}
      {!hasNoListings && (
        <section>
          <Card className="border border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">
                Inquiry Trends
              </CardTitle>
              <p className="text-sm text-slate-500">
                Messages received per listing
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="w-full h-52 rounded-md" />
              ) : inquiryData.length === 0 ? (
                <div className="flex items-center justify-center h-52 text-slate-400 text-sm">
                  No inquiry data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={inquiryData}
                    margin={{ top: 5, right: 20, left: 0, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      width={32}
                    />
                    <Tooltip content={<InquiryTooltip />} />
                    <Bar
                      dataKey="messages"
                      fill="#1e3a8a"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Section 5: Tips to Improve Performance ── */}
      <section>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Tips to Improve Performance</h2>
          <p className="text-sm text-slate-500 mt-1">
            Actionable steps to get more views and inquiries
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TipCard
            icon={Camera}
            title="Add High-Quality Photos"
            body="Listings with 5+ professional-looking photos receive up to 3x more views. Use natural lighting and photograph every room, including the kitchen and bathroom."
          />
          <TipCard
            icon={Clock}
            title="Respond Within 1 Hour"
            body="Renters often send inquiries to multiple landlords simultaneously. Responding quickly — especially within the first hour — significantly increases your conversion rate."
          />
          <TipCard
            icon={Lightbulb}
            title="Keep Your Price Competitive"
            body="Check the Market Insights page to see average rents in your city. Listings priced within 10% of the local average receive substantially more inquiries."
          />
        </div>
      </section>

    </div>
  );
}
