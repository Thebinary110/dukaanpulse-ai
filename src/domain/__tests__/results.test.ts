import { describe, expect, it } from 'vitest';
import { averageBasketOf, basketByCustomer, createCampaignDraft, estimateDraft, planAudience } from '../campaign';
import { summarizeLapsedOpportunity } from '../detectors/lapsedSummary';
import { generateDataset } from '../generator';
import { DEFAULT_ASSUMPTIONS, getIntervention } from '../interventions';
import {
  buildLearningRecord,
  compareEstimateToOutcome,
  divergenceReasons,
  rateMetric,
  recommendNextStep,
  resultMetrics,
  REVISE_BELOW_PROFITABLE_SHARE,
  type LearningRecord,
} from '../results';
import { deriveSeed } from '../rng';
import { simulateCampaign, simulateProfitRange } from '../simulator';
import { histogram, normalCdf, percentileRank, sampleSizePerGroup, twoProportionPower, wilsonInterval } from '../stats';
import { cohort, makeDraft } from './fixtures';

describe('statistics helpers', () => {
  it('computes the normal CDF', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 4);
  });

  it('gives Wilson intervals that stay inside [0, 1], including for 0 of n', () => {
    const zero = wilsonInterval(0, 7);
    expect(zero.low).toBe(0);
    expect(zero.high).toBeCloseTo(0.354, 2);
    const some = wilsonInterval(4, 27);
    expect(some.low).toBeCloseTo(0.059, 2);
    expect(some.high).toBeCloseTo(0.325, 2);
    expect(wilsonInterval(5, 5).high).toBe(1);
  });

  it('matches the textbook sample size and power for 10% vs 30%', () => {
    expect(sampleSizePerGroup(0.3, 0.1)).toBe(62);
    expect(twoProportionPower(0.3, 0.1, 62, 62)).toBeCloseTo(0.8, 1);
    expect(twoProportionPower(0.3, 0.1, 27, 7)).toBeLessThan(0.3);
    expect(twoProportionPower(0.2, 0.2, 100, 100)).toBe(0);
    expect(sampleSizePerGroup(0.2, 0.2)).toBe(Number.POSITIVE_INFINITY);
  });

  it('ranks and bins values', () => {
    const sorted = [1, 2, 2, 3, 10];
    expect(percentileRank(sorted, 2)).toBe(0.6);
    expect(percentileRank(sorted, 0)).toBe(0);
    expect(percentileRank(sorted, 99)).toBe(1);
    const bins = histogram([0, 1, 2, 3, 4], 2);
    expect(bins.map((b) => b.count)).toEqual([2, 3]);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(histogram([], 4)).toEqual([]);
  });
});

// A record built the same way the app builds one.
const { ids, baskets } = cohort(34, 22_000);
const draft = makeDraft({ ...planAudience(ids, 7) });
const outcome = simulateCampaign(draft, baskets, 99);
const approval = { at: '2026-10-26T10:00:00.000Z', approvedBy: 'Owner (demo)' };
const record = buildLearningRecord({ draft, outcome, approval, completedAt: '2026-10-26T10:01:00.000Z', averageBasketPaise: 22_000, basketByCustomer: baskets });

describe('learning record', () => {
  it('freezes the estimate from the approved draft, independent of the outcome', () => {
    const e = estimateDraft(draft, 22_000);
    expect(record.estimate.netIncrementalProfitPaise).toBe(e.economics.netIncrementalProfitPaise);
    expect(record.estimate.expectedReturners).toBe(e.economics.expectedReturners);
    expect(record.estimate.expectedHoldoutReturners).toBeCloseTo(draft.holdoutIds.length * draft.assumptions.baselineReturnRate);
    const other = buildLearningRecord({ draft, outcome: simulateCampaign(draft, baskets, 7), approval, completedAt: 'x', averageBasketPaise: 22_000, basketByCustomer: baskets });
    expect(other.estimate).toEqual(record.estimate);
  });

  it('is deterministic and uses the existing simulator for its range', () => {
    const again = buildLearningRecord({ draft, outcome, approval, completedAt: '2026-10-26T10:01:00.000Z', averageBasketPaise: 22_000, basketByCustomer: baskets });
    expect(again).toEqual(record);
    expect(record.range).toEqual(simulateProfitRange(draft, baskets, deriveSeed(outcome.seed, 'range'), 500));
    expect(record.bins.reduce((s, b) => s + b.count, 0)).toBe(500);
    expect(record.id).toBe(`${approval.at}|${outcome.seed}`);
  });
});

describe('result metrics', () => {
  const m = resultMetrics(record);

  it('reports every rate with its actual denominator', () => {
    expect(m.treatment.denominator).toBe(draft.treatmentIds.length);
    expect(m.holdout.denominator).toBe(draft.holdoutIds.length);
    expect(m.treatment.count).toBe(outcome.treatment.returned);
    expect(m.treatment.rate).toBeCloseTo(outcome.treatment.returned / draft.treatmentIds.length);
    expect(m.treatment.interval.low).toBeLessThanOrEqual(m.treatment.rate);
    expect(m.treatment.interval.high).toBeGreaterThanOrEqual(m.treatment.rate);
  });

  it('derives lift, incremental returners and spend from the outcome', () => {
    expect(m.liftRate).toBeCloseTo(outcome.treatmentReturnRate - outcome.holdoutReturnRate);
    expect(m.simulatedIncrementalReturners).toBeCloseTo(m.liftRate * draft.treatmentIds.length);
    expect(m.spendPaise).toBe(outcome.offerCostPaise + outcome.messageCostPaise);
    expect(m.netPaise).toBe(outcome.netIncrementalProfitPaise);
  });

  it('flags the small holdout and reports low power honestly', () => {
    expect(m.smallSample).toBe(true);
    expect(m.holdoutRateStep).toBeCloseTo(1 / draft.holdoutIds.length);
    expect(m.powerForAssumedLift).toBeLessThan(0.8);
    expect(m.requiredPerGroup).toBe(sampleSizePerGroup(draft.assumedReturnRate, draft.assumptions.baselineReturnRate));
  });

  it('rejects impossible rates', () => {
    expect(() => rateMetric(3, 0)).toThrow();
    expect(() => rateMetric(8, 7)).toThrow();
    expect(() => rateMetric(-1, 7)).toThrow();
  });
});

describe('estimate versus outcome', () => {
  it('lists estimate, simulated value and difference for each metric', () => {
    const rows = compareEstimateToOutcome(record);
    expect(rows.map((r) => r.key)).toEqual(['treatment_returners', 'holdout_returners', 'incremental_returners', 'spend', 'net']);
    for (const r of rows) expect(r.difference).toBeCloseTo(r.simulated - r.estimate);
    const net = rows.find((r) => r.key === 'net')!;
    expect(net.estimate).toBe(record.estimate.netIncrementalProfitPaise);
    expect(net.simulated).toBe(outcome.netIncrementalProfitPaise);
    expect(rows.find((r) => r.key === 'holdout_returners')!.denominator).toBe(draft.holdoutIds.length);
  });

  it('explains divergence with the run percentile, small samples, counts and drawn rates', () => {
    const reasons = divergenceReasons(record);
    expect(reasons[0]).toMatch(/^Random variation/);
    expect(reasons.some((r) => r.startsWith('Small groups'))).toBe(true);
    expect(reasons.some((r) => r.includes(`${outcome.treatment.returned} of ${outcome.treatment.customers}`))).toBe(true);
    expect(reasons.at(-1)).toMatch(/This run drew an underlying offer return rate/);
  });
});

describe('recommendNextStep', () => {
  const withRange = (patch: Partial<LearningRecord['range']>, estimate: Partial<LearningRecord['estimate']> = {}): LearningRecord => ({
    ...record,
    range: { ...record.range, ...patch },
    estimate: { ...record.estimate, ...estimate },
  });

  it('stops when the median simulated run loses money (rule 1)', () => {
    const r = recommendNextStep(withRange({ p50Paise: -100, probabilityProfitable: 0.3 }));
    expect(r).toMatchObject({ decision: 'stop', rule: 1, title: 'Stop this campaign' });
  });

  it('revises the offer when the downside loses money or few runs profit (rule 2)', () => {
    expect(recommendNextStep(withRange({ p50Paise: 50_000, probabilityProfitable: 0.9 }, { downsideNetProfitPaise: -1 })).decision).toBe('revise_offer');
    expect(recommendNextStep(withRange({ p50Paise: 50_000, probabilityProfitable: REVISE_BELOW_PROFITABLE_SHARE - 0.01 }, { downsideNetProfitPaise: 100 })).decision).toBe(
      'revise_offer',
    );
  });

  it('otherwise repeats with a larger test, citing the sample size needed (rule 3)', () => {
    const r = recommendNextStep(withRange({ p50Paise: 50_000, probabilityProfitable: 0.9 }, { downsideNetProfitPaise: 100 }));
    expect(r).toMatchObject({ decision: 'repeat_larger', rule: 3 });
    expect(r.reasons.join(' ')).toMatch(/too small to confirm the assumed lift/);
    expect(r.reasons.join(' ')).toMatch(/customers per group are needed/);
  });

  it('does not let the single simulated run override the rules', () => {
    const lossyRun = { ...record, outcome: { ...record.outcome, netIncrementalProfitPaise: -999_999 } };
    const r = recommendNextStep({ ...lossyRun, range: { ...record.range, p50Paise: 50_000, probabilityProfitable: 0.9 }, estimate: { ...record.estimate, downsideNetProfitPaise: 100 } });
    expect(r.decision).toBe('repeat_larger');
  });

  it('recommends a larger test for the default demo campaign', () => {
    const { dataset } = generateDataset();
    const s = summarizeLapsedOpportunity(dataset.transactions, dataset.asOfDay);
    if (s.status !== 'found') throw new Error();
    const audience = planAudience(s.opportunity.cohort.map((c) => c.customerId), dataset.seed);
    const b = basketByCustomer(s.opportunity.cohort);
    const d = createCampaignDraft({
      opportunityId: s.opportunity.id,
      interventionId: 'win-back-30',
      offer: getIntervention('win-back-30').offer,
      uplift: getIntervention('win-back-30').assumedUplift,
      assumptions: DEFAULT_ASSUMPTIONS,
      audience,
      merchantName: dataset.merchant.name,
      name: 'Win back morning regulars',
    });
    const o = simulateCampaign(d, b, 1234);
    const rec = buildLearningRecord({ draft: d, outcome: o, approval, completedAt: 'x', averageBasketPaise: averageBasketOf(b, d.treatmentIds), basketByCustomer: b });
    expect(recommendNextStep(rec).decision).toBe('repeat_larger');
  });
});
