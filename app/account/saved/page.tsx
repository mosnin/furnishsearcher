"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ListingCard } from "@/components/listing-card";
import { RemoveSavedDialog } from "@/components/remove-saved-dialog";
import {
  usePublicAccount,
  AccountSignIn,
  AccountEmpty,
  AccountRoleBoundary,
  AccountLoading,
} from "@/components/public-experience/account-state";
export default function WishlistPage() {
  const { account, loading, signedIn } = usePublicAccount();
  const { results, status, loadMore } = usePaginatedQuery(
    api.saved.mine,
    account?.role === "tenant" && !account.accountTypePending ? {} : "skip",
    { initialNumItems: 18 },
  );
  const remove = useMutation(api.saved.unsave),
    [pending, setPending] = useState<Id<"listings"> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (loading) return <AccountLoading />;
  if (!signedIn) return <AccountSignIn returnTo="/account/saved" />;
  if (!account || account.accountTypePending)
    return (
      <AccountEmpty
        title="Complete your account"
        description="Choose a traveler account to save properties for later."
        action="Continue setup"
        href="/onboarding"
      />
    );
  if (account.role !== "tenant")
    return <AccountRoleBoundary role={account.role} subject="Your wishlist" />;
  if (status === "LoadingFirstPage") return <AccountLoading />;
  if (!results.length && status === "Exhausted")
    return (
      <AccountEmpty
        title="Your wishlist is empty"
        description="You don’t have any saved properties yet. Start exploring and add your favorites to your wishlist."
      />
    );
  return (
    <main className="w-account-list-page w-wishlist-page">
      <Link className="w-account-back" href="/account">
        Back to your account
      </Link>
      <header>
        <h1>Your wishlist</h1>
        <p>The properties you’ve saved for your next stay.</p>
      </header>
      <div className="w-wishlist-grid">
        {results.map((entry) =>
          entry.listing ? (
            <ListingCard key={entry._id} listing={entry.listing} />
          ) : (
            <article className="w-wishlist-unavailable" key={entry._id}>
              <h2>Property unavailable</h2>
              <p>
                This saved property is not currently public. Keep it to check
                again later or remove it from your wishlist.
              </p>
              <button
                className="w-account-pill"
                onClick={() => {
                  setError("");
                  setPending(entry.listingId);
                }}
              >
                Remove from wishlist
              </button>
            </article>
          ),
        )}
      </div>
      {!results.length && status !== "Exhausted" && (
        <p>More saved records remain to be checked.</p>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <button
          className="w-account-pill"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(18)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more saved properties"}
        </button>
      )}
      {error && (
        <p role="alert" className="w-personal-error">
          {error}
        </p>
      )}
      <RemoveSavedDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
        busy={busy}
        onConfirm={() => {
          if (!pending || busy) return;
          setBusy(true);
          void remove({ tenantId: account._id, listingId: pending })
            .then(() => setPending(null))
            .catch((e) =>
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not update your wishlist.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      />
    </main>
  );
}
