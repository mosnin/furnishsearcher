export const RESPONSE_DAY = 86400000;
export const RESPONSE_BANDS = [
  "Typically within an hour",
  "Typically within 8 hours",
  "Typically within a day",
  "Typically within a few days",
  "Typically within a week",
  "More than a week",
] as const;
export const responseDay = (time: number) =>
  Math.floor(time / RESPONSE_DAY) * RESPONSE_DAY;
export const responseWindow = (now: number) =>
  responseDay(now) - 89 * RESPONSE_DAY;
export function responseBand(elapsed: number) {
  const index = [
    3600000,
    8 * 3600000,
    RESPONSE_DAY,
    3 * RESPONSE_DAY,
    7 * RESPONSE_DAY,
  ].findIndex((ceiling) => elapsed <= ceiling);
  return index === -1 ? 5 : index;
}
export function typicalResponse(bands: number[]) {
  const count = bands.reduce((sum, n) => sum + n, 0);
  if (!count) return null;
  // Upper median band: an even sample never promises the faster middle reply.
  const target = Math.floor(count / 2) + 1;
  let seen = 0;
  for (let i = 0; i < RESPONSE_BANDS.length; i++) {
    seen += bands[i] ?? 0;
    if (seen >= target) return RESPONSE_BANDS[i];
  }
  return null;
}
export const rateGrade = (percent: number | null) =>
  percent === null
    ? "Fresh Start"
    : percent >= 75
      ? "Excellent"
      : percent >= 50
        ? "Needs improvement"
        : "Poor";
