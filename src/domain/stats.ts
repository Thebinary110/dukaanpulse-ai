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

/** Median of an unsorted array; throws on empty input. */
export function median(values: readonly number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation; |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** z for a two-sided 5% test, and for 80% power. */
export const Z_TWO_SIDED_95 = 1.959964;
export const Z_POWER_80 = 0.841621;

export interface Interval {
  low: number;
  high: number;
}

/** 95% Wilson score interval for a proportion; sensible for small samples and 0 or n successes. */
export function wilsonInterval(successes: number, n: number, z = Z_TWO_SIDED_95): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/**
 * Approximate power of a two-sided two-proportion z-test (normal approximation) to detect
 * rates p1 vs p2 with group sizes n1 and n2.
 */
export function twoProportionPower(p1: number, p2: number, n1: number, n2: number, z = Z_TWO_SIDED_95): number {
  if (n1 <= 0 || n2 <= 0 || p1 === p2) return 0;
  const pBar = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se0 = Math.sqrt(pBar * (1 - pBar) * (1 / n1 + 1 / n2));
  const se1 = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  if (se1 === 0) return 1;
  return normalCdf((Math.abs(p1 - p2) - z * se0) / se1);
}

/** Customers needed in each of two equal groups for 80% power at a two-sided 5% level. */
export function sampleSizePerGroup(p1: number, p2: number): number {
  if (p1 === p2) return Number.POSITIVE_INFINITY;
  const pBar = (p1 + p2) / 2;
  const a = Z_TWO_SIDED_95 * Math.sqrt(2 * pBar * (1 - pBar));
  const b = Z_POWER_80 * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil(((a + b) * (a + b)) / ((p1 - p2) * (p1 - p2)));
}

/** Share of values (sorted ascending) at or below x, in [0, 1]. */
export function percentileRank(sortedAscending: readonly number[], x: number): number {
  if (sortedAscending.length === 0) return 0;
  let lo = 0;
  let hi = sortedAscending.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAscending[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedAscending.length;
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** Equal-width histogram; the last bin includes its upper edge. */
export function histogram(values: readonly number[], bins: number): Bin[] {
  if (values.length === 0 || bins < 1) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = max === min ? 1 : (max - min) / bins;
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
  for (const v of values) out[Math.min(bins - 1, Math.floor((v - min) / width))]!.count += 1;
  return out;
}
