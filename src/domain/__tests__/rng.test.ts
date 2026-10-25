import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../rng';

const draw = (seed: number, n = 50) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('seeded RNG', () => {
  it('reproduces the same sequence for the same seed', () => {
    expect(draw(123)).toEqual(draw(123));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(123)).not.toEqual(draw(124));
  });

  it('keeps next() in [0, 1) and int() within inclusive bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const k = rng.int(3, 6);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(6);
    }
  });

  it('shuffles into a permutation without mutating the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const out = createRng(1).shuffle(input);
    expect([...out].sort()).toEqual([...input]);
    expect(createRng(1).shuffle(input)).toEqual(out);
  });

  it('throws when picking from an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });

  it('derives stable, label-specific seeds', () => {
    expect(deriveSeed(1, 'a')).toBe(deriveSeed(1, 'a'));
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(1, 'b'));
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(2, 'a'));
  });
});
