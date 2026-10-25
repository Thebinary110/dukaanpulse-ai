/**
 * Period comparisons and breakdowns for the Overview screen.
 *
 * A "period" is the last `rangeDays` days before the as-of day: [asOfDay − rangeDays, asOfDay).
 * The comparison period is the equally long period immediately before it.
 */
import { firstPurchaseDays, summarizeWindow, type WindowSummary } from './metrics';
import type { Daypart, Transaction } from './types';

export const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

/**
 * Minimum days of history before a period starts for "returning customer" to be meaningful.
 * Without it, every customer in the first weeks of data would look new.
 */
export const MIN_HISTORY_DAYS_FOR_REPEAT = 28;

/** Changes smaller than this (relative, or absolute for shares) are reported as flat. */
export const FLAT_THRESHOLD = 0.005;

export type ChangeDirection = 'up' | 'down' | 'flat' | 'unknown';

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  absoluteChange: number | null;
  /** Relative change; null when either value is missing or the previous value is zero. */
  relativeChange: number | null;
  direction: ChangeDirection;
  /** Why a value or comparison is unavailable, in plain language. */
  unavailableReason: string | null;
}

export interface DayWindow {
  fromDay: number;
  toDay: number;
}

export interface PeriodComparison {
  rangeDays: number;
  current: DayWindow;
  /** Null when the data does not reach back far enough. */
  previous: DayWindow | null;
  revenuePaise: MetricComparison;
  orders: MetricComparison;
  averageOrderValuePaise: MetricComparison;
  /** Fraction of the period's customers who had bought before it. */
  repeatCustomerShare: MetricComparison;
}

/**
 * @param isShare compare as an absolute difference (percentage points) rather than relative change.
 */
export function compareValues(current: number | null, previous: number | null, isShare = false): MetricComparison {
  if (current === null || previous === null) {
    return { current, previous, absoluteChange: null, relativeChange: null, direction: 'unknown', unavailableReason: null };
  }
  const absoluteChange = current - previous;
  const relativeChange = previous === 0 ? null : absoluteChange / previous;
  const size = isShare ? Math.abs(absoluteChange) : relativeChange === null ? null : Math.abs(relativeChange);
  let direction: ChangeDirection;
  if (size === null) direction = absoluteChange === 0 ? 'flat' : absoluteChange > 0 ? 'up' : 'down';
  else if (size < FLAT_THRESHOLD) direction = 'flat';
  else direction = absoluteChange > 0 ? 'up' : 'down';
  return { current, previous, absoluteChange, relativeChange, direction, unavailableReason: null };
}

function withReason(m: MetricComparison, reason: string | null): MetricComparison {
  return reason ? { ...m, unavailableReason: reason } : m;
}

const NO_PREVIOUS = 'No earlier data to compare with.';
const NO_ORDERS = 'No orders in this period.';
const NO_REPEAT_HISTORY = 'Not enough earlier history to tell new customers from returning ones.';

export function comparePeriods(transactions: readonly Transaction[], asOfDay: number, rangeDays: number): PeriodComparison {
  if (!Number.isInteger(rangeDays) || rangeDays < 1) throw new Error('rangeDays must be a positive integer');
  const current: DayWindow = { fromDay: asOfDay - rangeDays, toDay: asOfDay };
  const previous: DayWindow | null = current.fromDay - rangeDays >= 0 ? { fromDay: current.fromDay - rangeDays, toDay: current.fromDay } : null;

  const cur = summarizeWindow(transactions, current.fromDay, current.toDay);
  const prev: WindowSummary | null = previous ? summarizeWindow(transactions, previous.fromDay, previous.toDay) : null;

  const aov = (s: WindowSummary | null) => (s && s.orders > 0 ? s.averageOrderValuePaise : null);
  const repeat = (s: WindowSummary | null, w: DayWindow | null) =>
    s && w && w.fromDay >= MIN_HISTORY_DAYS_FOR_REPEAT && s.uniqueCustomers > 0 ? s.repeatCustomerShare : null;

  const prevReason = previous ? null : NO_PREVIOUS;
  const aovReason = cur.orders === 0 ? NO_ORDERS : prev && prev.orders === 0 ? 'No orders in the previous period.' : prevReason;
  const repeatCurrent = repeat(cur, current);
  const repeatPrevious = repeat(prev, previous);
  const repeatReason =
    repeatCurrent === null
      ? cur.uniqueCustomers === 0
        ? NO_ORDERS
        : NO_REPEAT_HISTORY
      : repeatPrevious === null
        ? previous
          ? `Previous period: ${NO_REPEAT_HISTORY.charAt(0).toLowerCase()}${NO_REPEAT_HISTORY.slice(1)}`
          : NO_PREVIOUS
        : null;

  return {
    rangeDays,
    current,
    previous,
    revenuePaise: withReason(compareValues(cur.revenuePaise, prev?.revenuePaise ?? null), prevReason),
    orders: withReason(compareValues(cur.orders, prev?.orders ?? null), prevReason),
    averageOrderValuePaise: withReason(compareValues(aov(cur), aov(prev)), aovReason),
    repeatCustomerShare: withReason(compareValues(repeatCurrent, repeatPrevious, true), repeatReason),
  };
}

// ── Revenue trend ───────────────────────────────────────────────────────────

export type TrendGranularity = 'day' | 'week';

export interface TrendPoint {
  /** Current-period bucket, [fromDay, toDay). */
  fromDay: number;
  toDay: number;
  /** Revenue per day in the bucket (equals the day's revenue for daily buckets). */
  currentPaise: number;
  /** Matching bucket in the previous period, or null when out of range. */
  previousFromDay: number | null;
  previousToDay: number | null;
  previousPaise: number | null;
}

export interface RevenueTrend {
  granularity: TrendGranularity;
  points: TrendPoint[];
}

function dailyRevenue(transactions: readonly Transaction[], fromDay: number, toDay: number): number[] {
  const totals = new Array<number>(Math.max(0, toDay - fromDay)).fill(0);
  for (const t of transactions) if (t.day >= fromDay && t.day < toDay) totals[t.day - fromDay]! += t.amountPaise;
  return totals;
}

function averageOver(daily: readonly number[], offset: number, from: number, to: number): number {
  let sum = 0;
  for (let d = from; d < to; d++) sum += daily[d - offset]!;
  return sum / (to - from);
}

/**
 * Revenue over the selected period, aligned position-by-position with the previous period.
 * Up to 31 days: one point per day. Longer: one point per 7-day bucket counted back from the
 * as-of day, valued as average revenue per day so a shorter first bucket is not understated.
 */
export function revenueTrend(transactions: readonly Transaction[], asOfDay: number, rangeDays: number): RevenueTrend {
  const granularity: TrendGranularity = rangeDays <= 31 ? 'day' : 'week';
  const size = granularity === 'day' ? 1 : 7;
  const fromDay = asOfDay - rangeDays;
  const hasPrevious = fromDay - rangeDays >= 0;
  const earliest = hasPrevious ? fromDay - rangeDays : fromDay;
  const daily = dailyRevenue(transactions, earliest, asOfDay);

  const points: TrendPoint[] = [];
  for (let end = asOfDay; end > fromDay; end -= size) {
    const start = Math.max(fromDay, end - size);
    points.push({
      fromDay: start,
      toDay: end,
      currentPaise: averageOver(daily, earliest, start, end),
      previousFromDay: hasPrevious ? start - rangeDays : null,
      previousToDay: hasPrevious ? end - rangeDays : null,
      previousPaise: hasPrevious ? averageOver(daily, earliest, start - rangeDays, end - rangeDays) : null,
    });
  }
  return { granularity, points: points.reverse() };
}

// ── Breakdowns ──────────────────────────────────────────────────────────────

export const DAYPARTS: readonly Daypart[] = ['morning', 'afternoon', 'evening'];

export const DAYPART_HOURS: Record<Daypart, string> = {
  morning: '7–11:30 am',
  afternoon: '12–4:30 pm',
  evening: '5–9:30 pm',
};

export interface DaypartSlice {
  daypart: Daypart;
  revenuePaise: number;
  orders: number;
}

export function revenueByDaypart(transactions: readonly Transaction[], fromDay: number, toDay: number): DaypartSlice[] {
  const slices = new Map<Daypart, DaypartSlice>(DAYPARTS.map((d) => [d, { daypart: d, revenuePaise: 0, orders: 0 }]));
  for (const t of transactions) {
    if (t.day < fromDay || t.day >= toDay) continue;
    const s = slices.get(t.daypart)!;
    s.revenuePaise += t.amountPaise;
    s.orders += 1;
  }
  return DAYPARTS.map((d) => slices.get(d)!);
}

export interface CustomerMix {
  newCustomers: number;
  returningCustomers: number;
  newRevenuePaise: number;
  returningRevenuePaise: number;
  /** False when the period starts too early for "returning" to be meaningful. */
  historySufficient: boolean;
}

/** Splits a period's customers and revenue into first-time and returning customers. */
export function customerMix(transactions: readonly Transaction[], fromDay: number, toDay: number): CustomerMix {
  const first = firstPurchaseDays(transactions);
  const returning = new Set<string>();
  const fresh = new Set<string>();
  let newRevenuePaise = 0;
  let returningRevenuePaise = 0;
  for (const t of transactions) {
    if (t.day < fromDay || t.day >= toDay) continue;
    if (first.get(t.customerId)! < fromDay) {
      returning.add(t.customerId);
      returningRevenuePaise += t.amountPaise;
    } else {
      fresh.add(t.customerId);
      newRevenuePaise += t.amountPaise;
    }
  }
  return {
    newCustomers: fresh.size,
    returningCustomers: returning.size,
    newRevenuePaise,
    returningRevenuePaise,
    historySufficient: fromDay >= MIN_HISTORY_DAYS_FOR_REPEAT,
  };
}

export interface DaypartChange {
  daypart: Daypart;
  currentPaise: number;
  previousPaise: number;
  relativeChange: number;
}

/** The daypart whose revenue changed most (relative), or null without a usable comparison. */
export function largestDaypartChange(current: readonly DaypartSlice[], previous: readonly DaypartSlice[]): DaypartChange | null {
  let best: DaypartChange | null = null;
  for (const c of current) {
    const p = previous.find((s) => s.daypart === c.daypart);
    if (!p || p.revenuePaise === 0) continue;
    const relativeChange = (c.revenuePaise - p.revenuePaise) / p.revenuePaise;
    if (!best || Math.abs(relativeChange) > Math.abs(best.relativeChange)) {
      best = { daypart: c.daypart, currentPaise: c.revenuePaise, previousPaise: p.revenuePaise, relativeChange };
    }
  }
  return best;
}

// ── Revenue drivers ────────────────────────────────────────────────────────

export interface RevenueDrivers {
  revenueChangePaise: number;
  /** (orders now − orders before) × previous average bill. */
  ordersEffectPaise: number;
  /** orders now × (average bill now − average bill before). */
  averageBillEffectPaise: number;
  /** Revenue change per daypart; sums to revenueChangePaise. */
  daypartChangePaise: Record<Daypart, number>;
}

/**
 * Exact arithmetic decomposition of a revenue change between two windows:
 *   ΔRevenue = ΔOrders × AOV_before + Orders_now × ΔAOV   (identity, no residual)
 * It describes where the change shows up; it does not explain why.
 */
export function revenueDrivers(transactions: readonly Transaction[], current: DayWindow, previous: DayWindow): RevenueDrivers {
  const now = summarizeWindow(transactions, current.fromDay, current.toDay);
  const before = summarizeWindow(transactions, previous.fromDay, previous.toDay);
  const aovBefore = before.orders === 0 ? 0 : before.revenuePaise / before.orders;
  const aovNow = now.orders === 0 ? 0 : now.revenuePaise / now.orders;
  const ordersEffectPaise = (now.orders - before.orders) * aovBefore;
  const averageBillEffectPaise = now.orders * (aovNow - aovBefore);
  const cur = revenueByDaypart(transactions, current.fromDay, current.toDay);
  const prev = revenueByDaypart(transactions, previous.fromDay, previous.toDay);
  const daypartChangePaise = Object.fromEntries(
    DAYPARTS.map((d) => [d, cur.find((s) => s.daypart === d)!.revenuePaise - prev.find((s) => s.daypart === d)!.revenuePaise]),
  ) as Record<Daypart, number>;
  return { revenueChangePaise: now.revenuePaise - before.revenuePaise, ordersEffectPaise, averageBillEffectPaise, daypartChangePaise };
}
