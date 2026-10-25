"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate, formatStayDate } from "@/lib/utils";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);

export function ConversationDetails({
  conversationId,
  listingId,
}: {
  conversationId: Id<"conversations">;
  listingId: Id<"listings">;
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("recipient");
  const data = useQuery(api.threadContext.get, { conversationId });
  const {
    results: inquiries,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.threadContext.inquiries,
    open && tab === "inquiry" ? { conversationId } : "skip",
    { initialNumItems: 10 },
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-600" aria-live="polite">
          {!data
            ? "Loading conversation context…"
            : data.termsAtStart
              ? data.termsAtStart.monthlyRateCents !== null
                ? `Listed at conversation start: ${money(data.termsAtStart.monthlyRateCents)}/month`
                : "Starting monthly rate unavailable"
              : "Starting monthly rate was not recorded for this conversation"}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={`details-${conversationId}`}
        >
          {open ? "Hide details" : "Conversation details"}
        </Button>
      </div>
      {open && (
        <div
          id={`details-${conversationId}`}
          className="max-h-[45vh] overflow-y-auto rounded-lg border p-3 text-sm space-y-3"
        >
          {!data ? (
            <p role="status">Loading details…</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {data.termsAtStart
                  ? "Conversation started"
                  : "Conversation record created"}{" "}
                {formatDate(data.startedAt)}. The starting rate is a historical
                listing reference.
              </p>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="recipient">Recipient</TabsTrigger>
                  <TabsTrigger value="property">Property</TabsTrigger>
                  <TabsTrigger value="inquiry">Inquiries</TabsTrigger>
                </TabsList>
                <TabsContent value="recipient" className="space-y-2">
                  {!data.recipient ? (
                    <p>This account is unavailable.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        {data.recipient.image && (
                          <img
                            src={data.recipient.image}
                            alt=""
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        )}
                        <p className="font-semibold">{data.recipient.name}</p>
                      </div>
                      {(data.recipient.city || data.recipient.state) && (
                        <p>
                          {[data.recipient.city, data.recipient.state]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      {(data.recipient.occupation ||
                        data.recipient.company) && (
                        <p>
                          {[data.recipient.occupation, data.recipient.company]
                            .filter(Boolean)
                            .join(" · ")}{" "}
                          <span className="text-xs text-slate-500">
                            (self-reported)
                          </span>
                        </p>
                      )}
                      {data.recipient.bio && (
                        <p className="whitespace-pre-wrap break-words">
                          {data.recipient.bio}
                        </p>
                      )}
                      {data.recipient.profilePath && (
                        <Link
                          className="underline"
                          href={data.recipient.profilePath}
                        >
                          View profile and reviews
                        </Link>
                      )}
                    </>
                  )}
                </TabsContent>
                <TabsContent value="property" className="space-y-2">
                  <p className="font-semibold">{data.property.title}</p>
                  <p>
                    {[data.property.city, data.property.state]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {data.termsAtStart && (
                    <p className="text-xs text-slate-600">
                      Recorded at start: {data.termsAtStart.title},{" "}
                      {[data.termsAtStart.city, data.termsAtStart.state]
                        .filter(Boolean)
                        .join(", ")}
                      .{" "}
                      {data.termsAtStart.monthlyRateCents !== null
                        ? `${money(data.termsAtStart.monthlyRateCents)}/month.`
                        : "Rate unavailable."}
                    </p>
                  )}
                  {data.property.currentMonthlyRateCents !== null && (
                    <p>
                      Current listed rate:{" "}
                      {money(data.property.currentMonthlyRateCents)}/month
                    </p>
                  )}
                  {data.property.minStayMonths !== null && (
                    <p>
                      Current minimum stay: {data.property.minStayMonths}{" "}
                      {data.property.minStayMonths === 1 ? "month" : "months"}
                    </p>
                  )}
                  {data.property.utilitiesIncluded !== null && (
                    <p>
                      Utilities{" "}
                      {data.property.utilitiesIncluded
                        ? "included"
                        : "not included"}{" "}
                      in the current listing
                    </p>
                  )}
                  {data.property.canOpen ? (
                    <Link className="underline" href={`/listings/${listingId}`}>
                      View property
                    </Link>
                  ) : (
                    <p className="text-slate-500">
                      Current property details are unavailable. Any recorded
                      starting terms remain above.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="inquiry" className="space-y-3">
                  {status === "LoadingFirstPage" ? (
                    <p role="status">Loading inquiries…</p>
                  ) : (
                    <>
                      {!inquiries.length && (
                        <p>
                          {status === "Exhausted"
                            ? "No dated booking inquiry is associated with this discussion. Housing-request leads and ordinary messages do not create one."
                            : "No inquiries loaded yet. More records may be available."}
                        </p>
                      )}
                      {inquiries.map((inquiry) => (
                        <article
                          key={inquiry.id}
                          className="rounded-lg border p-3 space-y-2"
                        >
                          <div className="flex justify-between gap-3">
                            <p className="font-semibold">Booking inquiry</p>
                            <p className="capitalize">{inquiry.status}</p>
                          </div>
                          <p>
                            Current dates: {formatStayDate(inquiry.moveIn)} –{" "}
                            {formatStayDate(inquiry.moveOut)} (checkout)
                          </p>
                          <p>
                            {inquiry.occupants}{" "}
                            {inquiry.occupants === 1 ? "traveler" : "travelers"}{" "}
                            ·{" "}
                            {inquiry.pets
                              ? "Pets requested"
                              : "No pets requested"}
                          </p>
                          {inquiry.originalRequest ? (
                            <div className="text-xs text-slate-600">
                              <p>
                                Originally requested:{" "}
                                {formatStayDate(inquiry.originalRequest.moveIn)}{" "}
                                –{" "}
                                {formatStayDate(
                                  inquiry.originalRequest.moveOut,
                                )}{" "}
                                (checkout), {inquiry.originalRequest.occupants}{" "}
                                {inquiry.originalRequest.occupants === 1
                                  ? "traveler"
                                  : "travelers"}
                                {inquiry.originalRequest.pets
                                  ? ", with pets"
                                  : ", no pets"}
                                .
                              </p>
                              <p className="whitespace-pre-wrap break-words">
                                Initial note: {inquiry.originalRequest.message}
                              </p>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-slate-500">
                                The original request snapshot was not recorded
                                for this older inquiry.
                              </p>
                              <p className="whitespace-pre-wrap break-words">
                                Saved note: {inquiry.initialNote}
                              </p>
                            </>
                          )}
                          {!inquiry.explicitlyLinked && (
                            <p className="text-xs text-slate-500">
                              Older inquiry matched by property and
                              participants.
                            </p>
                          )}
                          <Link
                            href={`/dashboard/inquiries/${inquiry.id}`}
                            className="underline"
                          >
                            Manage inquiry and rental setup
                          </Link>
                        </article>
                      ))}
                      {status === "CanLoadMore" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => loadMore(10)}
                        >
                          More inquiries
                        </Button>
                      )}
                      {status === "LoadingMore" && (
                        <p role="status">Loading more inquiries…</p>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      )}
    </div>
  );
}
