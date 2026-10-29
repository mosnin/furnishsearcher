"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import {
  marketScope,
  MIN_MARKET_CONTRIBUTORS,
  type Bucket,
} from "@/lib/market-insights";
import { US_STATES } from "@/lib/locations";
import { buildSearchUrl } from "@/lib/search";
const labels: Record<string, string> = {
  search: "Recorded searches",
  inquiry: "Stay inquiries",
  conversation: "New traveler conversations",
  housing_request: "Housing requests",
};
function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold mt-2">{value}</p>
        <p className="text-xs text-slate-500 mt-2">{note}</p>
      </CardContent>
    </Card>
  );
}
function Breakdown({
  title,
  buckets,
  dimension,
  empty,
}: {
  title: string;
  buckets: Bucket[];
  dimension: string;
  empty: string;
}) {
  const rows = buckets
      .filter((x) => x.dimension === dimension)
      .sort((a, b) => b.count - a.count),
    max = Math.max(1, ...rows.map((x) => x.count));
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="font-semibold mb-4">{title}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Category</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className="text-left font-normal py-2 pr-3 w-2/3"
                  >
                    {row.key}
                    <div
                      aria-hidden="true"
                      className="h-1.5 mt-1 bg-blue-100 rounded"
                    >
                      <div
                        className="h-full bg-primary rounded"
                        style={{ width: `${(row.count / max) * 100}%` }}
                      />
                    </div>
                  </th>
                  <td className="text-right tabular-nums">
                    {row.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
export default function MarketInsightsPage() {
  const [city, setCity] = useState(""),
    [state, setState] = useState(""),
    [selected, setSelected] = useState<{ city?: string; state?: string }>({}),
    [error, setError] = useState("");
  const data = useQuery(api.marketInsights.overview, selected),
    cities = useQuery(api.analytics.getPricesByCity, {});
  const supply = data?.supply,
    searches = data?.demand.find((x) => x.kind === "search");
  const title = selected.city
    ? `${selected.city}, ${selected.state}`
    : "All US markets";
  function choose(nextCity: string, nextState: string) {
    try {
      marketScope(nextCity || undefined, nextState || undefined);
      setSelected(nextCity ? { city: nextCity.trim(), state: nextState } : {});
      setCity(nextCity);
      setState(nextState);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Choose a city and state.");
    }
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />
      <main className="pt-24 pb-16 max-w-6xl mx-auto px-4 space-y-8">
        <header>
          <h1 className="text-3xl font-bold">Market insights</h1>
          <p className="text-slate-600 mt-2">
            Explore this marketplace’s eligible rental inventory and recorded
            search activity. These figures do not guarantee a booking.
          </p>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            choose(city, state);
          }}
          className="bg-white border rounded-xl p-5 flex flex-wrap gap-4 items-end"
        >
          <label className="text-sm flex-1 min-w-40">
            City
            <input
              value={city}
              maxLength={100}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Austin"
              className="block border rounded-md p-2 mt-1 w-full"
            />
          </label>
          <label className="text-sm">
            State
            <select
              value={state}
              onChange={(event) => setState(event.target.value)}
              className="block border rounded-md p-2 mt-1"
            >
              <option value="">Select state</option>
              {Object.entries(US_STATES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">View market</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => choose("", "")}
          >
            All markets
          </Button>
          {error && (
            <p role="alert" className="w-full text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
        <section aria-labelledby="market-heading" className="space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <h2 id="market-heading" className="text-xl font-semibold">
              {title}
            </h2>
            <Link className="text-sm underline" href={buildSearchUrl(selected)}>
              Search these rentals
            </Link>
          </div>
          {data === undefined ? (
            <p role="status">Loading market data…</p>
          ) : (
            <>
              {data.mode === "test" && (
                <p className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  Test environment. Records may be synthetic and are not
                  production marketplace statistics.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat
                  label="Eligible rental spaces"
                  value={supply ? supply.listings.toLocaleString() : "Updating"}
                  note="Separate rentable units count separately."
                />
                <Stat
                  label="Average listed monthly rent"
                  value={
                    supply?.avgCents !== null && supply?.avgCents !== undefined
                      ? formatPrice(supply.avgCents / 100)
                      : "—"
                  }
                  note="Listed rent, before additional fees; not achieved rent."
                />
                {data.demand.slice(0, 2).map((row) => (
                  <Stat
                    key={row.kind}
                    label={labels[row.kind]}
                    value={
                      row.visible ? row.count!.toLocaleString() : "Limited data"
                    }
                    note="Last 30 UTC calendar days, including today."
                  />
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {supply
                  ? `Inventory was collected between ${new Date(supply.startedAt).toLocaleString()} and ${new Date(supply.completedAt).toLocaleString()}. Eligibility was checked as records were collected; availability still depends on your dates.`
                  : "The first eligible inventory snapshot is still being collected. No inventory total is asserted yet."}
              </p>
            </>
          )}
        </section>
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">What people search for</h2>
          <p className="text-sm text-slate-600">
            First-party, client-reported search filters, not verified travelers
            or total market demand. Repeat use and automated traffic may be
            included. Pagination, sorting and reactive updates do not create
            another observation of the same coarse filters in a page
            session/day. Do Not Track and Global Privacy Control are respected.
          </p>
          <p className="text-xs text-slate-500">
            {data?.collectedSince
              ? `Collection began ${new Date(data.collectedSince).toLocaleDateString()}; earlier activity is not backfilled. Report covers ${new Date(data.from).toLocaleDateString()} through ${new Date(data.through).toLocaleString()}.`
              : "No search history is claimed before collection begins."}{" "}
            Each activity category remains hidden until at least{" "}
            {MIN_MARKET_CONTRIBUTORS} distinct contributing account or
            page-session references are observed in the report window. Those
            references are not a count of unique people.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {["conversation", "housing_request"].map((kind) => {
              const row = data?.demand.find((x) => x.kind === kind);
              return (
                <Stat
                  key={kind}
                  label={labels[kind]}
                  value={
                    row?.visible ? row.count!.toLocaleString() : "Limited data"
                  }
                  note="Events recorded since collection began; conversations and requests are separate metrics."
                />
              );
            })}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              ["Monthly budget ceilings", "budget"],
              ["Requested bedrooms", "bedrooms"],
              ["Requested property types", "type"],
              ["Requested amenities", "amenity"],
              ["Move-in lead time", "lead"],
              ["Requested stay length", "duration"],
            ].map(([title, dimension]) => (
              <Breakdown
                key={dimension}
                title={title}
                dimension={dimension}
                buckets={searches?.buckets ?? []}
                empty="Not enough recorded search activity to show this breakdown."
              />
            ))}
          </div>
          <p className="text-xs text-slate-500">
            A search can select several property types or amenities, so their
            counts can exceed the number of searches. Unspecified filters remain
            labeled. Traveler professions are not inferred from searches. Native
            inquiries and housing requests are recorded by the server; a request
            is not a completed booking.
          </p>
        </section>
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">What is listed</h2>
          <p className="text-sm text-slate-600">
            Supply is separate from requested preferences. Only publishable US
            rental spaces with valid city/state data enter the completed
            snapshot.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <Breakdown
              title="Listed property types"
              dimension="type"
              buckets={supply?.buckets ?? []}
              empty="No eligible inventory in the completed snapshot."
            />
            <Breakdown
              title="Listed bedrooms"
              dimension="bedrooms"
              buckets={supply?.buckets ?? []}
              empty="No eligible inventory in the completed snapshot."
            />
            <Breakdown
              title="Listed amenities"
              dimension="amenity"
              buckets={supply?.buckets ?? []}
              empty="No standard amenities recorded in the snapshot."
            />
          </div>
        </section>
        <section className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="text-xl font-semibold">Listed rent by city</h2>
          <p className="text-sm text-slate-500">
            Up to 20 cities ranked by highest average listed rent in the
            completed inventory snapshot. This is supply, not popularity or
            traveler demand. City names are paired with their state.
          </p>
          {cities === undefined ? (
            <p role="status">Loading cities…</p>
          ) : cities.length === 0 ? (
            <p className="text-sm text-slate-500">
              No eligible city inventory is recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2">City</th>
                    <th>Rental spaces</th>
                    <th>Average monthly rent</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((row) => (
                    <tr
                      key={`${row.city}-${row.state}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => choose(row.city, row.state)}
                          className="text-primary underline"
                        >
                          {row.city}, {row.state}
                        </button>
                      </td>
                      <td>{row.count.toLocaleString()}</td>
                      <td>{formatPrice(row.avgPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
