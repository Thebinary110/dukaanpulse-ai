import { describe, expect, it } from 'vitest';
import { DEFAULT_LAPSED_CONFIG, detectLapsedRegulars, scoreRegulars } from '../detectors/lapsedRegulars';
import { evaluateDetector } from '../detectors/evaluate';
import { tx, visitsEvery } from './fixtures';

const AS_OF = 100;

describe('lapsed-regular detector on hand-built customers', () => {
  // Visits every 2 days on days 0..78, then nothing: 40 visit-days over a 78-day span.
  const lapsed = visitsEvery('LAPSED', 2, 0, 80);
  // Same habit, still coming.
  const steady = visitsEvery('STEADY', 2, 0, 100);
  // Comes every 10 days (0.7/week): not a regular, so a long gap is ordinary for them.
  const occasional = visitsEvery('OCCASIONAL', 10, 0, 70);
  // Frequent but only for 3 weeks of history: too little to estimate a habit.
  const newcomer = visitsEvery('NEWCOMER', 1, 50, 70);
  const scored = scoreRegulars([...lapsed, ...steady, ...occasional, ...newcomer], AS_OF);
  const byId = new Map(scored.map((s) => [s.customerId, s]));

  it('flags a regular whose current gap is improbable given their own rate', () => {
    const s = byId.get('LAPSED')!;
    expect(s.visitDays).toBe(40);
    expect(s.weeklyVisitRate).toBeCloseTo((39 / 78) * 7);
    expect(s.currentGapDays).toBe(22); // last visit day 78, as of day 100
    expect(s.gapProbability).toBeCloseTo(Math.pow(1 - 39 / 78, 21));
    expect(s.flagged).toBe(true);
  });

  it('does not flag a regular who is still visiting', () => {
    expect(byId.get('STEADY')!.flagged).toBe(false);
  });

  it('does not test infrequent customers or customers with too little history', () => {
    expect(byId.has('OCCASIONAL')).toBe(false);
    expect(byId.has('NEWCOMER')).toBe(false);
  });

  it('ignores gaps shorter than the minimum even when improbable', () => {
    // Daily visitor absent for 10 days: probability is tiny but below the 14-day floor.
    const daily = visitsEvery('DAILY', 1, 0, 90);
    const s = scoreRegulars(daily, AS_OF)[0]!;
    expect(s.gapProbability).toBeLessThan(DEFAULT_LAPSED_CONFIG.probabilityThreshold);
    expect(s.currentGapDays).toBeLessThan(DEFAULT_LAPSED_CONFIG.minGapDays);
    expect(s.flagged).toBe(false);
  });

  it('ignores transactions on or after the as-of day', () => {
    const withFuture = [...lapsed, tx('LAPSED', AS_OF, 200), tx('LAPSED', AS_OF + 5, 200)];
    expect(scoreRegulars(withFuture, AS_OF)[0]!.currentGapDays).toBe(22);
  });

  it('returns null when nobody is flagged', () => {
    expect(detectLapsedRegulars(steady, AS_OF)).toBeNull();
  });

  it('builds an opportunity with at-risk revenue and a transparent method', () => {
    const opp = detectLapsedRegulars([...lapsed, ...steady], AS_OF)!;
    expect(opp.cohort.map((c) => c.customerId)).toEqual(['LAPSED']);
    expect(opp.regularsTested).toBe(2);
    expect(opp.expectedFalseAlarms).toBeCloseTo(0.02);
    // 0.5 visits/day × 30 days × ₹200 = ₹3,000/month
    expect(opp.atRiskMonthlyRevenuePaise).toBeCloseTo(300_000);
    expect(opp.method).toEqual(DEFAULT_LAPSED_CONFIG);
    expect(opp.confidence.level).toBe('low'); // a cohort of one is not actionable
  });
});

describe('lapsed-regular detector against the planted signal', () => {
  // The detector never sees ground truth; these seeds were not used to choose its settings.
  const seeds = [20261020, 1, 2, 3, 42];
  const results = seeds.map((seed) => evaluateDetector({ seed }));

  it.each(results)('seed $seed: finds most planted lapses with few false alarms', (r) => {
    expect(r.recall).toBeGreaterThanOrEqual(0.7);
    expect(r.recallFullyAbsent).toBeGreaterThanOrEqual(0.95);
    expect(r.falsePositiveRateAmongRegulars).toBeLessThanOrEqual(0.05);
    expect(r.falsePositiveRate).toBeLessThanOrEqual(0.01);
  });

  it('produces false alarms in line with what chance predicts', () => {
    const totalFalse = results.reduce((s, r) => s + r.falsePositives, 0);
    const totalExpected = results.reduce((s, r) => s + r.expectedFalseAlarms, 0);
    expect(totalFalse).toBeLessThanOrEqual(totalExpected * 2);
  });

  it('reports high confidence on the default demo dataset', async () => {
    const { generateDataset } = await import('../generator');
    const { dataset } = generateDataset();
    expect(detectLapsedRegulars(dataset.transactions, dataset.asOfDay)?.confidence.level).toBe('high');
  });
});
