import { describe, expect, it } from 'vitest';
import { generateDataset } from '../generator';
import { summarizeWindow } from '../metrics';
import {
  compareValues,
  comparePeriods,
  customerMix,
  largestDaypartChange,
  MIN_HISTORY_DAYS_FOR_REPEAT,
  RANGE_OPTIONS,
  revenueByDaypart,
  revenueDrivers,
  revenueTrend,
} from '../overview';
import { tx } from './fixtures';

// Hand-computed fixture, as of day 60.
//   A: day 10 ₹100, day 48 ₹200, day 55 ₹300
//   B: day 50 ₹100 (first purchase), day 56 ₹100
//   C: day 57 ₹500 (first purchase)
const AS_OF = 60;
const fixture = [
  tx('A', 10, 100),
  tx('A', 48, 200, 'evening'),
  tx('A', 55, 300),
  tx('B', 50, 100, 'afternoon'),
  tx('B', 56, 100, 'afternoon'),
  tx('C', 57, 500, 'evening'),
];

describe('comparePeriods', () => {
  it('compares the last 7 days with the 7 days before', () => {
    const c = comparePeriods(fixture, AS_OF, 7);
    expect(c.current).toEqual({ fromDay: 53, toDay: 60 });
    expect(c.previous).toEqual({ fromDay: 46, toDay: 53 });
    // Current: ₹300 + ₹100 + ₹500 = ₹900 over 3 orders. Previous: ₹200 + ₹100 over 2 orders.
    expect(c.revenuePaise).toMatchObject({ current: 90_000, previous: 30_000, absoluteChange: 60_000, direction: 'up' });
    expect(c.revenuePaise.relativeChange).toBeCloseTo(2);
    expect(c.orders).toMatchObject({ current: 3, previous: 2, absoluteChange: 1, direction: 'up' });
    expect(c.orders.relativeChange).toBeCloseTo(0.5);
    expect(c.averageOrderValuePaise).toMatchObject({ current: 30_000, previous: 15_000 });
    // Current: A and B bought before day 53; C is new → 2/3. Previous: A returning, B new → 1/2.
    expect(c.repeatCustomerShare.current).toBeCloseTo(2 / 3);
    expect(c.repeatCustomerShare.previous).toBeCloseTo(1 / 2);
    expect(c.repeatCustomerShare.absoluteChange).toBeCloseTo(1 / 6);
    expect(c.repeatCustomerShare.direction).toBe('up');
    expect(c.repeatCustomerShare.unavailableReason).toBeNull();
  });

  it('withholds repeat share for a period without enough earlier history', () => {
    const c = comparePeriods(fixture, AS_OF, 30); // previous period starts at day 0
    expect(c.previous).toEqual({ fromDay: 0, toDay: 30 });
    expect(c.repeatCustomerShare.current).not.toBeNull();
    expect(c.repeatCustomerShare.previous).toBeNull();
    expect(c.repeatCustomerShare.direction).toBe('unknown');
    expect(c.repeatCustomerShare.unavailableReason).toMatch(/Previous period/);
    expect(30).toBeGreaterThanOrEqual(MIN_HISTORY_DAYS_FOR_REPEAT);
  });

  it('reports no comparison when the data does not reach back far enough', () => {
    const c = comparePeriods(fixture, AS_OF, 40);
    expect(c.previous).toBeNull();
    for (const m of [c.revenuePaise, c.orders, c.averageOrderValuePaise]) {
      expect(m.previous).toBeNull();
      expect(m.relativeChange).toBeNull();
      expect(m.direction).toBe('unknown');
      expect(m.unavailableReason).toBe('No earlier data to compare with.');
    }
  });

  it('handles a period with no orders without dividing by zero', () => {
    const c = comparePeriods(fixture, 200, 7);
    expect(c.revenuePaise.current).toBe(0);
    expect(c.averageOrderValuePaise.current).toBeNull();
    expect(c.averageOrderValuePaise.unavailableReason).toBe('No orders in this period.');
    expect(c.repeatCustomerShare.current).toBeNull();
  });

  it('rejects invalid ranges', () => {
    expect(() => comparePeriods(fixture, AS_OF, 0)).toThrow();
    expect(() => comparePeriods(fixture, AS_OF, 2.5)).toThrow();
  });

  it('agrees with summarizeWindow on the demo dataset for every range', () => {
    const { dataset } = generateDataset();
    for (const range of RANGE_OPTIONS) {
      const c = comparePeriods(dataset.transactions, dataset.asOfDay, range);
      const s = summarizeWindow(dataset.transactions, dataset.asOfDay - range, dataset.asOfDay);
      expect(c.revenuePaise.current).toBe(s.revenuePaise);
      expect(c.orders.current).toBe(s.orders);
    }
  });
});

describe('compareValues', () => {
  it('treats tiny changes as flat', () => {
    expect(compareValues(100_000, 100_400).direction).toBe('flat');
    expect(compareValues(0.5, 0.503, true).direction).toBe('flat');
    expect(compareValues(0.5, 0.52, true).direction).toBe('down');
  });

  it('handles a zero previous value', () => {
    expect(compareValues(5, 0)).toMatchObject({ absoluteChange: 5, relativeChange: null, direction: 'up' });
    expect(compareValues(0, 0)).toMatchObject({ relativeChange: null, direction: 'flat' });
  });
});

describe('revenueTrend', () => {
  it('returns one point per day for short ranges, aligned with the previous period', () => {
    const t = revenueTrend(fixture, AS_OF, 7);
    expect(t.granularity).toBe('day');
    expect(t.points.map((p) => p.fromDay)).toEqual([53, 54, 55, 56, 57, 58, 59]);
    expect(t.points.map((p) => p.currentPaise)).toEqual([0, 0, 30_000, 10_000, 50_000, 0, 0]);
    expect(t.points.map((p) => p.previousFromDay)).toEqual([46, 47, 48, 49, 50, 51, 52]);
    expect(t.points.map((p) => p.previousPaise)).toEqual([0, 0, 20_000, 0, 10_000, 0, 0]);
  });

  it('uses weekly buckets valued per day for 90 days, preserving totals', () => {
    const { dataset } = generateDataset();
    const t = revenueTrend(dataset.transactions, dataset.asOfDay, 90);
    expect(t.granularity).toBe('week');
    expect(t.points).toHaveLength(13); // 12 full weeks + one 6-day bucket
    expect(t.points[0]!.toDay - t.points[0]!.fromDay).toBe(6);
    expect(t.points.at(-1)!.toDay).toBe(dataset.asOfDay);
    const total = (from: number, to: number) => summarizeWindow(dataset.transactions, from, to).revenuePaise;
    const sumCurrent = t.points.reduce((s, p) => s + p.currentPaise * (p.toDay - p.fromDay), 0);
    const sumPrevious = t.points.reduce((s, p) => s + p.previousPaise! * (p.toDay - p.fromDay), 0);
    expect(sumCurrent).toBeCloseTo(total(dataset.asOfDay - 90, dataset.asOfDay));
    expect(sumPrevious).toBeCloseTo(total(dataset.asOfDay - 180, dataset.asOfDay - 90));
  });

  it('omits the previous series when there is no earlier data', () => {
    const t = revenueTrend(fixture, AS_OF, 30);
    expect(t.points.every((p) => p.previousPaise !== null)).toBe(true);
    const short = revenueTrend(fixture, 20, 30);
    expect(short.points.every((p) => p.previousPaise === null && p.previousFromDay === null)).toBe(true);
  });
});

describe('breakdowns', () => {
  it('splits revenue and orders by daypart in a fixed order', () => {
    expect(revenueByDaypart(fixture, 46, 60)).toEqual([
      { daypart: 'morning', revenuePaise: 30_000, orders: 1 },
      { daypart: 'afternoon', revenuePaise: 20_000, orders: 2 },
      { daypart: 'evening', revenuePaise: 70_000, orders: 2 },
    ]);
  });

  it('splits customers and revenue into new and returning', () => {
    expect(customerMix(fixture, 53, 60)).toEqual({
      newCustomers: 1,
      returningCustomers: 2,
      newRevenuePaise: 50_000,
      returningRevenuePaise: 40_000,
      historySufficient: true,
    });
    expect(customerMix(fixture, 0, 30).historySufficient).toBe(false);
  });

  it('matches summarizeWindow on the demo dataset', () => {
    const { dataset } = generateDataset();
    const from = dataset.asOfDay - 30;
    const mix = customerMix(dataset.transactions, from, dataset.asOfDay);
    const s = summarizeWindow(dataset.transactions, from, dataset.asOfDay);
    expect(mix.returningCustomers).toBe(s.returningCustomers);
    expect(mix.newCustomers + mix.returningCustomers).toBe(s.uniqueCustomers);
    expect(mix.newRevenuePaise + mix.returningRevenuePaise).toBe(s.revenuePaise);
  });
});

describe('largestDaypartChange', () => {
  const slice = (morning: number, afternoon: number, evening: number) => [
    { daypart: 'morning' as const, revenuePaise: morning, orders: 1 },
    { daypart: 'afternoon' as const, revenuePaise: afternoon, orders: 1 },
    { daypart: 'evening' as const, revenuePaise: evening, orders: 1 },
  ];

  it('picks the biggest relative mover in either direction', () => {
    expect(largestDaypartChange(slice(77, 105, 100), slice(100, 100, 100))).toMatchObject({ daypart: 'morning', relativeChange: -0.23 });
    expect(largestDaypartChange(slice(90, 140, 100), slice(100, 100, 100))?.daypart).toBe('afternoon');
  });

  it('skips dayparts with no previous revenue and returns null without a comparison', () => {
    // Morning had no previous revenue, so it is skipped rather than reported as an infinite change.
    expect(largestDaypartChange(slice(50, 100, 100), slice(0, 100, 100))).toMatchObject({ relativeChange: 0 });
    expect(largestDaypartChange(slice(50, 0, 0), slice(0, 0, 0))).toBeNull();
    expect(largestDaypartChange(slice(1, 1, 1), [])).toBeNull();
  });
});

describe('revenueDrivers', () => {
  it('decomposes the revenue change exactly into orders and average-bill effects', () => {
    // Current [53,60): ₹900 over 3 orders (AOV ₹300). Previous [46,53): ₹300 over 2 orders (AOV ₹150).
    const d = revenueDrivers(fixture, { fromDay: 53, toDay: 60 }, { fromDay: 46, toDay: 53 });
    expect(d.revenueChangePaise).toBe(60_000);
    expect(d.ordersEffectPaise).toBe(15_000); // +1 order × ₹150
    expect(d.averageBillEffectPaise).toBe(45_000); // 3 orders × +₹150
    expect(d.ordersEffectPaise + d.averageBillEffectPaise).toBeCloseTo(d.revenueChangePaise);
    expect(d.daypartChangePaise).toEqual({ morning: 30_000, afternoon: 0, evening: 30_000 });
  });

  it('daypart changes sum to the total on the demo dataset', () => {
    const { dataset } = generateDataset();
    const d = revenueDrivers(dataset.transactions, { fromDay: 150, toDay: 180 }, { fromDay: 120, toDay: 150 });
    const sum = Object.values(d.daypartChangePaise).reduce((a, b) => a + b, 0);
    expect(sum).toBe(d.revenueChangePaise);
    expect(d.ordersEffectPaise + d.averageBillEffectPaise).toBeCloseTo(d.revenueChangePaise, 4);
  });
});
