/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Every random draw in the domain flows through an Rng so that a given seed
 * always produces identical datasets, splits and simulations. Never use
 * Math.random() in domain code.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  uniform(min: number, max: number): number;
  /** True with probability p. */
  bernoulli(p: number): boolean;
  /** Standard-normal draw scaled to N(mean, sd). */
  normal(mean?: number, sd?: number): number;
  /** Uniformly chosen element; throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** New array in a seeded Fisher–Yates order; input is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    uniform: (min, max) => min + next() * (max - min),
    bernoulli: (p) => next() < p,
    normal: (mean = 0, sd = 1) => {
      // Box–Muller; 1 - next() keeps the log argument in (0, 1].
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() called on an empty array');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
  return rng;
}

/** Derives a stable 32-bit seed from a base seed and a label (FNV-1a), so independent streams stay independent. */
export function deriveSeed(baseSeed: number, label: string): number {
  let h = (0x811c9dc5 ^ baseSeed) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
