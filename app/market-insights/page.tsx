"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, formatPrice } from "@/lib/utils";
import { TOP_CITIES } from "@/lib/cities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Building2,
  MapPin,
  DollarSign,
  Lightbulb,
  Search,
  Calendar,
  Star,
} from "lucide-react";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

const PIE_COLORS = [
  "#1e3a8a",
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#bfdbfe",
];

// ---------- custom tooltip ----------
interface PriceTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { city: string; state: string; count: number } }>;
  label?: string;
}

function PriceTooltip({ active, payload }: PriceTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-900">{d.payload.city}, {d.payload.state}</p>
      <p className="text-slate-600 mt-1">Avg rent: <span className="font-medium text-[#1e3a8a]">{formatPrice(d.value)}/mo</span></p>
      <p className="text-slate-500">{d.payload.count} {d.payload.count === 1 ? "listing" : "listings"}</p>
    </div>
  );
}

// ---------- amenity tooltip ----------
interface AmenityTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { amenity: string } }>;
}

function AmenityTooltip({ active, payload }: AmenityTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-900">{d.payload.amenity}</p>
      <p className="text-slate-600 mt-1">{d.value} listings</p>
    </div>
  );
}

// ---------- pie custom label ----------
interface PieLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  percent: number;
  name: string;
}

function PieLabel({ cx, cy, midAngle, outerRadius, percent, name }: PieLabelProps) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 28;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#475569"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
    >
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

// ---------- hero stat card ----------
function HeroStatCard({
  label,
  value,
  sub,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card className="border border-slate-200">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500 font-medium">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-28 mt-2" />
            ) : (
              <p className="text-2xl font-bold text-slate-900 mt-1 truncate">{value}</p>
            )}
            {sub && !loading && (
              <p className="text-xs text-slate-400 mt-1 truncate">{sub}</p>
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

// ---------- renter tip card ----------
function TipCard({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
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

export default function MarketInsightsPage() {
  const cityPrices = useQuery(api.analytics.getPricesByCity);
  const platformStats = useQuery(api.analytics.getPlatformStats);
  const propertyTypes = useQuery(api.analytics.getPropertyTypeDistribution);
  const topAmenities = useQuery(api.analytics.getTopAmenities);

  const isLoading = cityPrices === undefined || platformStats === undefined;

  // Top 20 cities by avg price (already sorted desc)
  const chartData = useMemo(() => (cityPrices ?? []).slice(0, 20), [cityPrices]);

  // Hero stat derivations
  const nationalAvg = platformStats?.avgPrice ?? 0;
  const totalListings = platformStats?.totalListings ?? 0;

  const mostAffordable = useMemo(() => {
    if (!cityPrices || cityPrices.length === 0) return null;
    return [...cityPrices].sort((a, b) => a.avgPrice - b.avgPrice)[0];
  }, [cityPrices]);

  const mostPopular = useMemo(() => {
    if (!cityPrices || cityPrices.length === 0) return null;
    return [...cityPrices].sort((a, b) => b.count - a.count)[0];
  }, [cityPrices]);

  // Build a lookup map: lowercase city name -> avg price
  const cityPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of cityPrices ?? []) {
      map.set(d.city.toLowerCase(), d.avgPrice);
    }
    return map;
  }, [cityPrices]);

  const popularCities = useMemo(
    () => TOP_CITIES.filter((c) => c.popular).slice(0, 20),
    []
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <main className="flex-1 pt-20">
        {/* ── Page Header ── */}
        <section className="bg-white border-b border-slate-200 py-10 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-slate-900">Market Insights</h1>
              <Badge className="bg-[#1e3a8a] text-white text-xs px-2 py-0.5">NEW</Badge>
            </div>
            <p className="text-slate-500 text-base">
              Real-time rental market data across 100 cities
            </p>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">

          {/* ── Section 1: Hero Stats ── */}
          <section>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <HeroStatCard
                label="Avg Monthly Rent"
                value={isLoading ? "—" : formatPrice(nationalAvg)}
                sub="Nationally across all cities"
                icon={DollarSign}
                loading={isLoading}
              />
              <HeroStatCard
                label="Active Listings"
                value={isLoading ? "—" : totalListings.toLocaleString()}
                sub="Furnished rentals available now"
                icon={Building2}
                loading={isLoading}
              />
              <HeroStatCard
                label="Most Affordable City"
                value={isLoading ? "—" : mostAffordable ? `${mostAffordable.city}, ${mostAffordable.state}` : "—"}
                sub={mostAffordable ? `Avg ${formatPrice(mostAffordable.avgPrice)}/mo` : undefined}
                icon={MapPin}
                loading={isLoading}
              />
              <HeroStatCard
                label="Most Popular City"
                value={isLoading ? "—" : mostPopular ? `${mostPopular.city}, ${mostPopular.state}` : "—"}
                sub={mostPopular ? `${mostPopular.count} active listings` : undefined}
                icon={TrendingUp}
                loading={isLoading}
              />
            </div>
          </section>

          {/* ── Section 2: Bar Chart ── */}
          <section>
            <Card className="border border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Average Monthly Rent by City
                </CardTitle>
                <p className="text-sm text-slate-500">Top 20 cities ranked by average price</p>
              </CardHeader>
              <CardContent className="pt-0">
                {isLoading ? (
                  <Skeleton className="w-full h-[400px] rounded-md" />
                ) : chartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
                    <TrendingUp className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm">No listings data available yet.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 20, left: 10, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="city"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        angle={-45}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        width={48}
                      />
                      <Tooltip content={<PriceTooltip />} />
                      <Bar
                        dataKey="avgPrice"
                        fill="#1e3a8a"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ── Section 3: Explore by City ── */}
          <section>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">Explore by City</h2>
              <p className="text-sm text-slate-500 mt-1">
                Browse furnished rentals in your destination city
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {popularCities.map((city) => {
                const avg = cityPriceMap.get(city.name.toLowerCase());
                return (
                  <Link
                    key={`${city.name}-${city.stateCode}`}
                    href={`/search?location=${encodeURIComponent(`${city.name}, ${city.stateCode}`)}&city=${encodeURIComponent(city.name)}&state=${encodeURIComponent(city.stateCode)}`}
                    className="group block rounded-xl border border-slate-200 bg-white p-4 hover:border-[#1e3a8a] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0 group-hover:text-[#1e3a8a] transition-colors" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate group-hover:text-[#1e3a8a] transition-colors">
                          {city.name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{city.stateCode}</p>
                        <p className="text-xs font-medium text-[#1e3a8a] mt-1">
                          {isLoading ? (
                            <Skeleton className="h-3 w-16 inline-block" />
                          ) : avg ? (
                            `~${formatPrice(avg)}/mo`
                          ) : (
                            "—"
                          )}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ── Section 4: What Renters Are Looking For ── */}
          <section>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">What Renters Are Looking For</h2>
              <p className="text-sm text-slate-500 mt-1">
                Property types and amenities most common in listed rentals
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie chart */}
              <Card className="border border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Property Type Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {propertyTypes === undefined ? (
                    <Skeleton className="w-full h-64 rounded-md" />
                  ) : propertyTypes.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
                      No data available.
                    </div>
                  ) : (
                    <div>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={propertyTypes}
                            dataKey="count"
                            nameKey="type"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            labelLine={false}
                            label={(props: { cx: number; cy: number; midAngle: number; outerRadius: number; percent: number; name: string }) => (
                              <PieLabel
                                cx={props.cx}
                                cy={props.cy}
                                midAngle={props.midAngle}
                                outerRadius={props.outerRadius}
                                percent={props.percent}
                                name={props.name}
                              />
                            )}
                          >
                            {propertyTypes.map((_entry: { type: string; count: number }, idx: number) => (
                              <Cell
                                key={idx}
                                fill={PIE_COLORS[idx % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number, name: string) => [
                              `${value} listings`,
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Legend */}
                      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 justify-center">
                        {propertyTypes.map((pt: { type: string; count: number }, idx: number) => (
                          <div key={pt.type} className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span
                              className="h-2.5 w-2.5 rounded-sm shrink-0"
                              style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                            />
                            {pt.type}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top amenities horizontal bar chart */}
              <Card className="border border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Top Amenities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topAmenities === undefined ? (
                    <Skeleton className="w-full h-64 rounded-md" />
                  ) : topAmenities.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
                      No data available.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        layout="vertical"
                        data={topAmenities}
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          allowDecimals={false}
                        />
                        <YAxis
                          dataKey="amenity"
                          type="category"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          width={110}
                        />
                        <Tooltip content={<AmenityTooltip />} />
                        <Bar
                          dataKey="count"
                          fill="#1e3a8a"
                          radius={[0, 4, 4, 0]}
                          maxBarSize={20}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Section 5: Tips for Renters ── */}
          <section>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">Tips for Renters</h2>
              <p className="text-sm text-slate-500 mt-1">
                Make the most of your furnished rental search
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TipCard
                icon={Search}
                title="Search Early"
                body="Start your search 4–6 weeks before your move-in date. Popular cities like New York and San Francisco fill up fast, especially in spring and summer."
              />
              <TipCard
                icon={Calendar}
                title="Compare Monthly Rates"
                body="Always check what's included in the listed price. Utilities, WiFi, and parking can add $200–$500/month if not included — factor these into your budget."
              />
              <TipCard
                icon={Star}
                title="Save Your Favorites"
                body="Use the save feature to bookmark listings you like. Prices and availability can change quickly — acting within 24–48 hours of finding a great listing increases your chances."
              />
            </div>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
}
