"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarProvider } from "@/lib/calendar/links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const name = (provider: CalendarProvider) =>
  provider === "airbnb" ? "Airbnb" : "Vrbo";
const date = (value: number) => new Date(value).toLocaleString("en-US");

export function CalendarFeeds({ listingId }: { listingId: Id<"listings"> }) {
  const feeds = useQuery(api.calendarFeeds.getByListing, { listingId });
  const link = useMutation(api.calendarFeeds.link),
    refresh = useMutation(api.calendarFeeds.refresh),
    unlink = useMutation(api.calendarFeeds.unlink);
  const [provider, setProvider] = useState<CalendarProvider>("airbnb");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [removeId, setRemoveId] = useState<Id<"calendarFeeds"> | null>(null);
  const removing = feeds?.find((f) => f._id === removeId);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy("link");
    setError("");
    try {
      await link({ listingId, provider, url });
      setUrl("");
      toast.success("Calendar linked. Checking availability…");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to link calendar.");
    } finally {
      setBusy(null);
    }
  }
  async function sync(feedId: Id<"calendarFeeds">) {
    setBusy(feedId);
    try {
      await refresh({ feedId });
      toast.success("Refresh requested");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to refresh calendar.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    if (!removeId) return;
    setBusy(removeId);
    try {
      await unlink({ feedId: removeId });
      setRemoveId(null);
      toast.success("Calendar unlinked");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to unlink calendar.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Linked calendars</CardTitle>
        <p className="text-sm text-slate-600">
          Link one Airbnb and one Vrbo calendar to keep external reservations
          reflected in your availability.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {feeds === undefined ? (
          <p role="status">Loading calendar links…</p>
        ) : feeds.length === 0 ? (
          <p className="text-sm text-slate-600">
            No calendars linked yet. Manual blocks continue to work.
          </p>
        ) : (
          feeds.map((feed) => (
            <div
              className="rounded-lg border border-slate-200 p-4 space-y-2"
              key={feed._id}
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-medium">{name(feed.provider)}</h3>
                <Badge
                  variant={
                    feed.status === "error" ? "destructive" : "secondary"
                  }
                >
                  {feed.status === "syncing"
                    ? "Refreshing…"
                    : feed.status === "synced"
                      ? "Synced"
                      : "Needs attention"}
                </Badge>
              </div>
              <p className="text-sm text-slate-600">
                {feed.lastSyncedAt
                  ? `Last successful sync: ${date(feed.lastSyncedAt)} · ${feed.importedBlocks} occupied periods`
                  : "No dates have been imported yet."}
              </p>
              {feed.error && (
                <p className="text-sm text-red-700" role="alert">
                  {feed.error}{" "}
                  {feed.lastSyncedAt
                    ? "Previously imported dates are still blocked."
                    : "Availability is not yet confirmed. Check the link or unlink this calendar."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => sync(feed._id)}
                >
                  Refresh now
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    setProvider(feed.provider);
                    setUrl("");
                    document.getElementById("calendar-export-url")?.focus();
                  }}
                >
                  Replace link
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => setRemoveId(feed._id)}
                >
                  Unlink
                </Button>
              </div>
            </div>
          ))
        )}
        <form
          onSubmit={save}
          className="space-y-3 border-t border-slate-200 pt-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="calendar-provider">Calendar provider</Label>
            <select
              id="calendar-provider"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value as CalendarProvider)}
            >
              <option value="airbnb">Airbnb</option>
              <option value="vrbo">Vrbo</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calendar-export-url">
              Private calendar export URL
            </Label>
            <Input
              id="calendar-export-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={4096}
              placeholder="https://…/calendar.ics"
              autoComplete="off"
              required
            />
            <p className="text-xs text-slate-600">
              Copy the calendar export link from your provider’s calendar
              settings. This link stays private. Property page URLs and generic
              iCal services are not supported.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy !== null || !url.trim()}>
            {busy === "link"
              ? "Linking…"
              : feeds?.some((f) => f.provider === provider)
                ? `Replace ${name(provider)} link`
                : `Link ${name(provider)} calendar`}
          </Button>
          <p className="text-xs text-slate-600">
            Automatic refreshes are checked hourly. We import the next two years
            of availability. Imported periods are updated from their source; use
            manual blocks for other dates.
          </p>
        </form>
        <Dialog
          open={removeId !== null}
          onOpenChange={(open) => {
            if (!open && busy === null) setRemoveId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Unlink {removing ? name(removing.provider) : "this"} calendar?
              </DialogTitle>
              <DialogDescription>
                Dates imported from this calendar will be removed. Manual blocks
                and the other linked calendar will remain. Check your bookings
                before making those dates available.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => setRemoveId(null)}
              >
                Keep calendar
              </Button>
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={remove}
              >
                {busy !== null ? "Unlinking…" : "Unlink calendar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
