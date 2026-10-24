"use client";
import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
type Status = "open" | "reviewing" | "resolved" | "dismissed";
function Queue() {
  const [filter, setFilter] = useState<Status | "all">("open");
  const { results, status, loadMore } = usePaginatedQuery(
    api.support.queue,
    { status: filter === "all" ? undefined : filter },
    { initialNumItems: 20 },
  );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Support & reports</h1>
      <label className="flex gap-3 items-center">
        Case status
        <select
          className="border rounded-md p-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Status | "all")}
        >
          {["open", "reviewing", "resolved", "dismissed", "all"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {status === "LoadingFirstPage" ? (
        <p>Loading cases…</p>
      ) : results.length === 0 ? (
        <p>No cases with this status.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {results.map((c) => (
            <li key={c._id} className="p-4 space-y-1">
              <Link
                className="font-medium underline"
                href={`/dashboard/support/${c._id}`}
              >
                {c.subject}
              </Link>
              <p className="text-sm">
                {c.name} · {c.category ?? "Support"}
              </p>
              <p className="text-sm text-slate-500">
                {c.status} · {new Date(c.createdAt).toLocaleString()} · Staff
                notification: {c.notificationStatus}
              </p>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Load more cases
        </Button>
      )}
      {status === "LoadingMore" && <p>Loading…</p>}
    </div>
  );
}
export default function AdminSupportPage() {
  const { userId } = useAuth();
  const user = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  return (
    <div className="max-w-5xl mx-auto p-6">
      {user === undefined ? (
        <p>Loading…</p>
      ) : user?.role !== "admin" ? (
        <p>Staff access required.</p>
      ) : (
        <Queue />
      )}
    </div>
  );
}
