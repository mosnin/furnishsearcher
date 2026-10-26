"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatStayDate } from "@/lib/utils";
export function useTravelerDashboard(enabled: boolean) {
  const [refreshKey, refresh] = useState(() => crypto.randomUUID());
  const account = useQuery(
    api.travelerDashboard.account,
    enabled ? { refreshKey } : "skip",
  );
  const {
    results: stays,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.travelerDashboard.stays,
    enabled ? { refreshKey } : "skip",
    { initialNumItems: 10 },
  );
  useEffect(() => {
    if (!enabled || !account) return;
    const invalidate = () => {
      if (document.visibilityState === "visible") refresh(crypto.randomUUID());
    };
    const timer = setTimeout(
      invalidate,
      Math.max(
        1000,
        Math.min(86400000, account.nextDay - account.checkedAt + 1000),
      ),
    );
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, [enabled, account]);
  const mixedDay =
    !!account && stays.some((row) => row.asOfDay !== account.day);
  useEffect(() => {
    if (mixedDay) refresh(crypto.randomUUID());
  }, [mixedDay]);
  return {
    account,
    stays,
    status,
    loadMore,
    loading: !account || status === "LoadingFirstPage" || mixedDay,
    active: stays.filter((row) => row.phase === "active").length,
    upcoming: stays.filter((row) => row.phase === "upcoming").length,
  };
}
type Dashboard = ReturnType<typeof useTravelerDashboard>;
export default function TravelerNextSteps({
  dashboard,
  unread,
  inboxReady,
}: {
  dashboard: Dashboard;
  unread: number;
  inboxReady: boolean;
}) {
  const tasks = [...(dashboard.account?.tasks ?? [])];
  if (inboxReady && unread > 0)
    tasks.unshift({
      id: "reply",
      title: "Read your unread conversations",
      detail: `${unread} unread conversation${unread === 1 ? "" : "s"} in your inbox. Open messages to read and reply.`,
      href: "/dashboard/messages",
      optional: false,
    });
  const stay =
    dashboard.stays.find((row) => !row.calendarReserved) ?? dashboard.stays[0];
  if (stay)
    tasks.unshift({
      id: "stay",
      title: stay.calendarReserved
        ? `Review your stay: ${stay.title}`
        : `Review a stay needing owner attention: ${stay.title}`,
      detail: stay.calendarReserved
        ? "Review your agreed dates and discuss any changes with the owner in stay management."
        : "This accepted inquiry has a missing or mismatched calendar reservation. Ask the owner to review it before relying on calendar coverage.",
      href: stay.href,
      optional: false,
    });
  return (
    <section className="space-y-4" aria-labelledby="traveler-next-heading">
      <div>
        <h2
          id="traveler-next-heading"
          className="text-lg font-semibold text-slate-900"
        >
          What's next
        </h2>
        <p className="text-sm text-slate-500">
          Actions based on your current saved profile, search, inbox and loaded
          stays.
        </p>
      </div>
      {dashboard.loading ? (
        <p role="status">Checking your next steps…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs text-slate-500">
                  {task.optional ? "Optional" : "Next step"}
                </p>
                <h3 className="font-semibold break-words">{task.title}</h3>
                <p className="text-sm text-slate-600">{task.detail}</p>
                <Button asChild variant="outline">
                  <Link
                    href={task.href}
                    aria-label={`${task.title} — open next step`}
                  >
                    Open next step
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
export function TravelerStays({ dashboard }: { dashboard: Dashboard }) {
  const more =
    dashboard.status === "CanLoadMore" || dashboard.status === "LoadingMore";
  return (
    <section className="space-y-4" aria-labelledby="traveler-stays-heading">
      <div>
        <h2
          id="traveler-stays-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Your current and upcoming stays
        </h2>
        <p role="status" className="text-sm text-slate-500">
          {dashboard.loading
            ? "Checking accepted booking inquiries…"
            : `${dashboard.stays.length} accepted stay records loaded. ${more ? "More records remain to check." : "All current and future records checked."}`}
        </p>
      </div>
      {!dashboard.loading && !dashboard.stays.length && (
        <p className="text-sm text-slate-500">
          No current or upcoming accepted inquiries. Pending, declined and
          cancelled requests remain in{" "}
          <Link className="underline" href="/dashboard/inquiries">
            your inquiries
          </Link>
          .
        </p>
      )}
      {!dashboard.loading &&
        dashboard.stays.map((stay) => (
          <Card key={stay.id}>
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold break-words">{stay.title}</h3>
              <p className="text-sm text-slate-600">
                {stay.phase === "active"
                  ? "Active stay"
                  : stay.phase === "upcoming"
                    ? "Upcoming stay"
                    : "Dates need review"}{" "}
                · {stay.ownerName}
              </p>
              <p className="text-sm">
                {stay.phase === "needs_review"
                  ? "Ask the owner to review the recorded property and dates."
                  : `${formatStayDate(stay.moveIn)} – ${formatStayDate(stay.moveOut)} (checkout)`}
              </p>
              {!stay.calendarReserved && (
                <p className="text-sm text-amber-800">
                  The owner needs to review calendar coverage for this accepted
                  inquiry.
                </p>
              )}
              <Button asChild variant="outline">
                <Link href={stay.href}>View stay details</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      {more && (
        <Button
          variant="outline"
          disabled={dashboard.status === "LoadingMore"}
          onClick={() => dashboard.loadMore(10)}
        >
          {dashboard.status === "LoadingMore"
            ? "Checking…"
            : "Load more stay records"}
        </Button>
      )}
      <p className="text-xs text-slate-500">
        Stay metrics cover loaded records and UTC dates. Accepted inquiries do
        not establish a signed lease or payment.{" "}
        {dashboard.account &&
          `Checked ${new Date(dashboard.account.checkedAt).toISOString().replace("T", " ").slice(0, 19)} UTC.`}
      </p>
    </section>
  );
}
