import { describe, expect, it } from 'vitest';
import { generateDataset } from '../generator';
import { dayStartTimestamp, MS_PER_DAY } from '../time';

describe('synthetic dataset generator', () => {
  const { dataset, groundTruth } = generateDataset();

  it('is reproducible for a seed', () => {
    expect(generateDataset()).toEqual(generateDataset());
    expect(generateDataset({ seed: 99 })).toEqual(generateDataset({ seed: 99 }));
  });

  it('differs across seeds', () => {
    expect(generateDataset({ seed: 99 }).dataset.transactions).not.toEqual(dataset.transactions);
  });

  it('is fast enough to run in the browser at startup', () => {
    const t0 = performance.now();
    generateDataset({ seed: 5 });
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('marks the merchant as synthetic', () => {
    expect(dataset.merchant.synthetic).toBe(true);
  });

  it('produces well-formed transactions', () => {
    const ids = new Set(dataset.customers.map((c) => c.id));
    let previous = -Infinity;
    for (const t of dataset.transactions) {
      expect(ids.has(t.customerId)).toBe(true);
      expect(Number.isInteger(t.amountPaise)).toBe(true);
      expect(t.amountPaise).toBeGreaterThan(0);
      expect(t.day).toBeGreaterThanOrEqual(0);
      expect(t.day).toBeLessThan(dataset.dayCount);
      const start = dayStartTimestamp(dataset.startDate, t.day);
      expect(t.timestamp).toBeGreaterThanOrEqual(start);
      expect(t.timestamp).toBeLessThan(start + MS_PER_DAY);
      expect(t.timestamp).toBeGreaterThanOrEqual(previous);
      previous = t.timestamp;
    }
  });

  it('records at most one visit per customer per day', () => {
    const keys = dataset.transactions.map((t) => `${t.customerId}|${t.day}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives each walk-in customer exactly one transaction', () => {
    const walkIns = new Set(dataset.customers.filter((c) => c.segment === 'walk_in').map((c) => c.id));
    const counts = new Map<string, number>();
    for (const t of dataset.transactions) if (walkIns.has(t.customerId)) counts.set(t.customerId, (counts.get(t.customerId) ?? 0) + 1);
    expect(walkIns.size).toBeGreaterThan(0);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(counts.size).toBe(walkIns.size);
  });

  it('plants lapsed regulars whose lapse starts 21–42 days before the as-of day', () => {
    expect(groundTruth.lapsedCustomerIds).toHaveLength(40);
    for (const id of groundTruth.lapsedCustomerIds) {
      const start = groundTruth.lapseStartDay[id]!;
      expect(dataset.asOfDay - start).toBeGreaterThanOrEqual(21);
      expect(dataset.asOfDay - start).toBeLessThanOrEqual(42);
      expect(dataset.customers.find((c) => c.id === id)?.segment).toBe('regular');
    }
  });
});
