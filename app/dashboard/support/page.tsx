"use client";
import Link from "next/link";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
export default function SupportCasesPage() {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.support.mine,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 20 },
  );
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold">Your support cases</h1>
      <p className="text-sm text-slate-500">
        Follow up on cases and reports submitted while signed in. Staff notes
        and other people’s cases are private.
      </p>
      <Link href="/contact" className="inline-block underline">
        Start a support case
      </Link>
      {status === "LoadingFirstPage" ? (
        <p>Loading cases…</p>
      ) : results.length === 0 ? (
        <p>No support cases yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {results.map((c) => (
            <li key={c._id} className="p-4">
              <Link
                className="font-medium underline"
                href={`/dashboard/support/${c._id}`}
              >
                {c.subject}
              </Link>
              <p className="text-sm text-slate-500 capitalize">
                {c.status} · {new Date(c.createdAt).toLocaleDateString()}
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
