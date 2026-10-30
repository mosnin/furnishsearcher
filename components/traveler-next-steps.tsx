"use client";
import { useEffect, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Button,
  ActionLink,
  Widget,
  Empty,
  Status,
} from "@/components/ui-system/primitives";
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
    enabled && account ? { refreshKey, windowDay: account.day } : "skip",
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
      detail: `${unread} unread conversations in your inbox. Open messages to read and reply.`,
      href: "/dashboard/messages",
      optional: false,
    });
  const stay =
    dashboard.stays.find((row) => !row.calendarReserved) ?? dashboard.stays[0];
  if (stay)
    tasks.unshift({
      id: "stay",
      title: `Review your stay: ${stay.title}`,
      detail: stay.calendarReserved
        ? "Review agreed dates and discuss changes with the owner."
        : "Calendar reservation needs owner attention. Review before relying on coverage.",
      href: stay.href,
      optional: false,
    });
  return (
    <Widget
      title="Next steps"
      description="Your profile, search and stay actions"
    >
      {dashboard.loading ? (
        <Empty title="Checking your next steps…" />
      ) : (
        <div className="ds-task-list">
          {tasks.map((task) => (
            <article className="ds-task-row" key={task.id}>
              <div>
                <Status>{task.optional ? "Optional" : "Next step"}</Status>
                <h3>{task.title}</h3>
                <p>{task.detail}</p>
              </div>
              <ActionLink
                href={task.href}
                aria-label={`${task.title} — open next step`}
              >
                Open
              </ActionLink>
            </article>
          ))}
        </div>
      )}
    </Widget>
  );
}
export function TravelerStays({ dashboard }: { dashboard: Dashboard }) {
  const more =
    dashboard.status === "CanLoadMore" || dashboard.status === "LoadingMore";
  return (
    <Widget
      title="Current & upcoming stays"
      description="Accepted inquiries with their calendar status"
      action={
        <ActionLink variant="ghost" href="/dashboard/inquiries">
          All inquiries
        </ActionLink>
      }
    >
      {dashboard.loading ? (
        <Empty title="Checking accepted inquiries…" />
      ) : !dashboard.stays.length ? (
        <Empty title="No upcoming stays">
          Pending, declined and cancelled requests remain in your inquiry
          history.
        </Empty>
      ) : (
        <div className="ds-task-list">
          {dashboard.stays.map((stay) => (
            <article className="ds-task-row" key={stay.id}>
              <div>
                <Status
                  tone={
                    stay.phase === "needs_review" || !stay.calendarReserved
                      ? "caution"
                      : "neutral"
                  }
                >
                  {stay.phase === "active"
                    ? "Active"
                    : stay.phase === "upcoming"
                      ? "Upcoming"
                      : "Needs review"}
                </Status>
                <h3>{stay.title}</h3>
                <p>
                  {stay.phase === "needs_review"
                    ? "The property reference or dates need review."
                    : `${formatStayDate(stay.moveIn)} – ${formatStayDate(stay.moveOut)}`}
                </p>
                <p>
                  {stay.ownerName}
                  {!stay.calendarReserved &&
                    " · Calendar reservation needs owner attention"}
                </p>
              </div>
              <ActionLink href={stay.href}>View stay</ActionLink>
            </article>
          ))}
        </div>
      )}
      {more && (
        <div className="ds-widget-body">
          <Button
            variant="secondary"
            disabled={dashboard.status === "LoadingMore"}
            onClick={() => dashboard.loadMore(10)}
          >
            {dashboard.status === "LoadingMore"
              ? "Loading…"
              : "Load more stays"}
          </Button>
        </div>
      )}
      <footer className="ds-widget-footer" role="status">
        {dashboard.loading
          ? "Checking dates…"
          : `${dashboard.stays.length} accepted records loaded. ${more ? "More records remain." : "All current and future records checked."}`}{" "}
        Accepted inquiries do not confirm a signed lease or payment.
      </footer>
    </Widget>
  );
}
