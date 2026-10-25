/**
 * Business metrics over transactions. All windows are half-open day ranges [fromDay, toDay).
 *
 * Definitions:
 * - Average order value (AOV) = revenue / orders, 0 when there are no orders.
 * - Returning customer = a customer in the window who also bought before the window.
 * - Repeat-customer share = returning customers / unique customers in the window.
 */
import type { Transaction } from './types';

export interface WindowSummary {
  fromDay: number;
  toDay: number;
  revenuePaise: number;
  orders: number;
  averageOrderValuePaise: number;
  uniqueCustomers: number;
  returningCustomers: number;
  repeatCustomerShare: number;
}

export interface DailyPoint {
  day: number;
  revenuePaise: number;
  orders: number;
  newCustomers: number;
  returningCustomers: number;
}

export function firstPurchaseDays(transactions: readonly Transaction[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const t of transactions) {
    const seen = first.get(t.customerId);
    if (seen === undefined || t.day < seen) first.set(t.customerId, t.day);
  }
  return first;
}

export function inWindow(transactions: readonly Transaction[], fromDay: number, toDay: number): Transaction[] {
  return transactions.filter((t) => t.day >= fromDay && t.day < toDay);
}

export function summarizeWindow(transactions: readonly Transaction[], fromDay: number, toDay: number): WindowSummary {
  const first = firstPurchaseDays(transactions);
  let revenuePaise = 0;
  let orders = 0;
  const customers = new Set<string>();
  for (const t of transactions) {
    if (t.day < fromDay || t.day >= toDay) continue;
    revenuePaise += t.amountPaise;
    orders += 1;
    customers.add(t.customerId);
  }
  let returningCustomers = 0;
  for (const id of customers) if ((first.get(id) ?? Infinity) < fromDay) returningCustomers += 1;
  return {
    fromDay,
    toDay,
    revenuePaise,
    orders,
    averageOrderValuePaise: orders === 0 ? 0 : revenuePaise / orders,
    uniqueCustomers: customers.size,
    returningCustomers,
    repeatCustomerShare: customers.size === 0 ? 0 : returningCustomers / customers.size,
  };
}

/** One point per day in the window, including days with no sales. */
export function dailySeries(transactions: readonly Transaction[], fromDay: number, toDay: number): DailyPoint[] {
  const first = firstPurchaseDays(transactions);
  const points: DailyPoint[] = [];
  for (let day = fromDay; day < toDay; day++) {
    points.push({ day, revenuePaise: 0, orders: 0, newCustomers: 0, returningCustomers: 0 });
  }
  const seenOnDay = new Set<string>();
  for (const t of transactions) {
    if (t.day < fromDay || t.day >= toDay) continue;
    const point = points[t.day - fromDay]!;
    point.revenuePaise += t.amountPaise;
    point.orders += 1;
    const key = `${t.day}|${t.customerId}`;
    if (seenOnDay.has(key)) continue;
    seenOnDay.add(key);
    if (first.get(t.customerId) === t.day) point.newCustomers += 1;
    else point.returningCustomers += 1;
  }
  return points;
}

/**
 * Distinct visit-days per 7-day bucket for a set of customers, counting back
 * from `toDay` so the last bucket always ends at the analysis day.
 */
export function weeklyVisits(
  transactions: readonly Transaction[],
  customerIds: ReadonlySet<string>,
  fromDay: number,
  toDay: number,
): { weekStartDay: number; visits: number }[] {
  const weeks = Math.floor((toDay - fromDay) / 7);
  const start = toDay - weeks * 7;
  const buckets = Array.from({ length: weeks }, (_, i) => ({ weekStartDay: start + i * 7, visits: 0 }));
  const seen = new Set<string>();
  for (const t of transactions) {
    if (t.day < start || t.day >= toDay || !customerIds.has(t.customerId)) continue;
    const key = `${t.day}|${t.customerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    buckets[Math.floor((t.day - start) / 7)]!.visits += 1;
  }
  return buckets;
}

/** Relative change, or null when the previous value is zero. */
export function percentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}
