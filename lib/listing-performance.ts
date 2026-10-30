export const PERFORMANCE_DAY = 86400000;
export const PERFORMANCE_METRICS = [
  "impressions",
  "views",
  "shares",
  "saves",
  "unsaves",
  "bookingRequests",
  "threads",
  "matchedLeads",
  "phoneReveals",
  "unmatchedLeads",
] as const;
export type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];
export const metricLabels: Record<PerformanceMetric, string> = {
  impressions: "Search appearances",
  views: "Listing views",
  shares: "Share actions",
  saves: "Saves added",
  unsaves: "Saves removed",
  bookingRequests: "Booking requests",
  threads: "New traveler threads",
  matchedLeads: "Matched housing requests",
  phoneReveals: "Phone number reveals",
  unmatchedLeads: "Unmatched housing requests",
};
export function emptyPerformance() {
  return Object.fromEntries(
    PERFORMANCE_METRICS.map((key) => [key, 0]),
  ) as Record<PerformanceMetric, number>;
}
export function performanceWindow(days: number, now = Date.now()) {
  if (![7, 30, 90].includes(days)) throw new Error("Choose 7, 30 or 90 days.");
  const today = Math.floor(now / PERFORMANCE_DAY) * PERFORMANCE_DAY;
  return {
    start: today - (days - 1) * PERFORMANCE_DAY,
    end: today + PERFORMANCE_DAY,
  };
}
export function performanceSeries(
  rows: ({ day: number } & Partial<Record<PerformanceMetric, number>>)[],
  days: number,
  startedAt: number | null,
  now = Date.now(),
  phoneStartedAt: number | null = null,
  unmatchedStartedAt: number | null = null,
) {
  const { start } = performanceWindow(days, now),
    byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: days }, (_, i) => {
    const day = start + i * PERFORMANCE_DAY,
      recorded = startedAt !== null && day + PERFORMANCE_DAY > startedAt;
    const phoneRecorded =
      phoneStartedAt !== null && day + PERFORMANCE_DAY > phoneStartedAt;
    return {
      day,
      recorded,
      phoneRecorded,
      unmatchedRecorded:
        unmatchedStartedAt !== null &&
        day + PERFORMANCE_DAY > unmatchedStartedAt,
      ...emptyPerformance(),
      ...(byDay.get(day) ?? {}),
    };
  });
}
export function metricRecorded(
  row: {
    recorded: boolean;
    phoneRecorded: boolean;
    unmatchedRecorded: boolean;
  },
  key: PerformanceMetric,
) {
  return key === "phoneReveals"
    ? row.phoneRecorded
    : key === "unmatchedLeads"
      ? row.unmatchedRecorded
      : row.recorded;
}
export function performanceCsv(
  rows: ReturnType<typeof performanceSeries>,
  mode: "test" | "prod",
) {
  return [
    "UTC date,Environment,Collection coverage,Phone reveal coverage,Unmatched lead coverage," +
      PERFORMANCE_METRICS.map((k) => metricLabels[k]).join(","),
    ...rows.map((row) =>
      [
        new Date(row.day).toISOString().slice(0, 10),
        mode,
        row.recorded ? "recorded" : "unavailable",
        row.phoneRecorded ? "recorded" : "unavailable",
        row.unmatchedRecorded ? "recorded" : "unavailable",
        ...PERFORMANCE_METRICS.map((key) =>
          metricRecorded(row, key) ? row[key] : "",
        ),
      ].join(","),
    ),
  ].join("\r\n");
}

// Use the exact native UTC window for charts and exports. Device clock skew
// must not relabel, omit or fabricate days from an already fetched report.
export function reportWindowDays(report: { start: number; end: number }) {
  const days = (report.end - report.start) / PERFORMANCE_DAY;
  if (
    !Number.isSafeInteger(report.start) ||
    !Number.isSafeInteger(report.end) ||
    report.start % PERFORMANCE_DAY !== 0 ||
    report.end % PERFORMANCE_DAY !== 0 ||
    ![7, 30, 90].includes(days)
  )
    throw new Error("Invalid reported UTC window.");
  return days;
}
export function performanceReportSeries(report: {
  rows: Parameters<typeof performanceSeries>[0];
  start: number;
  end: number;
  startedAt: number | null;
  phoneStartedAt: number | null;
  unmatchedStartedAt: number | null;
}) {
  return performanceSeries(
    report.rows,
    reportWindowDays(report),
    report.startedAt,
    report.end - 1,
    report.phoneStartedAt,
    report.unmatchedStartedAt,
  );
}
export function reportRefreshDelay(report: {
  end: number;
  generatedAt: number;
}) {
  return Math.max(
    1000,
    Math.min(PERFORMANCE_DAY, report.end - report.generatedAt + 1000),
  );
}
