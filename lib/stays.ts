export const DAY = 86_400_000;

export function validateStay(start: number, end: number, minimumDays = 30) {
  if (!Number.isFinite(start) || !Number.isFinite(end) ||
      start % DAY !== 0 || end % DAY !== 0 || end <= start) {
    throw new Error("Choose valid move-in and move-out dates.");
  }
  if ((end - start) / DAY < minimumDays) {
    throw new Error(`This property requires a stay of at least ${minimumDays} days.`);
  }
}

export function overlaps(a: number, b: number, c: number, d: number) {
  // Checkout is exclusive: back-to-back stays do not overlap.
  return a < d && c < b;
}

export function isAvailable(
  listing: { availableFrom: number; minStay: number; calendarSyncThrough?: number },
  blocks: { startDate: number; endDate: number }[],
  start: number,
  end: number,
) {
  return (listing.calendarSyncThrough === undefined || end <= listing.calendarSyncThrough) &&
    start >= listing.availableFrom &&
    end - start >= Math.max(1, listing.minStay) * 30 * DAY &&
    !blocks.some(block => overlaps(start, end, block.startDate, block.endDate));
}

export function searchDateRange(value: string, now = new Date()) {
  if (!value || value === "flexible") return {};
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let start: number;
  if (value === "this-month") start = today;
  else if (value === "next-month") start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  else if (/^\d{4}-\d{2}(-\d{2})?$/.test(value)) start = Date.parse(value.length === 7 ? `${value}-01` : value);
  else return {};
  if (!Number.isFinite(start)) return {};
  return { moveIn: start, moveOut: start + 30 * DAY };
}
