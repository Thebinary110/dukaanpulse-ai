import { describe, expect, it } from 'vitest';
import { simulateCampaign, simulateProfitRange, splitTreatmentHoldout } from '../simulator';
import { campaignEconomics } from '../financials';
import { cohort, makeDraft } from './fixtures';

describe('treatment / holdout split', () => {
  const ids = Array.from({ length: 41 }, (_, i) => `C-${i}`);

  it('is disjoint, complete and sized by the holdout share', () => {
    const { treatmentIds, holdoutIds } = splitTreatmentHoldout(ids, 0.2, 7);
    expect(holdoutIds).toHaveLength(8);
    expect(treatmentIds).toHaveLength(33);
    expect(treatmentIds.filter((id) => holdoutIds.includes(id))).toEqual([]);
    expect([...treatmentIds, ...holdoutIds].sort()).toEqual([...ids].sort());
  });

  it('is deterministic and independent of input order', () => {
    expect(splitTreatmentHoldout(ids, 0.2, 7)).toEqual(splitTreatmentHoldout([...ids].reverse(), 0.2, 7));
    expect(splitTreatmentHoldout(ids, 0.2, 7)).not.toEqual(splitTreatmentHoldout(ids, 0.2, 8));
  });

  it('keeps both groups non-empty and rejects unusable input', () => {
    const tiny = splitTreatmentHoldout(['a', 'b'], 0.9, 1);
    expect(tiny.treatmentIds).toHaveLength(1);
    expect(tiny.holdoutIds).toHaveLength(1);
    expect(() => splitTreatmentHoldout(['a'], 0.2, 1)).toThrow();
    expect(() => splitTreatmentHoldout(ids, 0, 1)).toThrow();
    expect(() => splitTreatmentHoldout(ids, 1, 1)).toThrow();
  });
});

describe('campaign simulation', () => {
  const { ids, baskets } = cohort(200);
  const split = splitTreatmentHoldout(ids, 0.2, 3);
  const draft = makeDraft({ ...split });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(simulateCampaign(draft, baskets, 11)).toEqual(simulateCampaign(draft, baskets, 11));
    expect(simulateCampaign(draft, baskets, 11)).not.toEqual(simulateCampaign(draft, baskets, 12));
  });

  it('is always labelled as a simulation', () => {
    expect(simulateCampaign(draft, baskets, 1).simulated).toBe(true);
  });

  it('keeps treatment and holdout separate: only treatment receives offers or messages', () => {
    for (let seed = 0; seed < 25; seed++) {
      const o = simulateCampaign(draft, baskets, seed);
      expect(o.treatment.customers).toBe(split.treatmentIds.length);
      expect(o.holdout.customers).toBe(split.holdoutIds.length);
      expect(o.holdout.redeemed).toBe(0);
      expect(o.offerCostPaise).toBe(o.treatment.redeemed * draft.offer.costPerRedemptionPaise);
      expect(o.messageCostPaise).toBe(split.treatmentIds.length * draft.assumptions.messageCostPaise);
      expect(o.treatment.redeemed).toBeLessThanOrEqual(o.treatment.returned);
      expect(o.liftRate).toBeCloseTo(o.treatmentReturnRate - o.holdoutReturnRate);
      expect(o.netIncrementalProfitPaise).toBeCloseTo(o.incrementalMarginPaise - o.offerCostPaise - o.messageCostPaise);
    }
  });

  it('produces a cumulative daily timeline that ends at the number of returners', () => {
    const o = simulateCampaign(draft, baskets, 5);
    expect(o.dailyTreatmentReturns).toHaveLength(draft.assumptions.windowDays);
    for (let i = 1; i < o.dailyTreatmentReturns.length; i++) {
      expect(o.dailyTreatmentReturns[i]).toBeGreaterThanOrEqual(o.dailyTreatmentReturns[i - 1]!);
    }
    expect(o.dailyTreatmentReturns.at(-1)).toBe(o.treatment.returned);
  });

  it('refuses overlapping or empty groups', () => {
    expect(() => simulateCampaign(makeDraft({ treatmentIds: ['C-00001'], holdoutIds: ['C-00001'] }), baskets, 1)).toThrow(/both groups/);
    expect(() => simulateCampaign(makeDraft({ treatmentIds: ids, holdoutIds: [] }), baskets, 1)).toThrow();
  });

  it('refuses customers without a basket estimate', () => {
    expect(() => simulateCampaign(makeDraft({ treatmentIds: ['X'], holdoutIds: ['Y'], assumedReturnRate: 2 }), baskets, 1)).toThrow(/basket/);
  });
});

describe('profit range', () => {
  const { ids, baskets } = cohort(200);
  const draft = makeDraft({ ...splitTreatmentHoldout(ids, 0.2, 3) });

  it('returns ordered, deterministic P10/P50/P90', () => {
    const r = simulateProfitRange(draft, baskets, 99, 300);
    expect(r.p10Paise).toBeLessThanOrEqual(r.p50Paise);
    expect(r.p50Paise).toBeLessThanOrEqual(r.p90Paise);
    expect(r.probabilityProfitable).toBeGreaterThanOrEqual(0);
    expect(r.probabilityProfitable).toBeLessThanOrEqual(1);
    expect(simulateProfitRange(draft, baskets, 99, 300)).toEqual(r);
  });

  it('centres near the expected-value model on a large cohort', () => {
    const big = cohort(5000);
    const bigDraft = makeDraft({ ...splitTreatmentHoldout(big.ids, 0.5, 3) });
    const r = simulateProfitRange(bigDraft, big.baskets, 4, 200);
    const expected = campaignEconomics({
      customers: bigDraft.treatmentIds.length,
      averageBasketPaise: 25_000,
      offer: bigDraft.offer,
      assumedReturnRate: bigDraft.assumedReturnRate,
      assumptions: bigDraft.assumptions,
    }).netIncrementalProfitPaise;
    expect(Math.abs(r.p50Paise - expected) / Math.abs(expected)).toBeLessThan(0.15);
  });
});
