// A neutral Beta(1, 1) prior keeps an unmeasured rental at 50% and limits
// the effect of one new conversation. This is our declared ranking policy,
// not an attempt to reproduce an undisclosed competitor formula.
export function recommendationScore(
  received: number,
  onTime: number,
  createdAt: number,
) {
  const percentBand = Math.round((100 * (onTime + 1)) / (received + 2));
  const time = Math.max(0, createdAt);
  return percentBand + time / (time + 1e12);
}
