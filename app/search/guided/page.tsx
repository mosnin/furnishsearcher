"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import {
  normalizeSearch,
  parseSearchParams,
  parseDate,
  buildSearchUrl,
  type SearchFilters,
} from "@/lib/search";
import { searchSummary } from "@/lib/guided-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListingFilters } from "@/components/listing-filters";
import { LocationSearch } from "@/components/location-search";
const date = (value?: number) =>
  value === undefined ? "" : new Date(value).toISOString().slice(0, 10);
const area = (f: SearchFilters) =>
  f.propertyId ?? f.location ?? [f.city, f.state].filter(Boolean).join(", ");
function AccountSearch() {
  const params = useSearchParams(),
    router = useRouter();
  const [initial] = useState(() => {
    try {
      return parseSearchParams(params);
    } catch {
      return {} as SearchFilters;
    }
  });
  const [draft, setDraft] = useState(initial),
    [location, setLocation] = useState(area(initial));
  const [moveIn, setMoveIn] = useState(date(initial.moveIn)),
    [moveOut, setMoveOut] = useState(date(initial.moveOut));
  const [description, setDescription] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [unapplied, setUnapplied] = useState<string[]>([]),
    [acknowledged, setAcknowledged] = useState(false),
    [interpreted, setInterpreted] = useState(false),
    [changed, setChanged] = useState(false);
  const [availability, setAvailability] = useState<{
    available: boolean;
    reason: string;
  } | null>(null);
  const interpret = useAction(api.guidedSearch.interpret),
    probe = useAction(api.guidedSearch.availability);
  const run = useRef(0),
    clientId = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void probe({})
      .then((value) => {
        if (active) setAvailability(value);
      })
      .catch(() => {
        if (active)
          setAvailability({ available: false, reason: "provider_unavailable" });
      });
    return () => {
      active = false;
      run.current++;
    };
  }, [probe]);
  function edited() {
    let filters = { ...draft };
    if (location !== area(draft))
      filters = {
        ...filters,
        location: location.trim() || undefined,
        city: undefined,
        state: undefined,
        propertyId: undefined,
        propertyGroupId: undefined,
        mapBounds: undefined,
        nearLatitude: undefined,
        nearLongitude: undefined,
        radiusMiles: undefined,
        nearLabel: undefined,
      };
    filters.moveIn = moveIn ? parseDate(moveIn) : undefined;
    filters.moveOut = moveOut ? parseDate(moveOut) : undefined;
    if (!moveIn && !moveOut) filters.flexibleDays = undefined;
    return normalizeSearch(filters);
  }
  let summary: string[] = [],
    reviewError = "";
  try {
    summary = searchSummary(edited());
  } catch (e) {
    reviewError = e instanceof Error ? e.message : "Review your filters.";
  }
  async function submit() {
    const current = ++run.current;
    setBusy(true);
    setError("");
    try {
      clientId.current ??= crypto.randomUUID();
      const result = await interpret({
        description,
        base: edited(),
        consent,
        unapplied,
        clientId: clientId.current,
        requestId: crypto.randomUUID(),
      });
      if (current !== run.current) return;
      setDraft(result.filters);
      setLocation(area(result.filters));
      setMoveIn(date(result.filters.moveIn));
      setMoveOut(date(result.filters.moveOut));
      setUnapplied(result.unapplied);
      setAcknowledged(false);
      setInterpreted(true);
      setChanged(false);
    } catch (e) {
      if (current === run.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not interpret this description.",
        );
    } finally {
      if (current === run.current) setBusy(false);
    }
  }
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="flex justify-between gap-4">
        <Link href="/" className="font-semibold text-primary">
          globe
        </Link>
        <Link href={buildSearchUrl(initial)} className="underline">
          Standard search
        </Link>
      </div>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Describe your ideal stay</h1>
        <p className="text-slate-600">
          Describe one search, review the interpretation, then see real listing
          matches. You can change every applied filter. This is a search tool
          with one request at a time.
        </p>
      </header>
      <form
        className="rounded-xl border bg-white p-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block font-medium" htmlFor="stay-description">
          What are you looking for?
        </label>
        <textarea
          id="stay-description"
          className="w-full min-h-32 rounded-md border p-3"
          minLength={10}
          maxLength={2000}
          required
          value={description}
          disabled={busy}
          onChange={(e) => {
            setDescription(e.target.value);
            if (interpreted) setChanged(true);
          }}
          placeholder="For example: a pet-friendly one-bedroom in Phoenix, AZ, from May 1 next year for 8 weeks, up to $2,500 per month, with WiFi."
        />
        <p className="text-sm text-slate-600">
          Use USD monthly rent and stays of at least 30 days. Avoid private
          contact, financial or medical information. AI can misunderstand
          preferences; review the summary and listing details.
        </p>
        <label className="flex gap-2 text-sm items-start">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            Process my description and current search filters with AI through
            Convex and its model providers. Standard search works without AI.
          </span>
        </label>
        {availability === null ? (
          <p role="status">Checking AI availability…</p>
        ) : !availability.available ? (
          <p role="status" className="text-sm text-amber-800">
            AI interpretation is unavailable in this environment. You can set
            the filters below or use standard search.
          </p>
        ) : null}
        <div className="flex gap-3 flex-wrap">
          <Button
            type="submit"
            disabled={
              busy ||
              !consent ||
              !availability?.available ||
              description.trim().length < 10
            }
          >
            {busy
              ? "Interpreting…"
              : interpreted
                ? "Refine preferences"
                : "Review my search"}
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={() => {
              run.current++;
              setDescription("");
              setDraft({});
              setLocation("");
              setMoveIn("");
              setMoveOut("");
              setUnapplied([]);
              setAcknowledged(false);
              setInterpreted(false);
              setChanged(false);
              setError("");
            }}
          >
            Start over
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {changed && (
          <p role="status" className="text-amber-800">
            The description changed. Interpret it again to update this summary,
            or use standard search.
          </p>
        )}
      </form>
      <section
        aria-labelledby="review-heading"
        className="rounded-xl border bg-white p-4 space-y-4"
      >
        <fieldset disabled={busy} className="space-y-4">
          <h2 id="review-heading" className="text-xl font-semibold">
            {interpreted ? "Review your search" : "Choose your search filters"}
          </h2>
          <p className="text-sm text-slate-600">
            Only the filters shown here will affect results. No matching
            listings are generated by AI. Owner-described amenities and
            approximate distances need your review.
          </p>
          {summary.length ? (
            <ul
              aria-label="Applied search filters"
              className="flex flex-wrap gap-2"
            >
              {summary.map((text, i) => (
                <li
                  className="rounded-md bg-slate-100 px-3 py-1 text-sm"
                  key={`${i}:${text}`}
                >
                  {text}
                </li>
              ))}
            </ul>
          ) : (
            <p>All locations, dates and monthly budgets.</p>
          )}
          {unapplied.length > 0 && (
            <div className="rounded-lg border border-amber-300 p-3 space-y-3">
              <h3 className="font-medium">Not applied — needs your review</h3>
              <ul className="list-disc pl-5">
                {unapplied.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
              <p className="text-sm">
                Use the controls below to resolve what you can. The app cannot
                guarantee the remaining preferences.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                I have reviewed these notes and agree to search using only the
                filters shown.
              </label>
            </div>
          )}
          <label className="block text-sm">
            City, state or property ID
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
            />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm">
              Move-in
              <Input
                type="date"
                value={moveIn}
                onChange={(e) => setMoveIn(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Move-out (checkout)
              <Input
                type="date"
                value={moveOut}
                onChange={(e) => setMoveOut(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Date flexibility
              <select
                className="block rounded-md border p-2"
                value={draft.flexibleDays ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, flexibleDays: Number(e.target.value) })
                }
              >
                {[0, 7, 14, 30].map((days) => (
                  <option key={days} value={days}>
                    {days ? `±${days} days` : "Exact dates"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <LocationSearch
            filters={draft}
            onChange={(next) => {
              setDraft(next);
              setLocation(area(next));
            }}
          />
          <ListingFilters filters={draft} onFilterChange={setDraft} />
          {reviewError && (
            <p role="alert" className="text-red-700">
              {reviewError}
            </p>
          )}
          <Button
            disabled={
              busy ||
              !!reviewError ||
              changed ||
              (unapplied.length > 0 && !acknowledged)
            }
            onClick={() => {
              try {
                router.push(buildSearchUrl(edited()));
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Check your filters.",
                );
              }
            }}
          >
            {interpreted ? "See my matches" : "Search with these filters"}
          </Button>
        </fieldset>
      </section>
    </main>
  );
}
function GuidedSearch() {
  const { userId } = useAuth();
  const params = useSearchParams();
  return (
    <AccountSearch key={`${userId ?? "anonymous"}:${params.toString()}`} />
  );
}
export default function GuidedSearchPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8" role="status">
          Loading guided search…
        </main>
      }
    >
      <GuidedSearch />
    </Suspense>
  );
}
