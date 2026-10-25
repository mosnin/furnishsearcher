"use client";

import { useState } from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function MessageEmailSettings() {
  const { user } = useUser();
  return user ? <AccountEmailSettings key={user.id} /> : null;
}

function AccountEmailSettings() {
  const settings = useQuery(api.emailContacts.settings, {});
  const setEmails = useMutation(api.emailContacts.setMessageEmails);
  const { getToken } = useAuth(),
    { user } = useUser(),
    clerk = useClerk();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function enable() {
    setBusy(true);
    setError("");
    try {
      if (!user) throw new Error("Please sign in again.");
      await user.reload();
      if (user.primaryEmailAddress?.verification.status !== "verified")
        throw new Error(
          "Confirm your primary email using Manage account email, then try again.",
        );
      const token = await getToken({ template: "convex", skipCache: true });
      const url = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (!token || !url)
        throw new Error(
          "Email confirmation is unavailable. Please sign in again or contact support.",
        );
      const client = new ConvexHttpClient(url);
      client.setAuth(token);
      await client.mutation(api.emailContacts.setMessageEmails, {
        clerkId: user.id,
        enabled: true,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save email settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    setError("");
    try {
      if (!user) throw new Error("Please sign in again.");
      await setEmails({ clerkId: user.id, enabled: false });
    } catch {
      setError("Could not turn off message emails. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="message-email-heading" className="space-y-3">
      <h2
        id="message-email-heading"
        className="text-base font-semibold text-gray-900"
      >
        Message emails
      </h2>
      {settings === undefined ? (
        <p role="status">Loading email settings…</p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            {settings.enabled && settings.confirmed
              ? `Message email notifications are on for ${settings.email}.`
              : settings.enabled
                ? "Message email notifications are paused. Refresh your email confirmation to resume."
                : "Message email notifications are off."}
          </p>
          {settings.confirmed && settings.expiresAt && (
            <p className="text-xs text-gray-500">
              Confirmation expires{" "}
              {new Date(settings.expiresAt).toLocaleDateString()}. Refresh after
              changing your account email.
            </p>
          )}
          {settings.mode === "test" && (
            <p className="text-xs text-amber-700">
              Test account confirmation. Production email setup and delivery
              remain unverified.
            </p>
          )}
          <p className="text-sm text-gray-600">
            Notifications may contain a message preview. Turning them off keeps
            your conversations available in the inbox. Emails already sent
            cannot be recalled. Reply in your inbox; replies to notification
            emails are not connected yet.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={enable}>
              {busy
                ? "Saving…"
                : settings.enabled
                  ? "Refresh email confirmation"
                  : "Turn on message emails"}
            </Button>
            {settings.enabled && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={disable}
              >
                Turn off message emails
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => clerk.openUserProfile()}
            >
              Manage account email
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
