"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FunctionArgs } from "convex/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { AMENITIES, PROPERTY_TYPES, formatPrice } from "@/lib/utils";
import { STATES, getCitiesByState } from "@/lib/cities";
import { US_STATES } from "@/lib/locations";
import { DAY, validateStay } from "@/lib/stays";
import { prepareCriteria } from "@/lib/housing";
import { CheckCircle, Home, MapPin, Calendar, Plus, X } from "lucide-react";

type Criteria = Omit<
  FunctionArgs<typeof api.housingRequests.preview>,
  "paginationOpts"
>;
type Traveler = {
  name: string;
  moveIn: string;
  moveOut: string;
  workplace: string;
};
const selectStyle =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function MatchPreview({ criteria }: { criteria: Criteria }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.housingRequests.preview,
    criteria,
    { initialNumItems: 50 },
  );
  return (
    <Card>
      <CardContent className="space-y-3 p-5" aria-live="polite">
        <h3 className="font-semibold">Properties matching these dates</h3>
        {status === "LoadingFirstPage" ? (
          <p>Checking properties…</p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {results.length} matching{" "}
              {results.length === 1 ? "property" : "properties"}
              {status === "Exhausted" ? " found." : " found so far."} Your
              request will be checked against every active property when
              submitted.
            </p>
            {results.slice(0, 5).map((p) => (
              <Link
                className="flex justify-between gap-4 text-sm hover:underline"
                key={p.listingId}
                href={`/listings/${p.listingId}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  {p.title} · {p.city}, {p.state}
                </span>
                <span className="shrink-0">{formatPrice(p.price)}/mo</span>
              </Link>
            ))}
            {status === "CanLoadMore" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMore(50)}
              >
                Find more matches
              </Button>
            )}
            {status === "LoadingMore" && <p>Checking more properties…</p>}
            {status === "Exhausted" && results.length === 0 && (
              <p className="text-sm text-slate-600">
                Try adding nearby cities or adjusting your requirements. You can
                still submit a request for properties listed later.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function HousingRequestPage() {
  const { userId } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(
    api.users.getByClerkId,
    userId && isAuthenticated ? { clerkId: userId } : "skip",
  );
  const create = useMutation(api.housingRequests.create);
  const createAgency = useMutation(api.housingRequests.createAgency);
  const [kind, setKind] = useState<"traveler" | "agency">("traveler");
  const [agencyName, setAgencyName] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [nearby, setNearby] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");
  const [budget, setBudget] = useState("");
  const [bedrooms, setBedrooms] = useState("1");
  const [occupants, setOccupants] = useState("1");
  const [type, setType] = useState("");
  const [pets, setPets] = useState(false);
  const [utilities, setUtilities] = useState(false);
  const [parking, setParking] = useState(false);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [allowUnmatched, setAllowUnmatched] = useState(false);
  const [contact, setContact] = useState<"platform" | "phone">("platform");
  const [travelers, setTravelers] = useState<Traveler[]>([
    { name: "", moveIn: "", moveOut: "", workplace: "" },
  ]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [preview, setPreview] = useState<Criteria | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(0);
  const cities = useMemo(() => getCitiesByState(state), [state]);

  function criteriaFor(traveler?: Traveler): Criteria {
    const start = Date.parse(traveler?.moveIn || moveIn),
      end = Date.parse(traveler?.moveOut || moveOut);
    validateStay(start, end);
    if (!city.trim() || !state || !Number(budget))
      throw new Error("Enter a city, state and monthly budget.");
    return prepareCriteria({
      city,
      state,
      moveInDate: start,
      moveOutDate: end,
      duration: Math.ceil((end - start) / (30 * DAY)),
      maxBudget: Number(budget),
      bedrooms: Number(bedrooms),
      occupants: Number(occupants),
      propertyType: type || undefined,
      petFriendly: pets,
      utilitiesIncluded: utilities,
      parkingIncluded: parking,
      amenities,
      nearbyCities: nearby
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      description,
      workplace: traveler?.workplace || workplace,
      contactPreference: contact,
      allowUnmatched,
    });
  }
  function updateTraveler(index: number, key: keyof Traveler, value: string) {
    setTravelers((current) =>
      current.map((t, i) => (i === index ? { ...t, [key]: value } : t)),
    );
    setPreview(null);
  }
  function showPreview() {
    setError("");
    try {
      setPreview(
        criteriaFor(kind === "agency" ? travelers[previewIndex] : undefined),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your request details.");
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!user) {
      setError("Complete your account profile before submitting.");
      return;
    }
    setBusy(true);
    try {
      if (kind === "agency") {
        const criteria = criteriaFor(travelers[0]);
        const ids = await createAgency({
          ...criteria,
          userId: user._id,
          agencyName,
          travelers: travelers.map((t) => ({
            name: t.name,
            moveInDate: Date.parse(t.moveIn || moveIn),
            moveOutDate: Date.parse(t.moveOut || moveOut),
            workplace: t.workplace || workplace,
          })),
        });
        setSubmitted(ids.length);
      } else {
        await create({ ...criteriaFor(), userId: user._id });
        setSubmitted(1);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to submit. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (submitted)
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-lg w-full">
          <CardContent className="flex flex-col items-center text-center gap-5 py-14 px-8">
            <CheckCircle className="h-14 w-14 text-green-600" />
            <h1 className="text-2xl font-bold text-slate-900">
              {submitted === 1
                ? "Request submitted"
                : `${submitted} requests submitted`}
            </h1>
            <p className="text-slate-600">
              We’re checking your requirements against active properties.
              Matching owners will receive your request in their dashboard and
              can reply directly.
            </p>
            <Button asChild>
              <Link href="/dashboard/housing-requests">Track my requests</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/search">Browse rentals</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );

  return (
    <main className="min-h-screen bg-gray-50">
      <Navbar />
      <section className="bg-primary text-white py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm text-blue-100 mb-6">
            <Home className="h-4 w-4" />
            For renters and agencies
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Submit a Housing Request
          </h1>
          <p className="mt-4 text-lg text-blue-200">
            Tell us what you need. Owners with matching properties can come to
            you.
          </p>
        </div>
      </section>
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          {isLoading ? (
            <Card>
              <CardContent className="p-10 text-center">
                Loading your account…
              </CardContent>
            </Card>
          ) : !isAuthenticated ? (
            <Card>
              <CardContent className="space-y-4 p-10 text-center">
                <h2 className="text-xl font-bold">
                  Sign in to submit a request
                </h2>
                <p>Create a free account to connect with property owners.</p>
                <Button asChild>
                  <Link href="/sign-in?redirect_url=%2Fhousing-request">
                    Sign in
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/sign-up?redirect_url=%2Fhousing-request">
                    Create account
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-md">
              <CardContent className="p-6 sm:p-8">
                <form
                  onSubmit={submit}
                  onChange={() => setPreview(null)}
                  className="space-y-6"
                >
                  <fieldset className="space-y-2">
                    <legend className="font-semibold">I’m submitting as</legend>
                    <div className="flex gap-6">
                      {(["traveler", "agency"] as const).map((k) => (
                        <label
                          key={k}
                          className="flex items-center gap-2 capitalize"
                        >
                          <input
                            type="radio"
                            name="requester"
                            checked={kind === k}
                            onChange={() => {
                              setKind(k);
                              setPreview(null);
                            }}
                          />
                          {k}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {kind === "agency" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="agency">Agency name</Label>
                      <Input
                        id="agency"
                        value={agencyName}
                        onChange={(e) => setAgencyName(e.target.value)}
                        required
                        maxLength={150}
                      />
                    </div>
                  )}
                  <fieldset className="space-y-4">
                    <legend className="font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Location
                    </legend>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="state">State</Label>
                        <select
                          id="state"
                          className={selectStyle}
                          value={state}
                          onChange={(e) => {
                            setState(e.target.value);
                            setCity("");
                          }}
                          required
                        >
                          <option value="">Select state</option>
                          {STATES.map((s) => (
                            <option key={s} value={s}>
                              {US_STATES[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          list="request-cities"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          required
                          maxLength={100}
                          placeholder="Enter any city"
                        />
                        <datalist id="request-cities">
                          {cities.map((c) => (
                            <option key={c.name} value={c.name} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nearby">
                        Also consider nearby cities
                      </Label>
                      <Input
                        id="nearby"
                        value={nearby}
                        onChange={(e) => setNearby(e.target.value)}
                        placeholder="Separate up to five cities with commas"
                      />
                      <p className="text-xs text-slate-500">
                        Cities must be in the selected state.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="workplace">
                        Workplace or hospital (optional)
                      </Label>
                      <Input
                        id="workplace"
                        value={workplace}
                        onChange={(e) => setWorkplace(e.target.value)}
                        maxLength={200}
                      />
                    </div>
                  </fieldset>
                  <fieldset className="space-y-4">
                    <legend className="font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Stay dates
                    </legend>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="move-in">Move-in</Label>
                        <Input
                          id="move-in"
                          type="date"
                          value={moveIn}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setMoveIn(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="move-out">Move-out</Label>
                        <Input
                          id="move-out"
                          type="date"
                          value={moveOut}
                          min={moveIn}
                          onChange={(e) => setMoveOut(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Monthly stays of at least 30 days.
                    </p>
                  </fieldset>
                  {kind === "agency" && (
                    <fieldset className="space-y-4">
                      <legend className="font-semibold">Travelers</legend>
                      <p className="text-sm text-slate-600">
                        Each traveler gets a separate request. Housing
                        requirements below apply to all travelers; you can set
                        individual dates and workplaces.
                      </p>
                      {travelers.map((t, index) => (
                        <div
                          key={index}
                          className="rounded-lg border border-slate-200 p-4 space-y-3"
                        >
                          <div className="flex justify-between items-center">
                            <h3 className="font-medium">
                              Traveler {index + 1}
                            </h3>
                            {travelers.length > 1 && (
                              <Button
                                variant="ghost"
                                type="button"
                                aria-label={`Remove traveler ${index + 1}`}
                                onClick={() => {
                                  setTravelers((current) =>
                                    current.filter((_, i) => i !== index),
                                  );
                                  setPreviewIndex(0);
                                  setPreview(null);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Label htmlFor={`traveler-${index}`}>Name</Label>
                          <Input
                            id={`traveler-${index}`}
                            value={t.name}
                            onChange={(e) =>
                              updateTraveler(index, "name", e.target.value)
                            }
                            required
                            maxLength={100}
                          />
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor={`in-${index}`}>
                                Move-in (optional override)
                              </Label>
                              <Input
                                id={`in-${index}`}
                                type="date"
                                value={t.moveIn}
                                onChange={(e) =>
                                  updateTraveler(
                                    index,
                                    "moveIn",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor={`out-${index}`}>
                                Move-out (optional override)
                              </Label>
                              <Input
                                id={`out-${index}`}
                                type="date"
                                value={t.moveOut}
                                onChange={(e) =>
                                  updateTraveler(
                                    index,
                                    "moveOut",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>
                          <Label htmlFor={`work-${index}`}>
                            Workplace (optional override)
                          </Label>
                          <Input
                            id={`work-${index}`}
                            value={t.workplace}
                            onChange={(e) =>
                              updateTraveler(index, "workplace", e.target.value)
                            }
                            maxLength={200}
                          />
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={travelers.length >= 10}
                        onClick={() => {
                          setTravelers((current) => [
                            ...current,
                            {
                              name: "",
                              moveIn: "",
                              moveOut: "",
                              workplace: "",
                            },
                          ]);
                          setPreview(null);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add traveler
                      </Button>
                    </fieldset>
                  )}
                  <fieldset className="space-y-4">
                    <legend className="font-semibold">
                      Housing requirements
                    </legend>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="budget">Maximum monthly rent ($)</Label>
                        <Input
                          id="budget"
                          type="number"
                          min={1}
                          max={1000000}
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bedrooms">Minimum bedrooms</Label>
                        <Input
                          id="bedrooms"
                          type="number"
                          min={0}
                          max={30}
                          value={bedrooms}
                          onChange={(e) => setBedrooms(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="occupants">Occupants per rental</Label>
                        <Input
                          id="occupants"
                          type="number"
                          min={1}
                          max={30}
                          value={occupants}
                          onChange={(e) => setOccupants(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="type">Property type</Label>
                        <select
                          id="type"
                          className={selectStyle}
                          value={type}
                          onChange={(e) => setType(e.target.value)}
                        >
                          <option value="">Any type</option>
                          {PROPERTY_TYPES.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {[
                        {
                          label: "Traveling with pets",
                          checked: pets,
                          set: setPets,
                        },
                        {
                          label: "Utilities included",
                          checked: utilities,
                          set: setUtilities,
                        },
                        {
                          label: "Parking included",
                          checked: parking,
                          set: setParking,
                        },
                      ].map(({ label, checked, set }) => (
                        <label
                          key={label}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => set(e.target.checked)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="text-sm font-medium">Required amenities</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {AMENITIES.filter(
                        (a) =>
                          ![
                            "Pet Friendly",
                            "Parking",
                            "Utilities Included",
                          ].includes(a),
                      ).map((a) => (
                        <label
                          key={a}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={amenities.includes(a)}
                            onChange={(e) =>
                              setAmenities((current) =>
                                e.target.checked
                                  ? [...current, a]
                                  : current.filter((v) => v !== a),
                              )
                            }
                          />
                          {a}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="space-y-1.5">
                    <Label htmlFor="description">
                      Introduce yourself and describe your needs
                    </Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      rows={5}
                    />
                    <p className="text-xs text-slate-500">
                      {allowUnmatched
                        ? "Owners in your selected areas with compatible dates may receive your request even if their budget or other listed terms differ. Alternative proposals use platform messages; your phone is shared only through an exact-match delivery when you choose phone contact."
                        : "Only owners with matching properties receive your request."}
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowUnmatched}
                      onChange={(e) => setAllowUnmatched(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      Allow alternative offers from owners whose listed budget
                      or requirements differ. Dates must still be compatible.
                      Close this request to stop further sharing.
                    </span>
                  </label>
                  <fieldset className="space-y-2">
                    <legend className="font-semibold">
                      How may fully matching owners contact you?
                    </legend>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="contact"
                        checked={contact === "platform"}
                        onChange={() => setContact("platform")}
                      />
                      Platform messages only
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="contact"
                        checked={contact === "phone"}
                        disabled={!user?.phoneVerified}
                        onChange={() => setContact("phone")}
                      />
                      Share my confirmed phone number
                      {user?.phoneVerificationMode === "test"
                        ? " (test account)"
                        : ""}
                    </label>
                    {!user?.phoneVerified && (
                      <p className="text-xs text-slate-500">
                        Phone sharing requires verification in{" "}
                        <Link className="underline" href="/dashboard/profile">
                          your profile
                        </Link>
                        .
                      </p>
                    )}
                  </fieldset>
                  {kind === "agency" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="preview-traveler">
                        Preview matches for
                      </Label>
                      <select
                        id="preview-traveler"
                        className={selectStyle}
                        value={previewIndex}
                        onChange={(e) => {
                          setPreviewIndex(Number(e.target.value));
                          setPreview(null);
                        }}
                      >
                        {travelers.map((t, i) => (
                          <option key={i} value={i}>
                            {t.name || `Traveler ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <Button type="button" variant="outline" onClick={showPreview}>
                    Preview matching properties
                  </Button>
                  {preview && (
                    <MatchPreview
                      key={JSON.stringify(preview)}
                      criteria={preview}
                    />
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <input className="mt-1" type="checkbox" required />{" "}
                    <span>
                      I agree to the{" "}
                      <Link href="/terms" className="underline">
                        terms of use
                      </Link>{" "}
                      and to sharing this request{" "}
                      {allowUnmatched
                        ? "with eligible owners in the selected areas, including alternative offers as selected above."
                        : "with matching property owners."}
                    </span>
                  </label>
                  {error && (
                    <p
                      className="rounded-md bg-red-50 p-3 text-sm text-red-700"
                      role="alert"
                    >
                      {error}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    size="lg"
                    type="submit"
                    disabled={busy || !user}
                  >
                    {busy
                      ? "Submitting…"
                      : kind === "agency"
                        ? "Submit traveler requests"
                        : "Submit housing request"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
      <Footer />
    </main>
  );
}
