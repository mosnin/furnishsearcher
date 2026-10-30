/** A changed earlier spatial page invalidates later cursors. Keep only the checked prefix until it is reloaded. */
export function retainedSpatialPages(
  previous: (string | undefined)[],
  current: (string | undefined)[],
  count: number,
) {
  for (let i = 0; i < count - 1; i++)
    if (
      previous[i] !== undefined &&
      current[i] !== undefined &&
      previous[i] !== current[i]
    )
      return i + 1;
  return count;
}
