"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function useContactClock(expiresAt: number | null | undefined) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!expiresAt) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function refresh() {
      const current = Date.now();
      setNow(current);
      const remaining = expiresAt! - current;
      if (remaining > 0)
        timer = setTimeout(refresh, Math.min(remaining + 10, 2147483647));
    }
    refresh();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [expiresAt]);
  return Math.max(now, Date.now());
}
export function OwnerPhoneSettings({
  phoneMatches,
}: {
  phoneMatches: boolean;
}) {
  const state = useQuery(api.phoneContacts.settings, {});
  const save = useMutation(api.phoneContacts.setEnabled);
  const [busy, setBusy] = useState(false);
  const now = useContactClock(state?.expiresAt);
  const enabled =
    !!state?.enabled && !!state.expiresAt && state.expiresAt > now;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold">Calls from your listings</h3>
      <p className="mt-2 text-xs text-slate-600">
        Choose whether signed-in travelers can reveal your saved, confirmed
        phone number on all your published rental spaces. This does not send a
        call or text. People may keep a number they have already seen.
      </p>
      <p className="mt-2 text-xs text-slate-600">
        Sharing stops when you turn it off, change the number or its
        confirmation expires. Refreshing confirmation does not extend this
        permission; enable it again for the new confirmation period.
      </p>
      <button
        type="button"
        disabled={
          busy || !state || (!enabled && (!state.canEnable || !phoneMatches))
        }
        className="mt-3 text-sm underline text-blue-700 disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          try {
            await save({ enabled: !enabled });
            toast.success(
              enabled
                ? "Listing phone contact disabled."
                : "Listing phone contact enabled.",
            );
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not save phone-contact settings.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Saving…"
          : enabled
            ? "Disable listing phone contact"
            : "Enable listing phone contact"}
      </button>
      {!state?.canEnable && (
        <p className="mt-2 text-xs text-slate-500">
          Confirm your saved phone number to enable calls.
        </p>
      )}
      {!phoneMatches && (
        <p className="mt-2 text-xs text-slate-500">
          Save and confirm the edited number before enabling contact.
        </p>
      )}
    </div>
  );
}
export function ListingPhoneContact({
  listingId,
}: {
  listingId: Id<"listings">;
}) {
  const { userId, isLoaded } = useAuth();
  return (
    <PhoneReveal
      key={`${listingId}:${userId ?? "anonymous"}`}
      listingId={listingId}
      ready={isLoaded}
    />
  );
}
function PhoneReveal({
  listingId,
  ready,
}: {
  listingId: Id<"listings">;
  ready: boolean;
}) {
  const { isLoading } = useConvexAuth();
  const availability = useQuery(
    api.phoneContacts.availability,
    ready && !isLoading ? { listingId } : "skip",
  );
  const reveal = useMutation(api.phoneContacts.reveal);
  const [result, setResult] = useState<{
    phone: string;
    revision: number;
    expiresAt: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useContactClock(availability?.expiresAt);
  if (
    !ready ||
    isLoading ||
    !availability ||
    availability.status === "unavailable"
  )
    return null;
  if (availability.status === "sign-in")
    return (
      <Link
        className="block text-center text-sm underline text-slate-700"
        href={`/sign-in?redirect_url=${encodeURIComponent(`/listings/${listingId}`)}`}
      >
        Sign in for phone contact
      </Link>
    );
  if (!availability.expiresAt || availability.expiresAt <= now) return null;
  const current =
    result &&
    result.revision === availability.revision &&
    result.expiresAt === availability.expiresAt &&
    result.expiresAt > now;
  return (
    <div className="rounded-xl border border-slate-200 p-3 text-sm">
      {current ? (
        <a
          className="flex items-center justify-center gap-2 font-semibold text-[#0f2044] underline"
          href={`tel:${result.phone}`}
        >
          <Phone className="h-4 w-4" />
          {result.phone}
        </a>
      ) : (
        <button
          type="button"
          disabled={busy}
          className="w-full flex justify-center items-center gap-2 font-medium disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              setResult(await reveal({ listingId }));
            } catch (error) {
              setResult(null);
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Phone contact is unavailable. Try listing messages.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Phone className="h-4 w-4" />
          {busy ? "Checking…" : "Show owner phone number"}
        </button>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Keep stay terms and confirmations in your message thread. Revealing a
        number does not place a call.
      </p>
    </div>
  );
}
