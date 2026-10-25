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
) {
  const { start } = performanceWindow(days, now),
    byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: days }, (_, i) => {
    const day = start + i * PERFORMANCE_DAY,
      recorded = startedAt !== null && day + PERFORMANCE_DAY > startedAt;
    return { day, recorded, ...emptyPerformance(), ...(byDay.get(day) ?? {}) };
  });
}
export function performanceCsv(
  rows: ReturnType<typeof performanceSeries>,
  mode: "test" | "prod",
) {
  return [
    "UTC date,Environment,Collection coverage," +
      PERFORMANCE_METRICS.map((k) => metricLabels[k]).join(","),
    ...rows.map((row) =>
      [
        new Date(row.day).toISOString().slice(0, 10),
        mode,
        row.recorded ? "recorded" : "unavailable",
        ...PERFORMANCE_METRICS.map((key) => (row.recorded ? row[key] : "")),
      ].join(","),
    ),
  ].join("\r\n");
}
