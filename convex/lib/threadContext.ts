export function monthlyRateCents(price: number): number | null {
  const cents = Math.round(price * 100);
  return Number.isFinite(price) &&
    price > 0 &&
    cents > 0 &&
    Number.isSafeInteger(cents) &&
    Math.abs(price * 100 - cents) < 0.000001
    ? cents
    : null;
}
