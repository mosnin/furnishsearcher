"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { eligibilityReportSeries, eligibilityCsv } from "@/lib/map-eligibility";
export function MapEligibilityPanel({
  listingId,
  days,
  refreshKey,
}: {
  listingId: Id<"listings"> | null;
  days: number;
  refreshKey?: string;
}) {
  const report = useQuery(api.mapEligibility.report, {
    ...(listingId ? { listingId } : {}),
    days,
    refreshKey,
  });
  const check = useMutation(api.mapEligibility.check),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rows = report ? eligibilityReportSeries(report) : [],
    observed = rows.filter((r) => r.observation),
    total = observed.reduce((n, r) => n + r.observation!.eligibleSpaces, 0);
  async function refresh() {
    if (!listingId) return;
    setBusy(true);
    setError("");
    try {
      await check({ listingId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check eligibility.");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
        new Blob([eligibilityCsv(rows, report.mode, !listingId)], {
          type: "text/csv;charset=utf-8",
        }),
      ),
      link = document.createElement("a");
    link.href = url;
    link.download = `map-eligibility-${report.mode}-${listingId ?? "all"}-${days}-days.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      aria-label="Recorded map eligibility"
      className="min-w-0 rounded-xl border bg-white p-4 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Recorded map eligibility</h2>
        <div className="flex flex-wrap gap-2">
          {listingId && (
            <Button
              type="button"
              variant="outline"
              disabled={!report || busy}
              onClick={refresh}
            >
              {busy ? "Checking…" : "Check this space now"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!report}
            onClick={download}
          >
            Download eligibility CSV
          </Button>
        </div>
      </div>
      {!report ? (
        <p role="status">Loading eligibility history…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-sm text-slate-600">
                {listingId
                  ? "Recorded eligible UTC days"
                  : "Recorded eligible rental-space days"}
              </p>
              <p className="text-2xl font-semibold">
                {observed.length ? total.toLocaleString() : "Unavailable"}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600">UTC days with checks</p>
              <p className="text-2xl font-semibold">
                {observed.length} / {days}
              </p>
            </div>
            {listingId && (
              <div>
                <p className="text-sm text-slate-600">Current eligibility</p>
                <p className="font-medium">
                  {report.currentEligible
                    ? "Eligible for the map"
                    : "Not currently eligible"}
                </p>
              </div>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {report.totals
              ? `Since ${new Date(report.totals.firstCheckedAt).toISOString().slice(0, 10)} UTC: ${report.totals.eligibleSpaceDays.toLocaleString()} recorded eligible ${listingId ? "days" : "rental-space days"}. These totals remain when older daily rows leave the 90-day report.`
              : "Since-collection totals are unavailable until the first recorded check."}
          </p>
          <p className="text-sm text-slate-600">
            A day counts when a recorded check confirms that this rental can
            appear on the unfiltered search map: current publication, approval,
            identity, paid access and map location must qualify. It counts once
            per rental space per UTC day, even if the space is later hidden.
            This is eligibility, not an impression or a promise that a pin was
            displayed.
          </p>
          {!listingId && (
            <p className="text-sm text-slate-600">
              Portfolio totals add each observed rental-space day. Two eligible
              spaces on the same date count as two. Observed-space counts may
              change as a daily scan completes.
            </p>
          )}
          <p className="text-sm text-slate-600">
            Daily scans and supported listing changes record checks. A negative
            check means the space was not observed eligible at that time; it
            does not prove absence for the entire day. Missing days and earlier
            history stay unavailable. Brief eligibility between checks may be
            unrecorded.{" "}
            {report.mode === "test"
              ? "Test-environment checks; production history is separate."
              : "Production-environment checks."}
          </p>
          <details>
            <summary className="cursor-pointer font-medium">
              Daily eligibility checks
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="py-3 text-left">
                  No checks means unavailable, rather than an invented zero.
                  Check times use UTC.
                </caption>
                <thead>
                  <tr>
                    <th className="py-2 pr-4 text-left">UTC date</th>
                    <th className="pr-4 text-left">Eligible spaces observed</th>
                    <th className="pr-4 text-left">Spaces checked</th>
                    <th className="text-left">Last check</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ day, observation: o }) => (
                    <tr key={day} className="border-t">
                      <td className="whitespace-nowrap py-2 pr-4">
                        {new Date(day).toISOString().slice(0, 10)}
                      </td>
                      <td className="pr-4">
                        {!o
                          ? "Unavailable"
                          : o.eligibleSpaces
                            ? o.eligibleSpaces.toLocaleString()
                            : "Not observed eligible"}
                      </td>
                      <td className="pr-4">
                        {o?.observedSpaces.toLocaleString() ?? "Unavailable"}
                      </td>
                      <td className="whitespace-nowrap">
                        {o
                          ? new Date(o.lastCheckedAt)
                              .toISOString()
                              .slice(11, 19)
                          : "Unavailable"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
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
