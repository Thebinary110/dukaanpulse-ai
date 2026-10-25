/**
 * Customer-level evidence behind the lapsed-regulars signal.
 *
 * Built from the same scoring the detector uses (`scoreRegulars`), so every row and
 * boundary shown to the merchant agrees with what was actually flagged.
 */
import type { LapsedDetectorConfig } from '../types';
import type { ScoredRegular } from './lapsedRegulars';

/**
 * - flagged: the detector's signal (unusually long absence for this customer).
 * - long_gap: absent at least the minimum gap, but not unusual given their habit.
 * - active: visited recently.
 */
export type SignalStatus = 'flagged' | 'long_gap' | 'active';

export function signalStatus(row: ScoredRegular, config: LapsedDetectorConfig): SignalStatus {
  if (row.flagged) return 'flagged';
  return row.currentGapDays >= config.minGapDays ? 'long_gap' : 'active';
}

/**
 * Smallest current gap (days since last visit) at which a customer with this usual
 * interval is flagged. Mirrors the detector rule:
 *   gap ≥ minGapDays  and  (1 − p)^(gap − 1) < threshold, with p = 1 / typicalGapDays.
 * Returns Infinity when no gap can be flagged (p = 0).
 */
export function flaggingGapDays(typicalGapDays: number, config: LapsedDetectorConfig): number {
  const p = Math.min(0.99, 1 / typicalGapDays);
  if (!(p > 0)) return Number.POSITIVE_INFINITY;
  // (1 − p)^(g − 1) < t  ⇔  g − 1 > ln t / ln(1 − p)
  const bound = Math.log(config.probabilityThreshold) / Math.log(1 - p);
  return Math.max(config.minGapDays, Math.floor(1 + bound) + 1);
}

export type EvidenceFilter = 'flagged' | 'comparison' | 'all';
export type EvidenceSortKey = 'currentGapDays' | 'typicalGapDays' | 'lastVisitDay' | 'gapProbability' | 'customerId';
export type SortDirection = 'asc' | 'desc';

export interface EvidenceQuery {
  filter: EvidenceFilter;
  sortKey: EvidenceSortKey;
  direction: SortDirection;
  page: number;
  pageSize: number;
}

export interface EvidencePage {
  rows: ScoredRegular[];
  total: number;
  page: number;
  pageCount: number;
}

/** Filters, sorts (stable, with customer ID as tie-breaker) and paginates evidence rows. */
export function queryEvidence(rows: readonly ScoredRegular[], q: EvidenceQuery): EvidencePage {
  const filtered = rows.filter((r) => (q.filter === 'all' ? true : q.filter === 'flagged' ? r.flagged : !r.flagged));
  const sign = q.direction === 'asc' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    const primary =
      q.sortKey === 'customerId' ? a.customerId.localeCompare(b.customerId) : (a[q.sortKey] as number) - (b[q.sortKey] as number);
    return primary !== 0 ? sign * primary : a.customerId.localeCompare(b.customerId);
  });
  const pageSize = Math.max(1, Math.floor(q.pageSize));
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(q.page)), pageCount);
  return { rows: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageCount };
}
