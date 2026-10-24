"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import { DAY } from "@/lib/stays";
import { Home, MessageSquare } from "lucide-react";

type InboxItem = FunctionReturnType<
  typeof api.housingRequests.inbox
>["page"][number];
const date = (value: number) =>
  new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });

function RequestCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const { request: r } = item;
  const [expanded, setExpanded] = useState(false);
  const [listingId, setListingId] = useState<Id<"listings"> | "">("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const markRead = useMutation(api.housingRequests.markRead);
  const reply = useMutation(api.housingRequests.reply);
  const {
    results: properties,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.housingRequests.matchingProperties,
    expanded ? { requestId: r._id } : "skip",
    { initialNumItems: 20 },
  );
  const chosen =
    properties.find((p) => p.listingId === listingId) ?? properties[0];
  const active =
    r.status === "open" && r.moveInDate >= Math.floor(Date.now() / DAY) * DAY;
  async function expand() {
    setExpanded(!expanded);
    if (!item.read)
      try {
        await markRead({ deliveryId: item.deliveryId });
      } catch {
        /* Reply remains authorized independently. */
      }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      const id = await reply({
        requestId: r._id,
        listingId: chosen.listingId,
        message,
      });
      router.push(`/dashboard/messages?conv=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send your reply.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">
                {r.city}, {r.state}
              </h2>
              <Badge variant={active ? "default" : "secondary"}>
                {active
                  ? "Open"
                  : r.status === "open"
                    ? "Dates passed"
                    : r.status}
              </Badge>
              {!item.read && <Badge variant="outline">New</Badge>}
            </div>
            <p className="text-sm text-slate-600">
              {item.name}
              {r.travelerName ? ` · ${r.travelerName}` : ""}
            </p>
          </div>
          <p className="text-sm font-medium">
            Up to {formatPrice(r.maxBudget)}/mo
          </p>
        </div>
        <p className="text-sm text-slate-700">
          {date(r.moveInDate)} –{" "}
          {date(r.moveOutDate ?? r.moveInDate + r.duration * 30 * DAY)} ·{" "}
          {r.bedrooms}+ bedrooms
          {r.occupants ? ` · ${r.occupants} occupants` : ""}
          {r.petFriendly ? " · Traveling with pets" : ""}
        </p>
        {r.workplace && (
          <p className="text-sm text-slate-600">Workplace: {r.workplace}</p>
        )}
        {r.description && (
          <p className="whitespace-pre-wrap text-sm text-slate-600">
            {r.description}
          </p>
        )}
        {item.phone && (
          <p className="text-sm">
            Traveler shared their phone:{" "}
            <a className="underline" href={`tel:${item.phone}`}>
              {item.phone}
            </a>
          </p>
        )}
        <Button type="button" variant="outline" onClick={expand}>
          {expanded ? "Hide properties" : "View my matching properties"}
        </Button>
        {expanded && (
          <div className="space-y-4 border-t pt-4">
            {status === "LoadingFirstPage" ? (
              <p role="status">Checking current availability…</p>
            ) : properties.length === 0 ? (
              <p className="text-sm text-slate-600">
                None of your properties currently match these requirements and
                dates. Availability may have changed since this request arrived.
              </p>
            ) : (
              <>
                <Label htmlFor={`property-${r._id}`}>
                  Respond with a property
                </Label>
                <select
                  id={`property-${r._id}`}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={chosen?.listingId ?? ""}
                  onChange={(e) =>
                    setListingId(e.target.value as Id<"listings">)
                  }
                >
                  {properties.map((p) => (
                    <option key={p.listingId} value={p.listingId}>
                      {p.title} · {formatPrice(p.price)}/mo
                    </option>
                  ))}
                </select>
                {chosen && (
                  <Link
                    className="text-sm underline"
                    href={`/listings/${chosen.listingId}`}
                  >
                    View property details
                  </Link>
                )}
                {chosen?.conversationId ? (
                  <Button asChild>
                    <Link
                      href={`/dashboard/messages?conv=${chosen.conversationId}`}
                    >
                      Continue conversation
                    </Link>
                  </Button>
                ) : (
                  active && (
                    <form onSubmit={send} className="space-y-3">
                      <Label htmlFor={`reply-${r._id}`}>
                        Introduce your property
                      </Label>
                      <Textarea
                        id={`reply-${r._id}`}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={2000}
                        required
                        placeholder="Let the traveler know how your property fits their needs."
                      />
                      {error && (
                        <p className="text-sm text-red-700" role="alert">
                          {error}
                        </p>
                      )}
                      <Button type="submit" disabled={busy || !message.trim()}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        {busy ? "Sending…" : "Send private reply"}
                      </Button>
                    </form>
                  )
                )}
              </>
            )}
            {status === "CanLoadMore" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMore(20)}
              >
                Show more matching properties
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TenantRequestsPage() {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.housingRequests.inbox,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 20 },
  );
  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Tenant Housing Requests
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Requests matched to your properties. Review current availability and
          reply directly to the traveler.
        </p>
      </div>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading matched requests…</p>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center gap-3">
            <Home className="h-12 w-12 text-slate-400" />
            <h2 className="font-medium">No matched requests yet</h2>
            <p className="text-sm text-slate-600">
              Keep your listing details and calendar up to date so travelers
              with suitable requests can find you.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/landlord/listings">
                Manage my listings
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        results.map((item) => <RequestCard key={item.deliveryId} item={item} />)
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Load more requests
        </Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more…</p>}
    </main>
  );
}
