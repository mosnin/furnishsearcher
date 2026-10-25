"use client";
import { useState } from "react";
import { MapEligibilityPanel } from "@/components/map-eligibility-panel";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { usePaginatedQuery, useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatPrice } from "@/lib/utils";
import {
  PERFORMANCE_METRICS,
  metricLabels,
  emptyPerformance,
  performanceSeries,
  performanceCsv,
  metricRecorded,
  type PerformanceMetric,
} from "@/lib/listing-performance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
export default function LandlordAnalyticsPage() {
  const { userId, isLoaded } = useAuth();
  return !isLoaded ? (
    <p role="status">Loading account…</p>
  ) : userId ? (
    <AccountPerformance key={userId} />
  ) : (
    <p>Please sign in to view your listing performance.</p>
  );
}
function AccountPerformance() {
  const { isAuthenticated } = useConvexAuth();
  const { userId } = useAuth();
  const me = useQuery(
    api.users.getByClerkId,
    isAuthenticated && userId ? { clerkId: userId } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.listingPerformance.properties,
    isAuthenticated && me ? {} : "skip",
    { initialNumItems: 30 },
  );
  const [selected, setSelected] = useState<Id<"listings"> | null>(null),
    [days, setDays] = useState(90),
    [metric, setMetric] = useState<PerformanceMetric>("views");
  const listingId = selected;
  const report = useQuery(
    api.listingPerformance.report,
    isAuthenticated && me
      ? { ...(listingId ? { listingId } : {}), days }
      : "skip",
  );
  const rows = performanceSeries(
    report?.rows ?? [],
    days,
    report?.startedAt ?? null,
    Date.now(),
    report?.phoneStartedAt ?? null,
    report?.unmatchedStartedAt ?? null,
  );
  const totals = rows.reduce((counts, row) => {
    for (const key of PERFORMANCE_METRICS)
      if (metricRecorded(row, key)) counts[key] += row[key];
    return counts;
  }, emptyPerformance());
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([performanceCsv(rows, report.mode)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `listing-performance-${report.mode}-${report.listingId ?? "all"}-${days}-days.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (me === undefined) return <p role="status">Loading account…</p>;
  if (!me) return <p>Complete your account profile first.</p>;
  return (
    <div className="space-y-6 min-w-0 w-full">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Listing performance
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          Recorded daily activity for each property or rental space. Dates use
          UTC. Browser observations are not verified unique people.
        </p>
      </header>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm min-w-0 max-w-full">
          Property or unit
          <select
            className="block mt-1 border rounded-md p-2 max-w-full w-full"
            value={listingId ?? ""}
            onChange={(e) =>
              setSelected(
                e.target.value ? (e.target.value as Id<"listings">) : null,
              )
            }
          >
            <option value="">All my rental spaces</option>
            {results.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
                {row.unitName ? ` · ${row.unitName}` : ""}
              </option>
            ))}
          </select>
        </label>
        {status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => loadMore(30)}>
            Load more rental spaces
          </Button>
        )}
        <label className="text-sm">
          Reporting period
          <select
            className="block mt-1 border rounded-md p-2"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                Last {n} days
              </option>
            ))}
          </select>
        </label>
      </div>
      {status === "LoadingFirstPage" || status === "LoadingMore" ? (
        <p role="status">Loading rental spaces…</p>
      ) : results.length === 0 ? (
        <p>
          No rental spaces are associated with this account.{" "}
          <Link className="underline" href="/dashboard/landlord/listings">
            Manage listings
          </Link>
        </p>
      ) : null}
      {me && report === undefined ? (
        <p role="status">Loading private activity…</p>
      ) : (
        report && (
          <>
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h2 className="font-semibold">
                {report.title}
                {report.price !== null
                  ? ` · ${formatPrice(report.price)}/month`
                  : ""}
              </h2>
              <Button variant="outline" onClick={download}>
                Download daily CSV
              </Button>
            </div>
            <p className="text-sm text-slate-600">
              {report.startedAt === null
                ? "No dated activity has been recorded for this owner and rental space. Earlier daily history is unavailable."
                : `First recorded activity: ${new Date(report.startedAt).toISOString().replace("T", " ").slice(0, 19)} UTC. The first collection day may be partial; earlier days are unavailable.`}{" "}
              {report.mode === "test"
                ? "Test-environment activity; production figures are separate."
                : "Production-environment activity."}
            </p>
            <p className="text-sm text-slate-600">
              {report.phoneStartedAt === null
                ? "Phone reveal history is unavailable until the first counted reveal."
                : `Phone reveal collection began ${new Date(report.phoneStartedAt).toISOString().replace("T", " ").slice(0, 19)} UTC. Earlier phone history is unavailable and its first day may be partial.`}{" "}
              Successful number reveals count at most once per signed-in
              account/rental space/UTC day. Staff and the owner are excluded.
              This records access to the number, not a completed call or text.
            </p>
            <p className="text-sm text-slate-600">
              {report.unmatchedStartedAt === null
                ? "Unmatched lead history is unavailable until the first counted partial match."
                : `Unmatched lead collection began ${new Date(report.unmatchedStartedAt).toISOString().replace("T", " ").slice(0, 19)} UTC. Earlier unmatched history is unavailable and its first day may be partial.`}{" "}
              Lead counts are request/rental-space pairs; one request can count
              for multiple spaces and later as matched. They record first
              qualifying matches, rather than the number of currently open
              leads.
            </p>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {PERFORMANCE_METRICS.map((key) => (
                <Card key={key}>
                  <CardContent className="p-5">
                    <p className="text-sm text-slate-500">
                      {metricLabels[key]}
                    </p>
                    <p className="text-2xl font-semibold mt-2">
                      {(key === "phoneReveals" &&
                        report.phoneStartedAt === null) ||
                      (key === "unmatchedLeads" &&
                        report.unmatchedStartedAt === null)
                        ? "Unavailable"
                        : totals[key].toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <MapEligibilityPanel
              key={`${listingId ?? "all"}-${days}`}
              listingId={listingId}
              days={days}
            />
            <section
              className="rounded-xl border bg-white p-4 space-y-4"
              aria-label="Daily listing activity"
            >
              <label className="text-sm">
                Chart activity
                <select
                  className="block mt-1 border rounded-md p-2"
                  value={metric}
                  onChange={(e) =>
                    setMetric(e.target.value as PerformanceMetric)
                  }
                >
                  {PERFORMANCE_METRICS.map((key) => (
                    <option key={key} value={key}>
                      {metricLabels[key]}
                    </option>
                  ))}
                </select>
              </label>
              {(metric === "phoneReveals"
                ? report.phoneStartedAt
                : metric === "unmatchedLeads"
                  ? report.unmatchedStartedAt
                  : report.startedAt) === null ? (
                <p>No dated activity to chart yet.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={rows.map((row) => ({
                        ...row,
                        date: new Date(row.day).toISOString().slice(0, 10),
                        value: metricRecorded(row, metric) ? row[metric] : null,
                      }))}
                    >
                      <XAxis dataKey="date" minTickGap={40} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar
                        dataKey="value"
                        name={metricLabels[metric]}
                        fill="#1e3a8a"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <details>
                <summary className="cursor-pointer font-medium">
                  Daily data table
                </summary>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="text-left py-3">
                      Unavailable days have no reconstructed daily values. A
                      recorded zero means no accepted events, not confirmed
                      absence of traffic.
                    </caption>
                    <thead>
                      <tr>
                        <th className="text-left">UTC date</th>
                        {PERFORMANCE_METRICS.map((key) => (
                          <th className="text-left p-2" key={key}>
                            {metricLabels[key]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.day} className="border-t">
                          <th
                            scope="row"
                            className="text-left py-2 font-normal"
                          >
                            {new Date(row.day).toISOString().slice(0, 10)}
                          </th>
                          {PERFORMANCE_METRICS.map((key) => (
                            <td className="p-2" key={key}>
                              {metricRecorded(row, key)
                                ? row[key].toLocaleString()
                                : "Unavailable"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Search appearances count visible cards or individual map pins,
                with a one-second visibility delay. Grouped map spaces count
                only when individually shown. Views count a visible property
                page after one second. Appearances, views and completed
                share/copy actions are capped at one per listing/account or page
                reference per UTC day. Browser observations respect Do Not Track
                and Global Privacy Control and exclude the signed-in owner and
                staff; anonymous references can reset and are not proof of
                unique visitors.
              </p>
              <p>
                Saves added/removed, accepted booking requests, new
                traveler-created threads and first stored housing-request
                matches come from their native transactions. Saves are actions
                during this period, not current favorites. Shares measure the
                completed browser action, not delivery to another person.
                Requests and threads can overlap; they are separate activity
                counts.
              </p>
              <p>
                Legacy stored view counter:{" "}
                {report.legacyViews === null
                  ? "select a rental space"
                  : report.legacyViews.toLocaleString()}
                . It predates the current checks and has no recoverable daily
                history. It is excluded from this chart. Current unmatched
                criteria are available on the Tenant Requests page. Recorded map
                eligibility checks are shown separately above; missing checks
                cannot establish continuous eligibility. Current reviews remain
                available on the listing.{" "}
                {report.status
                  ? `Status “${report.status}” does not by itself prove current publication eligibility.`
                  : "Portfolio totals count activity attributed to this account when it owned the rental spaces. Per-space reports use the current owner."}
              </p>
            </div>
            {report.listingId && (
              <Link
                className="inline-block underline text-sm"
                href={`/dashboard/landlord/listings/${report.listingId}/edit`}
              >
                Manage this rental space
              </Link>
            )}
          </>
        )
      )}
      <Link
        className="inline-block text-sm underline text-[#1e3a8a]"
        href="/market-insights"
      >
        Explore market supply and recorded demand
      </Link>
    </div>
  );
}
