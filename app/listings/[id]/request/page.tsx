"use client";
import { Suspense, use, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Bed,
  Bathtub,
  Users,
  ShieldCheck,
  CaretLeft,
} from "@phosphor-icons/react";
import {
  SuccessCheck,
  MotionText,
} from "@/components/public-experience/motion";
import { Modal } from "@/components/ui-system/primitives";
import { DateRangeCalendar } from "@/components/public-experience/search-pill";
import { usePublicAuth } from "@/components/public-experience/auth-context";
import { parseDate } from "@/lib/search";
import { DAY, validateStay } from "@/lib/stays";
import { formatPrice } from "@/lib/utils";

export default function StayRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <main className="w-request-loading" role="status">
          Opening your stay request…
        </main>
      }
    >
      <StayRequest key={id} id={id} />
    </Suspense>
  );
}
function StayRequest({ id }: { id: string }) {
  const params = useSearchParams(),
    { user, isLoaded } = useUser(),
    { isAuthenticated } = useConvexAuth(),
    openAuth = usePublicAuth();
  const listing = useQuery(api.listings.getById, { id: id as Id<"listings"> });
  const me = useQuery(
    api.users.getByClerkId,
    user && isAuthenticated ? { clerkId: user.id } : "skip",
  );
  const create = useMutation(api.inquiries.create);
  const initial = (key: string) => {
    const text = params.get(key) ?? "";
    try {
      parseDate(text);
      return text;
    } catch {
      return "";
    }
  };
  const [moveIn, setMoveIn] = useState(() => initial("moveIn")),
    [moveOut, setMoveOut] = useState(() => initial("moveOut"));
  const [occupants, setOccupants] = useState(() =>
    Math.max(1, Math.min(30, Number(params.get("occupants")) || 1)),
  );
  const [pets, setPets] = useState(false),
    [message, setMessage] = useState("");
  const [step, setStep] = useState(0),
    [edit, setEdit] = useState<"dates" | "guests" | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [sent, setSent] = useState<Id<"bookingInquiries"> | null>(null);
  const inFlight = useRef(false),
    reference = useRef<{ payload: string; id: string } | null>(null);
  const dateLabel = (value: string) =>
    value
      ? new Date(value + "T12:00:00Z").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : "Choose dates";
  function fields() {
    if (!listing) throw Error("This rental is unavailable.");
    const start = parseDate(moveIn),
      end = parseDate(moveOut);
    validateStay(start, end, Math.max(1, listing.minStay) * 30);
    if (start < Math.floor(Date.now() / DAY) * DAY)
      throw Error("Move in cannot be in the past.");
    if (start < listing.availableFrom)
      throw Error(
        `This rental is available from ${dateLabel(new Date(listing.availableFrom).toISOString().slice(0, 10))}.`,
      );
    if (
      !Number.isInteger(occupants) ||
      occupants < 1 ||
      occupants > Math.min(30, listing.maxOccupancy ?? 30)
    )
      throw Error("Review the number of guests for this rental.");
    return {
      listingId: listing._id,
      moveIn: start,
      moveOut: end,
      occupants,
      pets,
      message: message.trim(),
    };
  }
  function continueRequest() {
    try {
      fields();
      setError("");
      if (!user) {
        const query = new URLSearchParams({
          moveIn,
          moveOut,
          occupants: String(occupants),
        });
        openAuth(`/listings/${id}/request?${query}`);
        return;
      }
      if (me === null) return;
      if (me?.role !== "tenant") {
        setError("A traveler account is required to send a stay request.");
        return;
      }
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review your stay details.");
      if (!moveIn || !moveOut) setEdit("dates");
    }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !me || me.role !== "tenant") return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const request = fields();
      if (!request.message)
        throw Error("Introduce yourself to the property owner before sending.");
      const payload = JSON.stringify(request);
      if (reference.current?.payload !== payload)
        reference.current = { payload, id: crypto.randomUUID() };
      const result = await create({
        ...request,
        clientRequestId: reference.current.id,
      });
      setSent(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to send your request. Your message remains here so you can try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (listing === undefined)
    return (
      <main className="w-request-loading" role="status">
        Opening your stay request…
      </main>
    );
  if (!listing || !listing.isPublic)
    return (
      <main className="w-request-loading">
        <h1>This rental is unavailable</h1>
        <p>Return to search to find current monthly rentals.</p>
        <Link className="w-property-black" href="/search">
          Browse properties
        </Link>
      </main>
    );
  if (sent)
    return (
      <main className="w-request-success">
        <SuccessCheck label="Stay request sent" />
        <h1>Your request is with the owner.</h1>
        <p>
          The owner can review your proposed dates and reply. This request does
          not charge you, sign a lease or confirm a stay.
        </p>
        <Link
          className="w-property-black"
          href={`/dashboard/inquiries/${sent}`}
        >
          View stay request
        </Link>
        <Link href={`/listings/${id}`}>Back to property</Link>
      </main>
    );
  return (
    <main className="w-request-page">
      <Link className="w-request-back" href={`/listings/${id}`}>
        <CaretLeft size={18} />
        Back to property
      </Link>
      <div className="w-request-columns">
        <div className="w-request-main">
          <h1>
            {step === 0
              ? "Review your stay request"
              : "Introduce yourself to the owner"}
          </h1>
          {step === 0 ? (
            <>
              <section className="w-request-option">
                <span className="w-request-radio" />
                <div>
                  <h2>Request owner approval</h2>
                  <p>
                    {Math.max(1, listing.minStay) * 30} day minimum. Your
                    proposed dates are sent to the owner for review.
                  </p>
                </div>
              </section>
              <section className="w-request-editable-summary">
                <div>
                  <h2>Your stay</h2>
                  <p>
                    {dateLabel(moveIn)} {moveOut && `to ${dateLabel(moveOut)}`}
                  </p>
                </div>
                <button
                  className="w-property-pill"
                  onClick={() => setEdit("dates")}
                >
                  Change dates
                </button>
                <div>
                  <h2>Guests</h2>
                  <p>
                    {occupants} {occupants === 1 ? "guest" : "guests"}
                  </p>
                </div>
                <button
                  className="w-property-pill"
                  onClick={() => setEdit("guests")}
                >
                  Change guests
                </button>
              </section>
              {user && me === null ? (
                <div className="w-request-account-notice">
                  <p>
                    Complete your traveler profile before sending a request.
                  </p>
                  <Link className="w-property-black" href="/onboarding">
                    Complete profile
                  </Link>
                </div>
              ) : (
                <button
                  className="w-request-next"
                  disabled={!isLoaded || (!!user && me === undefined)}
                  onClick={continueRequest}
                >
                  Next
                </button>
              )}
              <p className="w-request-charge-note">You won’t be charged.</p>
            </>
          ) : (
            <form onSubmit={send} className="w-request-form">
              <div className="w-request-person">
                <span>{(me?.displayName ?? me?.name ?? "T").slice(0, 1)}</span>
                <div>
                  <strong>{me?.displayName ?? me?.name}</strong>
                  <p>{me?.email}</p>
                </div>
              </div>
              <label htmlFor="stay-introduction">
                Message to the property owner
                <textarea
                  id="stay-introduction"
                  required
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell the owner about your trip, who is staying and anything you would like to ask."
                />
                <small>{message.length}/2,000</small>
              </label>
              {listing.petFriendly && (
                <label className="w-request-pets">
                  <input
                    type="checkbox"
                    checked={pets}
                    onChange={(e) => setPets(e.target.checked)}
                  />
                  <span>I am traveling with pets</span>
                </label>
              )}
              <div className="w-request-consent-note">
                <ShieldCheck size={22} />
                <p>
                  The owner reviews your request before accepting it. Agree on
                  the lease, rent and deposits directly before moving in.
                </p>
              </div>
              <button className="w-request-send" type="submit" disabled={busy}>
                <MotionText
                  text={busy ? "Sending request…" : "Send stay request"}
                />
              </button>
              <button
                type="button"
                className="w-request-edit-back"
                disabled={busy}
                onClick={() => setStep(0)}
              >
                Back to stay details
              </button>
            </form>
          )}
          {error && (
            <p className="w-property-form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className="w-request-aside">
          <section className="w-request-trip-card">
            <h2>Stay details</h2>
            <div className="w-request-property">
              {listing.photos[0] ? (
                <img src={listing.photos[0]} alt={listing.title} />
              ) : (
                <div className="w-request-photo-empty" />
              )}
              <div>
                <Link href={`/listings/${id}`}>{listing.title}</Link>
                <div className="w-request-property-facts">
                  <span>
                    <Bed size={16} />
                    {listing.bedrooms}
                  </span>
                  <span>
                    <Users size={16} />
                    {listing.maxOccupancy ?? occupants}
                  </span>
                  <span>
                    <Bathtub size={16} />
                    {listing.bathrooms}
                  </span>
                </div>
              </div>
            </div>
            <div className="w-request-trip-row">
              <span>
                {moveIn && moveOut
                  ? `${dateLabel(moveIn)} to ${dateLabel(moveOut)}`
                  : "Choose your stay dates"}
              </span>
              <button
                className="w-property-pill"
                onClick={() => setEdit("dates")}
              >
                Change
              </button>
            </div>
            <div className="w-request-trip-row">
              <span>
                {occupants} {occupants === 1 ? "guest" : "guests"}
              </span>
              <button
                className="w-property-pill"
                onClick={() => setEdit("guests")}
              >
                Change
              </button>
            </div>
            <div className="w-request-rent-row">
              <span>Monthly rent</span>
              <strong>{formatPrice(listing.price)}</strong>
            </div>
            {listing.details?.fees.map((fee, i) => (
              <div key={i} className="w-request-fee-row">
                <span>
                  {fee.name}
                  <small>
                    {fee.frequency === "monthly" ? "Monthly" : "One time"}
                    {fee.refundable ? " · Refundable under rental terms" : ""}
                  </small>
                </span>
                <span>{formatPrice(fee.amount)}</span>
              </div>
            ))}
            <p className="w-request-price-note">
              Rent and any additional charges are agreed directly with the
              owner. No payment is collected with this request.
            </p>
          </section>
          <section className="w-request-policy-card">
            <h2>
              <ShieldCheck size={22} />
              Owner approval
            </h2>
            <p>
              Availability is checked when your request is sent and again when
              the owner accepts. Dates are not reserved while a request is
              pending.
            </p>
            <Link href="/terms">Read rental terms</Link>
          </section>
        </aside>
      </div>
      <Modal
        open={edit !== null}
        onOpenChange={(open) => {
          if (!open) setEdit(null);
        }}
        title={edit === "dates" ? "Choose your stay dates" : "Guests"}
        className="w-property-date-dialog"
      >
        {edit === "dates" ? (
          <>
            <DateRangeCalendar
              start={moveIn}
              end={moveOut}
              onChange={(a, b) => {
                setMoveIn(a);
                setMoveOut(b);
                setError("");
              }}
            />
            <div className="w-property-date-footer">
              <span>{Math.max(1, listing.minStay) * 30} day minimum stay</span>
              <button
                className="w-property-black"
                onClick={() => setEdit(null)}
              >
                Save dates
              </button>
            </div>
          </>
        ) : (
          <div className="w-request-guests-edit">
            <label htmlFor="request-guests">Number of guests</label>
            <input
              id="request-guests"
              type="number"
              min={1}
              max={Math.min(30, listing.maxOccupancy ?? 30)}
              value={occupants}
              onChange={(e) => setOccupants(Number(e.target.value))}
            />
            <button className="w-property-black" onClick={() => setEdit(null)}>
              Save guests
            </button>
          </div>
        )}
      </Modal>
    </main>
  );
}
