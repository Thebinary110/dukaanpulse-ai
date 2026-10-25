import { describe, expect, it } from 'vitest';
import { dailySeries, percentChange, summarizeWindow, weeklyVisits } from '../metrics';
import { tx } from './fixtures';

// Hand-computed fixture:
//   day 0: A ₹100, B ₹200
//   day 1: A ₹150
//   day 3: C ₹300, A ₹50 (A twice on day 3)
//   day 5: B ₹400
const fixture = [tx('A', 0, 100), tx('B', 0, 200), tx('A', 1, 150), tx('C', 3, 300), tx('A', 3, 50), tx('B', 5, 400)];

describe('summarizeWindow', () => {
  it('computes revenue, orders, AOV and repeat share over [fromDay, toDay)', () => {
    // Window days 1–5 (half-open: includes 1,3,5; excludes 0): ₹150 + ₹300 + ₹50 + ₹400
    const s = summarizeWindow(fixture, 1, 6);
    expect(s.revenuePaise).toBe(90_000);
    expect(s.orders).toBe(4);
    expect(s.averageOrderValuePaise).toBe(22_500);
    expect(s.uniqueCustomers).toBe(3);
    // A and B bought before day 1; C is new.
    expect(s.returningCustomers).toBe(2);
    expect(s.repeatCustomerShare).toBeCloseTo(2 / 3);
  });

  it('excludes the end day', () => {
    expect(summarizeWindow(fixture, 0, 1).revenuePaise).toBe(30_000);
  });

  it('returns zeros for an empty window instead of dividing by zero', () => {
    const s = summarizeWindow(fixture, 10, 20);
    expect(s).toMatchObject({ revenuePaise: 0, orders: 0, averageOrderValuePaise: 0, repeatCustomerShare: 0 });
  });
});

describe('dailySeries', () => {
  it('includes zero-sales days and splits new vs returning customers', () => {
    const series = dailySeries(fixture, 0, 6);
    expect(series.map((p) => p.revenuePaise)).toEqual([30_000, 15_000, 0, 35_000, 0, 40_000]);
    expect(series.map((p) => p.orders)).toEqual([2, 1, 0, 2, 0, 1]);
    expect(series.map((p) => p.newCustomers)).toEqual([2, 0, 0, 1, 0, 0]);
    // Day 3: A visits twice but counts once as returning.
    expect(series.map((p) => p.returningCustomers)).toEqual([0, 1, 0, 1, 0, 1]);
  });
});

describe('weeklyVisits', () => {
  it('counts distinct visit-days per 7-day bucket ending at toDay', () => {
    const txs = [tx('A', 0, 1), tx('A', 0, 1), tx('A', 6, 1), tx('B', 7, 1), tx('A', 13, 1), tx('Z', 13, 1)];
    expect(weeklyVisits(txs, new Set(['A', 'B']), 0, 14)).toEqual([
      { weekStartDay: 0, visits: 2 },
      { weekStartDay: 7, visits: 2 },
    ]);
  });
});

describe('percentChange', () => {
  it('handles growth, decline and a zero base', () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2);
    expect(percentChange(80, 100)).toBeCloseTo(-0.2);
    expect(percentChange(5, 0)).toBeNull();
  });
});
