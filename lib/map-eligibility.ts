import {
  reportWindowDays,
  performanceWindow,
  PERFORMANCE_DAY,
} from "./listing-performance";
export type EligibilityObservation = {
  day: number;
  observedSpaces: number;
  eligibleSpaces: number;
  firstCheckedAt: number;
  lastCheckedAt: number;
};
export function eligibilitySeries(
  rows: EligibilityObservation[],
  days: number,
  now = Date.now(),
) {
  const { start } = performanceWindow(days, now),
    byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const day = start + i * PERFORMANCE_DAY;
    return { day, observation: byDay.get(day) ?? null };
  });
}
export function eligibilityCsv(
  rows: ReturnType<typeof eligibilitySeries>,
  mode: "test" | "prod",
  portfolio: boolean,
) {
  return [
    "UTC date,Environment,Scope,Check coverage,Observed rental spaces,Confirmed eligible rental spaces,First check UTC,Last check UTC",
    ...rows.map(({ day, observation: o }) =>
      [
        new Date(day).toISOString().slice(0, 10),
        mode,
        portfolio ? "portfolio" : "rental space",
        o ? "observed" : "unavailable",
        o?.observedSpaces ?? "",
        o?.eligibleSpaces ?? "",
        o ? new Date(o.firstCheckedAt).toISOString() : "",
        o ? new Date(o.lastCheckedAt).toISOString() : "",
      ].join(","),
    ),
  ].join("\r\n");
}

export function eligibilityReportSeries(report: {
  rows: EligibilityObservation[];
  start: number;
  end: number;
}) {
  return eligibilitySeries(
    report.rows,
    reportWindowDays(report),
    report.end - 1,
  );
}
