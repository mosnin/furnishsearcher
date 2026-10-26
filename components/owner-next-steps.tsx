"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const tasks = [...(account?.tasks ?? []), ...results];
  tasks.sort(
    (a, b) =>
      ({ attention: 0, setup: 1, optional: 2 })[a.priority] -
      { attention: 0, setup: 1, optional: 2 }[b.priority],
  );
  const loading = !account || status === "LoadingFirstPage";
  return (
    <section className="space-y-4" aria-labelledby="owner-next-steps-heading">
      <div>
        <h2
          id="owner-next-steps-heading"
          className="text-lg font-semibold text-slate-900"
        >
          What's next
        </h2>
        <p className="text-sm text-slate-500">
          Your account and listing actions, based on their current saved status.
        </p>
      </div>
      {loading && (
        <p role="status" className="text-sm">
          Checking your next steps…
        </p>
      )}
      {!loading && tasks.length === 0 && status === "Exhausted" && (
        <p role="status" className="text-sm">
          No outstanding account or publication actions found.
        </p>
      )}
      {!loading && tasks.length === 0 && status !== "Exhausted" && (
        <p role="status" className="text-sm">
          No actions in the properties checked so far. Continue checking your
          remaining properties.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {tasks.map((task) => (
          <Card
            key={task.id}
            className={task.priority === "attention" ? "border-amber-300" : ""}
          >
            <CardContent className="p-5 space-y-3">
              <p className="text-xs font-medium text-slate-500">
                {task.priority === "attention"
                  ? "Needs attention"
                  : task.priority === "optional"
                    ? "Optional"
                    : "Listing setup"}
              </p>
              <h3 className="font-semibold break-words">{task.title}</h3>
              <p className="text-sm text-slate-600">{task.detail}</p>
              {task.issues.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {task.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
              <Button asChild variant="outline">
                <Link
                  href={task.href}
                  aria-label={`${task.title} — review next step`}
                >
                  Review next step
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          variant="outline"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(10)}
        >
          {status === "LoadingMore"
            ? "Checking more properties…"
            : "Check more properties"}
        </Button>
      )}
      <p className="text-xs text-slate-500">
        Tasks update after saved changes. Account dates are rechecked every
        minute while this page is open. Completing a task does not purchase a
        subscription, verify identity or publish a listing automatically.
      </p>
    </section>
  );
}
