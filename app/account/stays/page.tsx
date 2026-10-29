"use client";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  usePublicAccount,
  AccountSignIn,
  AccountEmpty,
  AccountRoleBoundary,
  AccountLoading,
} from "@/components/public-experience/account-state";
const date = (value: number) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export default function StaysPage() {
  const { account, loading, signedIn } = usePublicAccount();
  const { results, status, loadMore } = usePaginatedQuery(
    api.inquiries.getMine,
    account?.role === "tenant" && !account.accountTypePending
      ? { as: "tenant" }
      : "skip",
    { initialNumItems: 15 },
  );
  if (loading) return <AccountLoading />;
  if (!signedIn) return <AccountSignIn returnTo="/account/stays" />;
  if (!account || account.accountTypePending)
    return (
      <AccountEmpty
        title="Complete your account"
        description="Choose a traveler account to keep track of your stay requests."
        action="Continue setup"
        href="/onboarding"
      />
    );
  if (account.role !== "tenant")
    return <AccountRoleBoundary role={account.role} subject="Stay history" />;
  if (status === "LoadingFirstPage") return <AccountLoading />;
  if (!results.length && status === "Exhausted")
    return (
      <AccountEmpty
        title="You don’t have any stays"
        description="You haven’t sent a stay request yet. Explore our properties to find something for your next chapter."
      />
    );
  return (
    <main className="w-account-list-page">
      <Link className="w-account-back" href="/account">
        Back to your account
      </Link>
      <header>
        <h1>Your stays</h1>
        <p>Stay requests and the dates you’ve agreed with property owners.</p>
      </header>
      <div className="w-stay-list">
        {results.map((stay) => (
          <article className="w-stay-card" key={stay._id}>
            <div>
              <span className="w-stay-status" data-status={stay.status}>
                {stay.status === "accepted"
                  ? "Owner approved"
                  : stay.status.replaceAll("_", " ")}
              </span>
              <h2>{stay.title}</h2>
              <p>
                {date(stay.moveIn)} to {date(stay.moveOut)}
              </p>
              <p>
                {stay.occupants} guest{stay.occupants === 1 ? "" : "s"} ·{" "}
                {stay.otherName}
              </p>
            </div>
            <Link
              className="w-account-pill"
              href={`/dashboard/inquiries/${stay._id}`}
            >
              View stay details
            </Link>
          </article>
        ))}
      </div>
      {!results.length && status !== "Exhausted" && (
        <p className="w-account-continuation">
          More stay records remain to be checked.
        </p>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <button
          className="w-account-pill"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(15)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more stays"}
        </button>
      )}
      <p className="w-stay-footnote">
        Owner approval does not confirm a signed lease or payment. Review the
        rental arrangements directly with the owner.
      </p>
    </main>
  );
}
