/** Quantile of an ascending-sorted array using linear interpolation between ranks. */
export function quantile(sortedAscending: readonly number[], q: number): number {
  if (sortedAscending.length === 0) throw new Error('quantile() of an empty array');
  if (q < 0 || q > 1) throw new Error('q must be in [0, 1]');
  const position = (sortedAscending.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lo = sortedAscending[lower]!;
  const hi = sortedAscending[upper]!;
  return lo + (hi - lo) * (position - lower);
}
