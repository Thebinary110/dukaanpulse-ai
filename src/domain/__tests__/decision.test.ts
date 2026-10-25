import { describe, expect, it } from 'vitest';
import { campaignEconomics } from '../financials';
import {
  defaultDecisionSettings,
  DOWNSIDE_UPLIFT_FACTOR,
  evaluateOptions,
  LIMITS,
  offerFor,
  optionProblems,
  parseBounded,
  recommend,
  type DecisionSettings,
} from '../decision';
import { DEFAULT_ASSUMPTIONS, INTERVENTIONS } from '../interventions';

const BASKET = 22_000; // ₹220
const N = 27;
const defaults = defaultDecisionSettings(DEFAULT_ASSUMPTIONS);
const evaluate = (settings: DecisionSettings = defaults) => evaluateOptions({ customers: N, averageBasketPaise: BASKET, settings });
const byId = (settings?: DecisionSettings) => Object.fromEntries(evaluate(settings).map((e) => [e.intervention.id, e]));

function withOption(id: string, patch: Partial<DecisionSettings['options'][string]>): DecisionSettings {
  return { ...defaults, options: { ...defaults.options, [id]: { ...defaults.options[id]!, ...patch } } };
}

describe('evaluateOptions', () => {
  it('evaluates every intervention with the shared economics model', () => {
    const evals = evaluate();
    expect(evals.map((e) => e.intervention.id)).toEqual(INTERVENTIONS.map((i) => i.id));
    for (const e of evals) {
      const expected = campaignEconomics({
        customers: N,
        averageBasketPaise: BASKET,
        offer: e.offer,
        assumedReturnRate: e.returnRate,
        assumptions: DEFAULT_ASSUMPTIONS,
      });
      expect(e.economics).toEqual(expected);
      expect(e.returnRate).toBeCloseTo(DEFAULT_ASSUMPTIONS.baselineReturnRate + e.uplift);
    }
  });

  it('matches hand-computed figures for the targeted discount', () => {
    const d = byId()['win-back-30']!;
    // rT = 10% + 20% = 30%. Revenue/returner = 0.85×₹220 + 0.15×₹220 + 1×₹220 = ₹440.
    // With: 27 × 0.3 × ₹440 = ₹3,564. Without: 27 × 0.1 × ₹220 × 2 = ₹1,188.
    expect(d.economics.revenueWithCampaignPaise).toBeCloseTo(356_400);
    expect(d.economics.revenueWithoutCampaignPaise).toBeCloseTo(118_800);
    // Margin 55% of ₹2,376 = ₹1,306.80; offer 27 × 0.3 × 0.85 × ₹30 = ₹206.55; messages 27 × ₹0.25 = ₹6.75.
    expect(d.economics.netIncrementalProfitPaise).toBeCloseTo(130_680 - 20_655 - 675);
    expect(d.breakEvenRedemptions).toBeCloseTo(d.economics.breakEvenReturners * DEFAULT_ASSUMPTIONS.redemptionRate);
  });

  it('treats "do nothing" as the zero benchmark', () => {
    const n = byId()['no-action']!;
    expect(n.returnRate).toBe(DEFAULT_ASSUMPTIONS.baselineReturnRate);
    expect(n.economics.netIncrementalProfitPaise).toBeCloseTo(0);
    expect(n.economics.totalCostPaise).toBe(0);
  });

  it('computes the downside at half the uplift', () => {
    const d = byId()['win-back-30']!;
    const half = campaignEconomics({
      customers: N,
      averageBasketPaise: BASKET,
      offer: d.offer,
      assumedReturnRate: DEFAULT_ASSUMPTIONS.baselineReturnRate + d.uplift * DOWNSIDE_UPLIFT_FACTOR,
      assumptions: DEFAULT_ASSUMPTIONS,
    });
    expect(d.downsideNetProfitPaise).toBeCloseTo(half.netIncrementalProfitPaise);
  });

  it('updates dependent values when assumptions change', () => {
    const before = byId()['win-back-30']!;
    const bigger = byId(withOption('win-back-30', { valuePaise: 6000 }))['win-back-30']!;
    expect(bigger.offer.costPerRedemptionPaise).toBe(6000);
    expect(bigger.economics.offerCostPaise).toBeCloseTo(before.economics.offerCostPaise * 2);
    expect(bigger.economics.breakEvenReturnRate).toBeGreaterThan(before.economics.breakEvenReturnRate);

    const lowMargin = byId({ ...defaults, assumptions: { ...defaults.assumptions, grossMarginRate: 0.3 } })['win-back-30']!;
    expect(lowMargin.economics.netIncrementalProfitPaise).toBeLessThan(before.economics.netIncrementalProfitPaise);

    const higherBaseline = byId({ ...defaults, assumptions: { ...defaults.assumptions, baselineReturnRate: 0.2 } })['win-back-30']!;
    expect(higherBaseline.returnRate).toBeCloseTo(0.4);
    expect(higherBaseline.economics.offerCostPaise).toBeGreaterThan(before.economics.offerCostPaise); // more subsidised returners

    const noFollowOn = byId({ ...defaults, assumptions: { ...defaults.assumptions, followOnVisits: 0 } })['win-back-30']!;
    expect(noFollowOn.economics.incrementalRevenuePaise).toBeCloseTo(N * 0.2 * BASKET);
  });

  it('uses the discount as its own cost and ignores minimum spend for other offers', () => {
    expect(offerFor('flat_discount', { valuePaise: 4000, costPerRedemptionPaise: 1, minSpendPaise: 25_000, uplift: 0.2 })).toEqual({
      kind: 'flat_discount',
      valuePaise: 4000,
      costPerRedemptionPaise: 4000,
      minSpendPaise: 25_000,
    });
    expect(offerFor('free_item', { valuePaise: 4000, costPerRedemptionPaise: 1400, minSpendPaise: 25_000, uplift: 0.1 }).minSpendPaise).toBe(0);
  });
});

describe('recommend', () => {
  it('ranks by expected net profit under the profit objective', () => {
    const evals = evaluate();
    const r = recommend(evals, 'profit');
    const profits = r.ranking.map((id) => evals.find((e) => e.intervention.id === id)!.economics.netIncrementalProfitPaise);
    expect(profits).toEqual([...profits].sort((a, b) => b - a));
    expect(r.recommendedId).toBe('win-back-30');
    expect(r.reliability).toBe('clear');
    expect(r.reasons[0]).toMatch(/^Highest expected net profit/);
  });

  it('ranks by incremental customers, among options that break even, under the customers objective', () => {
    const settings = withOption('free-addon', { uplift: 0.3 }); // cheaper and stronger pull
    const r = recommend(evaluate(settings), 'customers');
    expect(r.recommendedId).toBe('free-addon');
    expect(r.reasons[0]).toMatch(/^Brings back the most customers/);
  });

  it('excludes money-losing options from the top under the customers objective', () => {
    // At a 20% margin a ₹100 discount costs more than a returning customer earns, even with a big pull.
    const base = withOption('win-back-30', { valuePaise: 10_000, minSpendPaise: 0, uplift: 0.5 });
    const settings: DecisionSettings = { ...base, assumptions: { ...base.assumptions, grossMarginRate: 0.2, followOnVisits: 0 } };
    const evals = evaluate(settings);
    expect(evals.find((e) => e.intervention.id === 'win-back-30')!.economics.netIncrementalProfitPaise).toBeLessThan(0);
    expect(recommend(evals, 'customers').recommendedId).not.toBe('win-back-30');
  });

  it('recommends doing nothing when no option pays back', () => {
    const settings: DecisionSettings = {
      ...defaults,
      assumptions: { ...defaults.assumptions, grossMarginRate: 0.1, followOnVisits: 0, messageCostPaise: 200 },
    };
    const r = recommend(evaluate(settings), 'profit');
    expect(r.recommendedId).toBe('no-action');
    expect(r.reliability).toBe('none_profitable');
  });

  it('flags a close call when the runner-up is within the margin', () => {
    const d = byId()['win-back-30']!.economics.netIncrementalProfitPaise;
    // Tune the free add-on's uplift until it is just below the discount.
    let settings = defaults;
    for (let u = 0.14; u < 0.3; u += 0.005) {
      settings = withOption('free-addon', { uplift: u });
      const f = byId(settings)['free-addon']!.economics.netIncrementalProfitPaise;
      if (f > d * 0.9 && f < d) break;
    }
    const r = recommend(evaluate(settings), 'profit');
    expect(r.recommendedId).toBe('win-back-30');
    expect(r.reliability).toBe('close');
    expect(r.reasons.at(-1)).toMatch(/close call/);
  });

  it('leaves options with invalid settings out of the recommendation', () => {
    const settings = withOption('win-back-30', { valuePaise: 30_000, minSpendPaise: 0 });
    const evals = evaluate(settings);
    expect(evals.find((e) => e.intervention.id === 'win-back-30')!.problems.length).toBeGreaterThan(0);
    const r = recommend(evals, 'profit');
    expect(r.recommendedId).not.toBe('win-back-30');
    expect(r.ranking.at(-1)).toBe('win-back-30');
  });
});

describe('input validation', () => {
  it('accepts numbers within limits', () => {
    expect(parseBounded('30', LIMITS.discount)).toEqual({ ok: true, value: 30 });
    expect(parseBounded(' 1,000 ', LIMITS.minSpend)).toEqual({ ok: true, value: 1000 });
    expect(parseBounded('0.25', LIMITS.messageCost)).toEqual({ ok: true, value: 0.25 });
  });

  it.each([
    ['', LIMITS.discount, 'Enter a value.'],
    ['abc', LIMITS.discount, 'Enter a number.'],
    ['1e3', LIMITS.discount, 'Enter a number.'],
    ['NaN', LIMITS.discount, 'Enter a number.'],
    ['-5', LIMITS.discount, 'Use ₹5 to ₹200.'],
    ['95', LIMITS.grossMarginRate, 'Use 10% to 90%.'],
    ['1.5', LIMITS.followOnVisits, 'Use a whole number.'],
  ])('rejects %j', (raw, limit, error) => {
    expect(parseBounded(raw, limit)).toEqual({ ok: false, error });
  });

  it('flags discounts that are too large for the bill', () => {
    expect(optionProblems('flat_discount', { valuePaise: 3000, costPerRedemptionPaise: 0, minSpendPaise: 20_000, uplift: 0 }, BASKET)).toEqual([]);
    expect(optionProblems('flat_discount', { valuePaise: 12_000, costPerRedemptionPaise: 0, minSpendPaise: 20_000, uplift: 0 }, BASKET)).toHaveLength(1);
    expect(optionProblems('flat_discount', { valuePaise: 25_000, costPerRedemptionPaise: 0, minSpendPaise: 0, uplift: 0 }, BASKET)).toHaveLength(1);
  });
});
