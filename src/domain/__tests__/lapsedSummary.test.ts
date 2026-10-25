import { describe, expect, it } from 'vitest';
import { detectLapsedRegulars } from '../detectors/lapsedRegulars';
import { EVIDENCE_WEEKS, summarizeLapsedOpportunity } from '../detectors/lapsedSummary';
import { generateDataset } from '../generator';
import { visitsEvery } from './fixtures';

const AS_OF = 100;
const steady = visitsEvery('STEADY', 2, 0, 100);

describe('summarizeLapsedOpportunity', () => {
  it('reports no opportunity, with how many regulars were checked, when nobody is flagged', () => {
    const s = summarizeLapsedOpportunity(steady, AS_OF);
    expect(s).toMatchObject({ status: 'none', regularsTested: 1 });
  });

  it('names the daypart when most of the cohort visits then', () => {
    const txs = [
      ...visitsEvery('L1', 2, 0, 76, 200, 'morning'),
      ...visitsEvery('L2', 3, 0, 70, 300, 'morning'),
      ...visitsEvery('L3', 2, 1, 75, 250, 'evening'),
      ...steady,
    ];
    const s = summarizeLapsedOpportunity(txs, AS_OF);
    if (s.status !== 'found') throw new Error('expected an opportunity');
    expect(s.customers).toBe(3);
    expect(s.dominantDaypart).toBe('morning');
    expect(s.headline).toBe('Your morning regulars may be slipping away');
    // Last visits: L1 day 74 (gap 26), L2 day 69 (gap 31), L3 day 73 (gap 27)
    expect(s.shortestCurrentGapDays).toBe(26);
    expect(s.medianCurrentGapDays).toBe(27);
    expect(s.summary).toMatch(/^3 customers who used to pay about [\d.]+ times a week have not paid in at least 26 days\./);
    expect(s.pastMonthlySpendPaise).toBe(s.opportunity.atRiskMonthlyRevenuePaise);
    expect(s.daypartShares.morning + s.daypartShares.afternoon + s.daypartShares.evening).toBeCloseTo(1);
  });

  it('uses neutral wording when no daypart dominates, and handles a single customer', () => {
    const mixed = [
      ...visitsEvery('L1', 2, 0, 76, 200, 'morning'),
      ...visitsEvery('L2', 2, 0, 76, 200, 'afternoon'),
      ...visitsEvery('L3', 2, 0, 76, 200, 'evening'),
    ];
    const s = summarizeLapsedOpportunity(mixed, AS_OF);
    expect(s.status === 'found' && s.headline).toBe('Some of your regulars may be slipping away');

    const one = summarizeLapsedOpportunity(visitsEvery('L1', 2, 0, 76, 200, 'afternoon'), AS_OF);
    expect(one.status === 'found' && one.headline).toBe('Your afternoon regular may be slipping away');
    expect(one.status === 'found' && one.summary).toMatch(/^1 customer who .* has not paid/);
  });

  it('builds weekly visit evidence from the flagged customers only', () => {
    const txs = [...visitsEvery('L1', 2, 0, 76), ...steady];
    const s = summarizeLapsedOpportunity(txs, AS_OF);
    if (s.status !== 'found') throw new Error('expected an opportunity');
    expect(s.weeklyVisits).toHaveLength(EVIDENCE_WEEKS);
    const total = s.weeklyVisits.reduce((sum, w) => sum + w.visits, 0);
    const expected = new Set(txs.filter((t) => t.customerId === 'L1' && t.day >= AS_OF - 84).map((t) => t.day)).size;
    expect(total).toBe(expected);
    expect(s.weeklyVisits.at(-1)!.visits).toBe(0);
  });

  it('derives the demo headline and counts from the detector, not constants', () => {
    const { dataset } = generateDataset();
    const s = summarizeLapsedOpportunity(dataset.transactions, dataset.asOfDay);
    const opp = detectLapsedRegulars(dataset.transactions, dataset.asOfDay)!;
    if (s.status !== 'found') throw new Error('expected an opportunity');
    expect(s.customers).toBe(opp.cohort.length);
    expect(s.summary.startsWith(`${opp.cohort.length} customers`)).toBe(true);
    expect(s.dominantDaypart).toBe('morning');
    expect(s.shortestCurrentGapDays).toBeGreaterThanOrEqual(opp.method.minGapDays);
  });
});
