"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function LeadEmailPreferences() {
  const { isAuthenticated } = useConvexAuth();
  const [listingId, setListingId] = useState<Id<"listings"> | "">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const defaults = useQuery(
    api.housingRequests.leadPreferences,
    isAuthenticated ? {} : "skip",
  );
  const selected = useQuery(
    api.leadNotifications.preferences,
    isAuthenticated && listingId ? { listingId } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.listingPerformance.properties,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 30 },
  );
  const saveDefault = useMutation(api.housingRequests.setLeadPreferences);
  const saveProperty = useMutation(api.leadNotifications.setPreference);
  const current = listingId ? selected : defaults;
  const value = listingId
    ? selected?.override === null
      ? "inherit"
      : selected?.override
        ? "on"
        : "off"
    : defaults?.emailEnabled
      ? "on"
      : "off";
  async function change(value: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (listingId)
        await saveProperty({
          listingId,
          emailEnabled: value === "inherit" ? null : value === "on",
        });
      else await saveDefault({ emailEnabled: value === "on" });
      setMessage(
        listingId
          ? "Rental space email setting saved."
          : "Account email default saved.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save email settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="font-medium">Lead notification email</h3>
      <div className="space-y-2">
        <Label htmlFor="lead-email-scope">
          Account default or rental space
        </Label>
        <select
          id="lead-email-scope"
          className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
          value={listingId}
          disabled={busy || !defaults}
          onChange={(e) => {
            setListingId(e.target.value as Id<"listings"> | "");
            setMessage("");
            setError("");
          }}
        >
          <option value="">Account default</option>
          {results.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
              {p.unitName ? ` · ${p.unitName}` : ""} · {p.status}
            </option>
          ))}
        </select>
        {status === "CanLoadMore" && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => loadMore(30)}
          >
            Load more rental spaces
          </Button>
        )}
        {(status === "LoadingFirstPage" || status === "LoadingMore") && (
          <p role="status" className="text-sm">
            Loading rental spaces…
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-email-setting">Email new leads</Label>
        <select
          id="lead-email-setting"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={current ? value : "loading"}
          disabled={busy || !current}
          onChange={(e) => change(e.target.value)}
        >
          {!current && <option value="loading">Loading setting…</option>}
          {!!listingId && (
            <option value="inherit">
              Use account default ({defaults?.emailEnabled ? "on" : "off"})
            </option>
          )}
          <option value="on" disabled={!current?.canEmail}>
            On
          </option>
          <option value="off">Off</option>
        </select>
      </div>
      {!!listingId && selected && (
        <p className="text-sm text-slate-600">
          Email is {selected.enabled ? "on" : "off"} for this rental space
          {selected.override === null
            ? " using your account default"
            : " with its own setting"}
          .
        </p>
      )}
      {current && !current.canEmail && (
        <p className="text-sm text-slate-600">
          Email delivery requires current account-email confirmation.{" "}
          <Link href="/dashboard/profile" className="underline">
            Review email confirmation in your profile
          </Link>
          .
        </p>
      )}
      <p className="text-sm text-slate-600">
        Your inbox stays available when email is off. The account default
        applies to spaces without their own setting. One request sends at most
        one email if any eligible space has email on.
      </p>
      <p className="text-xs text-slate-500">
        Changes apply before a send starts. Emails already sent or in progress
        cannot be recalled.
      </p>
      {busy && (
        <p role="status" className="text-sm">
          Saving email setting…
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
