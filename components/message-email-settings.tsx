"use client";

import { useState } from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import Link from "next/link";
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
            cannot be recalled. Only notifications that explicitly offer email
            replies can accept one. You can always reply in your inbox.
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
      <EmailReplyActivity />
    </section>
  );
}

function EmailReplyActivity() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.inboundEmails.mine,
    {},
    { initialNumItems: 10 },
  );
  const reasons: Record<string, string> = {
    sender_mismatch:
      "Send from your confirmed account email, or reply in your inbox.",
    sender_unverified:
      "The sending email could not be authenticated. Reply in your inbox.",
    expired_binding:
      "This reply address expired or was disconnected. Use a recent notification or your inbox.",
    automated_email: "Automatic responses are not added to conversations.",
    attachments_only:
      "Attachments are not imported. Send a text reply or share a document in your stay workspace.",
    empty_reply: "No new reply text was found above the quoted notification.",
    message_too_long:
      "Send up to 2,000 characters of new reply text, or reply in your inbox.",
    blocked: "Messaging is unavailable between these accounts.",
    conversation_unavailable: "The original conversation is unavailable.",
  };
  return (
    <div className="space-y-2 pt-3">
      <h3 className="text-sm font-semibold">Email reply activity</h3>
      {status === "LoadingFirstPage" ? (
        <p role="status" className="text-sm">
          Loading reply activity…
        </p>
      ) : results.length === 0 ? (
        <p className="text-xs text-gray-500">
          No email replies are recorded for your account. Replies without a
          recognized private reply address cannot appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {results.map((row) => (
            <li key={row.id} className="text-sm border rounded-lg p-3">
              <p>
                {row.state === "accepted"
                  ? "Added to conversation"
                  : row.state === "rejected"
                    ? "Reply was not added"
                    : "Processing reply"}{" "}
                · {new Date(row.createdAt).toLocaleString()}
              </p>
              {row.reason && (
                <p className="text-xs text-gray-600">
                  {reasons[row.reason] ??
                    "This email could not be imported. Reply in your inbox."}
                </p>
              )}
              {row.attachmentsOmitted && (
                <p className="text-xs text-gray-600">
                  Images and attachments were not included.
                </p>
              )}
              {row.conversationId && (
                <Link
                  className="text-xs underline"
                  href={`/dashboard/messages?conv=${row.conversationId}`}
                >
                  Open conversation
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button type="button" variant="outline" onClick={() => loadMore(10)}>
          More reply activity
        </Button>
      )}
      {status === "LoadingMore" && (
        <p role="status" className="text-xs">
          Loading more…
        </p>
      )}
    </div>
  );
}
