"use client";
import { use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  useConvexAuth,
  useQuery,
  useMutation,
  usePaginatedQuery,
} from "convex/react";
import { RentalSteps } from "@/components/rental-steps";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
const date = (n: number) =>
  new Date(n).toLocaleDateString("en-US", { timeZone: "UTC" });
type Booking = FunctionReturnType<typeof api.bookings.get>;
function ChangeForm({ booking, owner }: { booking: Booking; owner: boolean }) {
  const [kind, setKind] = useState<"dates" | "cancel">("dates"),
    [start, setStart] = useState(iso(booking.inquiry.moveIn)),
    [end, setEnd] = useState(iso(booking.inquiry.moveOut)),
    [reason, setReason] = useState(""),
    [agreed, setAgreed] = useState(false),
    [busy, setBusy] = useState(false),
    reference = useRef<string | null>(null);
  const propose = useMutation(api.bookings.propose),
    record = useMutation(api.bookings.recordAgreed);
  function changed() {
    reference.current = null;
  }
  async function submit() {
    setBusy(true);
    try {
      reference.current ??= crypto.randomUUID();
      const args = {
        inquiryId: booking.inquiry._id,
        kind,
        reason,
        expectedRevision: booking.revision,
        clientRequestId: reference.current,
        ...(kind === "dates"
          ? { moveIn: Date.parse(start), moveOut: Date.parse(end) }
          : {}),
      };
      if (agreed && owner) await record({ ...args, agreementConfirmed: true });
      else await propose(args);
      reference.current = null;
      setReason("");
      setAgreed(false);
      toast.success(
        agreed
          ? "Agreed change recorded"
          : "Change request saved; current dates remain reserved until accepted",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save change.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Change or cancel this stay</h2>
      <p className="text-sm text-slate-600">
        Discuss availability, updated rent and cancellation terms with your stay
        partner. Recording a change updates this calendar only. Lease
        obligations, deposits and refunds are handled directly between you.
      </p>
      <Label htmlFor="change-kind">Request type</Label>
      <select
        id="change-kind"
        className="block rounded-md border p-2"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as "dates" | "cancel");
          changed();
        }}
      >
        <option value="dates">Adjust or extend dates</option>
        <option value="cancel">Cancel stay</option>
      </select>
      {kind === "dates" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            Move-in
            <Input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                changed();
              }}
            />
          </label>
          <label className="space-y-1">
            Checkout (available again)
            <Input
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                changed();
              }}
            />
          </label>
        </div>
      )}
      <label className="block space-y-1">
        Reason and agreed terms
        <Textarea
          value={reason}
          minLength={10}
          maxLength={2000}
          onChange={(e) => {
            setReason(e.target.value);
            changed();
          }}
          placeholder="Explain the request or summarize what you agreed. Keep documents and payment details out of this form."
        />
      </label>
      {owner && (
        <label className="flex gap-2 items-start">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              changed();
            }}
          />
          The traveler and I have already agreed this change. Record it now and
          notify them.
        </label>
      )}
      {kind === "cancel" && (
        <p className="text-sm">
          A cancellation request keeps dates reserved until accepted. An agreed
          cancellation releases future dates; elapsed days remain in the
          calendar history.
        </p>
      )}
      <Button
        disabled={
          busy ||
          reason.trim().length < 10 ||
          (!!booking.inquiry.pendingBookingChangeId && !agreed) ||
          (booking.inquiry.moveOut <= Date.now() && !agreed) ||
          (booking.cannotMessage && !agreed)
        }
        onClick={submit}
      >
        {agreed ? "Record agreed change" : "Send change request"}
      </Button>
      {booking.inquiry.moveOut <= Date.now() && (
        <p className="text-sm">
          This stay has ended. The owner can record an agreed correction to its
          dates or cancellation history.
        </p>
      )}
      {booking.inquiry.pendingBookingChangeId && (
        <p role="status" className="text-sm">
          {agreed
            ? "Recording the agreed change will supersede the current request."
            : "Resolve or withdraw the current request before proposing another change."}
        </p>
      )}
    </section>
  );
}
export default function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    inquiryId = id as Id<"bookingInquiries">,
    { isAuthenticated } = useConvexAuth(),
    { userId } = useAuth(),
    router = useRouter();
  const booking = useQuery(
      api.bookings.get,
      isAuthenticated ? { id: inquiryId } : "skip",
    ),
    me = useQuery(
      api.users.getByClerkId,
      isAuthenticated && userId ? { clerkId: userId } : "skip",
    );
  const changes = usePaginatedQuery(
      api.bookings.changes,
      booking ? { id: inquiryId } : "skip",
      { initialNumItems: 10 },
    ),
    events = usePaginatedQuery(
      api.bookings.events,
      booking ? { id: inquiryId } : "skip",
      { initialNumItems: 10 },
    );
  const decide = useMutation(api.bookings.decide),
    repair = useMutation(api.bookings.repairCalendar),
    send = useMutation(api.bookings.message),
    retry = useMutation(api.bookings.retryNotice);
  const [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [message, setMessage] = useState(""),
    messageRef = useRef<string | null>(null);
  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update booking.");
    } finally {
      setBusy(false);
    }
  }
  if (!booking || !me)
    return (
      <p role="status" className="p-6">
        Loading private booking…
      </p>
    );
  const i = booking.inquiry,
    owner = me._id === i.landlordId,
    active = i.status === "accepted";
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5">
      <Link className="underline" href="/dashboard/inquiries">
        Back to inquiries
      </Link>
      <h1 className="text-2xl font-bold">{booking.title}</h1>
      <p>
        {booking.unitName} · {booking.otherName}
      </p>
      <Card>
        <CardContent className="p-5 space-y-2">
          <p className="font-semibold">
            {i.status === "accepted" ? "Confirmed" : i.status} ·{" "}
            {date(i.moveIn)} – {date(i.moveOut)}
          </p>
          <p>
            {i.occupants} occupants{i.pets ? " · with pets" : ""}
          </p>
          {i.status === "cancelled" && (
            <p className="text-sm">
              Cancellation recorded. Future dates were released from{" "}
              {date(i.cancelledEffectiveEnd ?? i.moveIn)}. The dates above
              preserve the original agreed period.
            </p>
          )}
          <p className="text-sm whitespace-pre-wrap">{i.message}</p>
          <p className="text-sm text-slate-600">
            Confirmation reserves the calendar. Agree on the lease, rent,
            deposits and cancellation policy directly with your stay partner.
          </p>
        </CardContent>
      </Card>
      <RentalSteps
        inquiryId={inquiryId}
        owner={owner}
        canRequest={["pending", "accepted"].includes(i.status)}
      />
      {active && (owner || i.moveOut > Date.now()) && (
        <Card>
          <CardContent className="p-5">
            <ChangeForm
              key={booking.revision}
              booking={booking}
              owner={owner}
            />
          </CardContent>
        </Card>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">Change requests</h2>
        {changes.results.length === 0 && (
          <p className="text-sm">No change requests.</p>
        )}
        {changes.results.map((change) => (
          <Card key={change._id}>
            <CardContent className="p-4 space-y-2">
              <p className="font-medium">
                {change.kind === "cancel"
                  ? "Cancellation"
                  : `${date(change.moveIn!)} – ${date(change.moveOut!)}`}{" "}
                · {change.status}
              </p>
              <p className="text-sm whitespace-pre-wrap">{change.reason}</p>
              <p className="text-xs text-slate-500">
                {change.agreementRecorded
                  ? "Owner recorded agreed change"
                  : `Requested by ${change.proposerId === me._id ? "you" : booking.otherName}`}{" "}
                · {new Date(change.createdAt).toLocaleString()}
              </p>
              {change.status === "pending" &&
                i.pendingBookingChangeId === change._id && (
                  <div className="flex gap-2">
                    {change.proposerId === me._id ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              decide({ id: change._id, decision: "withdrawn" }),
                            "Request withdrawn",
                          )
                        }
                      >
                        Withdraw request
                      </Button>
                    ) : (
                      <>
                        <Button
                          disabled={busy || booking.cannotMessage}
                          onClick={() =>
                            run(
                              () =>
                                decide({
                                  id: change._id,
                                  decision: "accepted",
                                }),
                              "Change accepted and calendar updated",
                            )
                          }
                        >
                          Accept change
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                decide({
                                  id: change._id,
                                  decision: "declined",
                                }),
                              "Request declined; dates unchanged",
                            )
                          }
                        >
                          Decline
                        </Button>
                      </>
                    )}
                  </div>
                )}
            </CardContent>
          </Card>
        ))}
        {changes.status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => changes.loadMore(10)}>
            More requests
          </Button>
        )}
      </section>
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold">Discuss this stay</h2>
          <p className="text-sm text-slate-600">
            Send a private message to your stay partner. Use the change controls
            above to update the calendar.
          </p>
          <label className="block">
            Message
            <Textarea
              maxLength={2000}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                messageRef.current = null;
              }}
            />
          </label>
          <Button
            disabled={busy || !message.trim() || booking.cannotMessage}
            onClick={() =>
              run(async () => {
                messageRef.current ??= crypto.randomUUID();
                const conv = await send({
                  id: inquiryId,
                  content: message,
                  clientRequestId: messageRef.current,
                });
                setMessage("");
                messageRef.current = null;
                router.push(`/dashboard/messages?conv=${conv}`);
              }, "Message sent")
            }
          >
            Send message
          </Button>
          {booking.cannotMessage && (
            <p className="text-sm">
              Messaging is unavailable between these accounts. The owner can
              still record agreed calendar changes; contact support if you
              cannot resolve the arrangement.
            </p>
          )}
        </CardContent>
      </Card>
      {owner && active && (
        <details className="rounded-xl border p-4">
          <summary className="font-semibold cursor-pointer">
            Repair an older booking calendar entry
          </summary>
          <p className="my-3 text-sm">
            Use this if a confirmed booking’s calendar entry is missing or needs
            its legacy linkage restored. Conflicting dates require review first.
          </p>
          <label className="block">
            Repair note
            <Textarea
              minLength={10}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button
            className="mt-3"
            disabled={busy || note.trim().length < 10}
            onClick={() =>
              run(
                () =>
                  repair({
                    id: inquiryId,
                    expectedRevision: booking.revision,
                    note,
                  }),
                "Calendar checked and repaired",
              )
            }
          >
            Repair booking calendar
          </Button>
        </details>
      )}
      {booking.canReview && (
        <Button asChild variant="outline">
          <Link href={`/dashboard/reviews?inquiry=${i._id}`}>
            Review this stay
          </Link>
        </Button>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">Private booking history</h2>
        {events.results.map((event) => (
          <article key={event._id} className="rounded-xl border p-4 space-y-1">
            <p className="font-medium">
              {event.action.replaceAll("_", " ")} ·{" "}
              {new Date(event.createdAt).toLocaleString()}
            </p>
            <p className="text-sm">
              {date(event.beforeMoveIn)} – {date(event.beforeMoveOut)}
              {(event.afterMoveIn !== event.beforeMoveIn ||
                event.afterMoveOut !== event.beforeMoveOut) &&
                ` → ${date(event.afterMoveIn)} – ${date(event.afterMoveOut)}`}
            </p>
            <p className="text-sm whitespace-pre-wrap">{event.reason}</p>
            <p className="text-xs text-slate-500">
              Email:{" "}
              {event.emailStatus === "sent"
                ? "provider accepted"
                : event.emailStatus}
            </p>
            {event.recipientId === me._id &&
              ["failed", "unconfigured", "pending"].includes(
                event.emailStatus,
              ) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => retry({ id: event._id }),
                      "Notification retry queued",
                    )
                  }
                >
                  Retry my notification
                </Button>
              )}
          </article>
        ))}
        {!events.results.length && (
          <p className="text-sm">
            This older booking has no recorded changes yet.
          </p>
        )}
        {events.status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => events.loadMore(10)}>
            More history
          </Button>
        )}
      </section>
    </main>
  );
}
