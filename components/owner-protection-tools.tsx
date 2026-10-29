"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Id } from "@/convex/_generated/dataModel";

function InsuranceEstimate() {
  const available = useQuery(api.insurance.availability);
  const { results, status, loadMore } = usePaginatedQuery(
    api.insurance.properties,
    {},
    { initialNumItems: 20 },
  );
  const estimate = useAction(api.insurance.estimate);
  const [selected, setSelected] = useState("");
  const [consentKey, setConsentKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    url: string;
    key: string;
    id: string;
  } | null>(null);
  const property = results.find((p) => p.id === selected);
  const key = property?.addressKey ?? null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Request an estimate using your property's address, then continue with
        Steadily to review terms and complete its quote process.
      </p>
      {available === false ? (
        <p className="text-sm" role="status">
          In-app estimates are unavailable until globe has an approved
          Steadily connection. You can visit Steadily directly.
        </p>
      ) : available === undefined ? (
        <p role="status">Checking estimate availability…</p>
      ) : (
        <>
          <label
            className="block text-sm font-medium"
            htmlFor="insurance-property"
          >
            Property for the estimate
          </label>
          <select
            id="insurance-property"
            className="w-full min-w-0 rounded-md border p-2"
            value={selected}
            disabled={busy}
            onChange={(e) => {
              setSelected(e.target.value);
              setConsentKey(null);
              setResult(null);
              setError("");
            }}
          >
            <option value="">Choose your property</option>
            {results.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {status === "CanLoadMore" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => loadMore(20)}
            >
              Load more properties
            </Button>
          )}
          {status === "Exhausted" && !results.length && (
            <p className="text-sm">Create a property listing first.</p>
          )}
          {property && (
            <>
              <p className="text-sm break-words">
                {property.address}, {property.city}, {property.state}{" "}
                {property.zip}
              </p>
              {!key ? (
                <p className="text-sm">
                  Complete this property's US address before requesting an
                  estimate.
                </p>
              ) : (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={busy}
                    checked={consentKey === key}
                    onChange={(e) => {
                      setConsentKey(e.target.checked ? key : null);
                      setResult(null);
                    }}
                  />
                  <span>
                    Share this address with Steadily for an insurance estimate.
                    No traveler information or account contact details will be
                    sent.
                  </span>
                </label>
              )}
            </>
          )}
          <Button
            disabled={!property || !key || consentKey !== key || busy}
            onClick={async () => {
              if (!property || !key || consentKey !== key) return;
              setBusy(true);
              setError("");
              setResult(null);
              try {
                const response = await estimate({
                  listingId: property.id as Id<"listings">,
                  consent: true,
                  addressKey: key,
                  requestId: crypto.randomUUID(),
                });
                setResult({ ...response, key, id: property.id });
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "The estimate could not be confirmed. Check with Steadily before retrying.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Requesting estimate…" : "Request insurance estimate"}
          </Button>
          {error && (
            <p role="alert" className="text-sm break-words">
              {error}
            </p>
          )}
          {result && result.key === key && result.id === selected && (
            <p role="status" className="text-sm">
              <a
                className="underline"
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Continue your estimate with Steadily
              </a>
              . An estimate does not purchase or activate insurance.
            </p>
          )}
        </>
      )}
      <a
        className="inline-block underline text-sm"
        href="https://www.steadily.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Visit Steadily
      </a>
    </div>
  );
}
export default function OwnerProtectionTools({
  only,
}: {
  only?: "insurance" | "damage";
}) {
  const { user } = useUser();
  const profile = useQuery(
    api.users.getByClerkId,
    user ? { clerkId: user.id } : "skip",
  );
  if (profile?.role !== "landlord") return null;
  return (
    <section
      className="space-y-4"
      aria-labelledby="property-protection-heading"
    >
      <h2
        id="property-protection-heading"
        className={only ? "sr-only" : "text-xl font-semibold"}
      >
        Property protection
      </h2>
      <div className={only ? "grid gap-5" : "grid gap-5 md:grid-cols-2"}>
        {only !== "damage" && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-lg">Landlord insurance</h3>
              <p className="text-sm font-medium">Steadily</p>
              <InsuranceEstimate />
            </CardContent>
          </Card>
        )}
        {only !== "insurance" && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-lg">Damage protection</h3>
              <p className="text-sm font-medium">RentalGuardian</p>
              <p className="text-sm text-slate-600">
                Explore protection for accidental tenant damage. Eligibility,
                coverage, exclusions and claims are determined by the provider
                and the plan you purchase.
              </p>
              <p className="text-sm">
                Purchase, plan changes and claims are not connected to
                globe. Use your provider account for an existing plan.
              </p>
              <a
                className="inline-block underline text-sm"
                href="https://www.rentalguardian.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Explore RentalGuardian
              </a>
              <p className="text-xs text-slate-500">
                Damage protection is separate from landlord insurance. Provider
                terms and availability apply.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
