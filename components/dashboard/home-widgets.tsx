"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { performanceReportSeries } from "@/lib/listing-performance";
import {
  Widget,
  Empty,
  ActionLink,
  Status,
} from "@/components/ui-system/primitives";
import { formatDate } from "@/lib/utils";

export function RecentMessages({ enabled }: { enabled: boolean }) {
  const summary = useQuery(api.inbox.summary, enabled ? {} : "skip");
  const recent =
    summary?.recent.filter((row) => !row.archived && !row.blockedByMe) ?? [];
  return (
    <Widget
      title="Recent messages"
      action={
        <ActionLink variant="ghost" href="/dashboard/messages">
          View inbox
        </ActionLink>
      }
    >
      {!summary?.ready ? (
        <Empty title="Checking your inbox…">
          Your private conversations will appear here.
        </Empty>
      ) : recent.length === 0 ? (
        <Empty title="No messages yet">
          Conversations about your rentals and stays appear here.
        </Empty>
      ) : (
        recent.slice(0, 4).map((row) => (
          <Link
            href={`/dashboard/messages?conv=${row._id}`}
            key={row._id}
            className="ds-message-row"
          >
            <div>
              <strong>
                {row.otherUser?.name ?? "Participant unavailable"}
              </strong>
              <small className="ds-caption">
                {formatDate(row.lastMessageAt)}
              </small>
            </div>
            <p>{row.listing?.title ?? "Rental conversation"}</p>
            <p>{row.lastMessage}</p>
          </Link>
        ))
      )}
    </Widget>
  );
}
export function PerformanceWidget({ enabled }: { enabled: boolean }) {
  const [refreshKey, setRefreshKey] = useState("dashboard-home");
  useEffect(() => {
    const timer = setInterval(() => setRefreshKey(crypto.randomUUID()), 60000);
    return () => clearInterval(timer);
  }, []);
  const report = useQuery(
    api.listingPerformance.report,
    enabled ? { days: 30, refreshKey } : "skip",
  );
  const series = report
    ? performanceReportSeries(report).map((row) => ({
        date: new Date(row.day).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        views: row.recorded ? row.views : null,
        requests: row.recorded ? row.bookingRequests : null,
      }))
    : [];
  const views = report?.rows.reduce((n, r) => n + r.views, 0) ?? 0;
  const requests = report?.rows.reduce((n, r) => n + r.bookingRequests, 0) ?? 0;
  return (
    <Widget
      title="Rental activity"
      description="Last 30 UTC days"
      action={
        <ActionLink variant="ghost" href="/dashboard/landlord/analytics">
          View report
        </ActionLink>
      }
    >
      {!report ? (
        <Empty title="Loading measured activity…" />
      ) : report.startedAt === null ? (
        <Empty title="No measured activity yet">
          Views and booking requests will appear after activity is recorded for
          your listings.
        </Empty>
      ) : (
        <>
          <div
            className="ds-chart"
            role="img"
            aria-label={`Recorded activity: ${views} listing views and ${requests} booking requests in this reported UTC window. Open View report for the accessible data table.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 15, left: -20, right: 10, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#ececec" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#616161" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={45}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#616161" }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    fontSize: 12,
                  }}
                />
                <Area
                  name="Listing views"
                  dataKey="views"
                  type="linear"
                  stroke="#303030"
                  fill="#e8e8e8"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Area
                  name="Booking requests"
                  dataKey="requests"
                  type="linear"
                  stroke="#989898"
                  fill="transparent"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="ds-chart-legend">
            <span>
              <i />
              Listing views · {views}
            </span>
            <span>
              <i />
              Booking requests · {requests}
            </span>
          </div>
        </>
      )}
      <footer className="ds-widget-footer">
        {report ? (
          <>
            Environment: {report.mode === "test" ? "development" : "production"}
            . Uncollected history stays unknown.{" "}
            <Link href="/dashboard/landlord/analytics" className="ds-link">
              Open data table
            </Link>
          </>
        ) : (
          "Measured events from your own listings."
        )}
      </footer>
    </Widget>
  );
}
export function ListingStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: "Active",
    inactive: "Inactive",
    incomplete: "Incomplete",
    pending: "In review",
    rejected: "Rejected",
  };
  return (
    <Status
      tone={
        status === "active"
          ? "positive"
          : status === "rejected"
            ? "critical"
            : status === "pending"
              ? "caution"
              : "neutral"
      }
    >
      {labels[status] ?? status}
    </Status>
  );
}
