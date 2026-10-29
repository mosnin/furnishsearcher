"use client";
import { useEffect, useState } from "react";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Widget,
  ActionLink,
  Button,
  Status,
  Empty,
} from "@/components/ui-system/primitives";
export default function OwnerNextSteps() {
  const { isAuthenticated } = useConvexAuth();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setRefresh((n) => n + 1), 60000);
    return () => clearInterval(interval);
  }, []);
  const account = useQuery(
    api.ownerTasks.account,
    isAuthenticated ? { refresh } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.ownerTasks.listings,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 10 },
  );
  const tasks = [...(account?.tasks ?? []), ...results].sort(
    (a, b) =>
      ({ attention: 0, setup: 1, optional: 2 })[a.priority] -
      { attention: 0, setup: 1, optional: 2 }[b.priority],
  );
  const loading = !account || status === "LoadingFirstPage";
  return (
    <Widget
      title="Next steps"
      description="Account setup and publication requirements"
      action={
        <span className="ds-caption">
          {loading ? "Checking…" : `${tasks.length} loaded`}
        </span>
      }
    >
      {loading ? (
        <Empty title="Checking your next steps…" />
      ) : tasks.length === 0 ? (
        <Empty
          title={
            status === "Exhausted"
              ? "You're up to date"
              : "No actions in these records"
          }
        >
          {status === "Exhausted"
            ? "No outstanding account or publication actions found."
            : "Continue checking the rest of your properties."}
        </Empty>
      ) : (
        <div className="ds-task-list">
          {tasks.map((task) => (
            <article className="ds-task-row" key={task.id}>
              <div>
                <Status
                  tone={task.priority === "attention" ? "caution" : "neutral"}
                >
                  {task.priority === "attention"
                    ? "Needs attention"
                    : task.priority === "optional"
                      ? "Optional"
                      : "Listing setup"}
                </Status>
                <h3>{task.title}</h3>
                <p>{task.detail}</p>
                {task.issues.length > 0 && (
                  <details>
                    <summary>
                      {task.issues.length} requirements to review
                    </summary>
                    <ul>
                      {task.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <ActionLink
                href={task.href}
                aria-label={`${task.title} — review next step`}
              >
                Review
              </ActionLink>
            </article>
          ))}
        </div>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="ds-widget-body">
          <Button
            variant="secondary"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(10)}
          >
            {status === "LoadingMore" ? "Checking…" : "Check more properties"}
          </Button>
        </div>
      )}
      <footer className="ds-widget-footer">
        Updates after saved changes. Tasks do not automatically purchase access,
        verify identity or publish listings.
      </footer>
    </Widget>
  );
}
