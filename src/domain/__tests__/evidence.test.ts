import { describe, expect, it } from 'vitest';
import { flaggingGapDays, queryEvidence, signalStatus } from '../detectors/evidence';
import { DEFAULT_LAPSED_CONFIG, scoreRegulars, type ScoredRegular } from '../detectors/lapsedRegulars';
import { generateDataset } from '../generator';
import { visitsEvery } from './fixtures';

const { dataset } = generateDataset();
const scored = scoreRegulars(dataset.transactions, dataset.asOfDay);

describe('flagging boundary', () => {
  it('matches the detector rule for every scored regular in the demo dataset', () => {
    for (const r of scored) {
      expect(r.flagged, r.customerId).toBe(r.currentGapDays >= flaggingGapDays(r.typicalGapDays, DEFAULT_LAPSED_CONFIG));
    }
  });

  it('never goes below the minimum gap, and grows with the usual interval', () => {
    expect(flaggingGapDays(1.5, DEFAULT_LAPSED_CONFIG)).toBe(DEFAULT_LAPSED_CONFIG.minGapDays);
    // p = 1/5: (0.8)^(g−1) < 0.01 ⇔ g − 1 > 20.6 ⇔ g ≥ 22
    expect(flaggingGapDays(5, DEFAULT_LAPSED_CONFIG)).toBe(22);
    expect(flaggingGapDays(7, DEFAULT_LAPSED_CONFIG)).toBeGreaterThan(flaggingGapDays(5, DEFAULT_LAPSED_CONFIG));
  });
});

describe('evidence rows', () => {
  it('match the generated transactions for every regular', () => {
    const byCustomer = new Map<string, number[]>();
    for (const t of dataset.transactions) {
      if (t.day >= dataset.asOfDay) continue;
      byCustomer.set(t.customerId, [...(byCustomer.get(t.customerId) ?? []), t.day]);
    }
    for (const r of scored) {
      const days = [...new Set(byCustomer.get(r.customerId))];
      expect(r.visitDays).toBe(days.length);
      expect(r.lastVisitDay).toBe(Math.max(...days));
      expect(r.firstVisitDay).toBe(Math.min(...days));
      expect(r.currentGapDays).toBe(dataset.asOfDay - r.lastVisitDay);
      expect(r.typicalGapDays).toBeCloseTo((r.lastVisitDay - r.firstVisitDay) / (r.visitDays - 1));
    }
  });

  it('classifies flagged, long-gap and active customers', () => {
    const rows = scoreRegulars(
      [...visitsEvery('FLAG', 2, 0, 70), ...visitsEvery('SLOW', 7, 0, 85), ...visitsEvery('ACTIVE', 2, 0, 100)],
      100,
    );
    const status = Object.fromEntries(rows.map((r) => [r.customerId, signalStatus(r, DEFAULT_LAPSED_CONFIG)]));
    // SLOW: weekly, last visit day 84 → 16-day gap: long, but (6/7)^15 ≈ 0.10 is not unusual.
    expect(status).toEqual({ FLAG: 'flagged', SLOW: 'long_gap', ACTIVE: 'active' });
  });
});

describe('queryEvidence', () => {
  const rows = scored;
  const flagged = rows.filter((r) => r.flagged).length;

  it('filters affected versus comparison customers', () => {
    const q = { sortKey: 'currentGapDays', direction: 'desc', page: 1, pageSize: 500 } as const;
    expect(queryEvidence(rows, { ...q, filter: 'flagged' }).total).toBe(flagged);
    expect(queryEvidence(rows, { ...q, filter: 'comparison' }).total).toBe(rows.length - flagged);
    expect(queryEvidence(rows, { ...q, filter: 'all' }).total).toBe(rows.length);
  });

  it('sorts stably in both directions', () => {
    const asc = queryEvidence(rows, { filter: 'all', sortKey: 'typicalGapDays', direction: 'asc', page: 1, pageSize: 500 }).rows;
    for (let i = 1; i < asc.length; i++) expect(asc[i]!.typicalGapDays).toBeGreaterThanOrEqual(asc[i - 1]!.typicalGapDays);
    const ids = queryEvidence(rows, { filter: 'all', sortKey: 'customerId', direction: 'desc', page: 1, pageSize: 3 }).rows.map((r) => r.customerId);
    expect(ids).toEqual([...rows.map((r) => r.customerId)].sort().reverse().slice(0, 3));
  });

  it('paginates with bounded, clamped pages', () => {
    const q = { filter: 'all', sortKey: 'customerId', direction: 'asc', pageSize: 10 } as const;
    const first = queryEvidence(rows, { ...q, page: 1 });
    expect(first.rows).toHaveLength(10);
    expect(first.pageCount).toBe(Math.ceil(rows.length / 10));
    expect(queryEvidence(rows, { ...q, page: 999 }).page).toBe(first.pageCount);
    expect(queryEvidence(rows, { ...q, page: -3 }).page).toBe(1);
    expect(queryEvidence([] as ScoredRegular[], { ...q, page: 1 })).toEqual({ rows: [], total: 0, page: 1, pageCount: 1 });
  });
});
