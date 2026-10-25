/**
 * Intervention comparison and recommendation for an opportunity.
 *
 * Deterministic expected values only (see financials.ts for the formulas). Random
 * simulation is reserved for the campaign's simulated execution.
 *
 * Ranking policy:
 * 1. Every option, including "do nothing", is evaluated with the same assumptions.
 *    "Do nothing" is the benchmark: zero cost, zero incremental profit.
 * 2. Objective "profit": rank by expected net incremental profit.
 *    Objective "customers": rank by expected incremental returning customers among
 *    options that at least break even; options that lose money rank below them.
 * 3. If no action is expected to make a profit (net > 0), "do nothing" is recommended.
 * 4. The recommendation is marked "close" when the runner-up action scores within
 *    CLOSE_MARGIN of it, or when it would lose money if the uplift were half of what is
 *    assumed (DOWNSIDE_UPLIFT_FACTOR). Otherwise it is "clear".
 */
import { campaignEconomics, type CampaignEconomics } from './financials';
import { formatCount, formatINR, formatPercent } from './format';
import { describeOffer, INTERVENTIONS, returnRateWithUplift } from './interventions';
import type { CampaignAssumptions, Intervention, Offer, OfferKind } from './types';

export const CLOSE_MARGIN = 0.15;
export const DOWNSIDE_UPLIFT_FACTOR = 0.5;

export type Objective = 'profit' | 'customers';

/** Editable values for one option. Money in paise; uplift as a fraction. */
export interface OptionSettings {
  valuePaise: number;
  costPerRedemptionPaise: number;
  minSpendPaise: number;
  uplift: number;
}

export interface DecisionSettings {
  assumptions: CampaignAssumptions;
  options: Record<string, OptionSettings>;
}

export function defaultDecisionSettings(assumptions: CampaignAssumptions, interventions: readonly Intervention[] = INTERVENTIONS): DecisionSettings {
  return {
    assumptions: { ...assumptions },
    options: Object.fromEntries(
      interventions.map((i) => [
        i.id,
        {
          valuePaise: i.offer.valuePaise,
          costPerRedemptionPaise: i.offer.costPerRedemptionPaise,
          minSpendPaise: i.offer.minSpendPaise,
          uplift: i.assumedUplift,
        },
      ]),
    ),
  };
}

/** The offer an option represents with its edited settings. A discount's cost is its face value. */
export function offerFor(kind: OfferKind, s: OptionSettings): Offer {
  if (kind === 'none') return { kind, valuePaise: 0, costPerRedemptionPaise: 0, minSpendPaise: 0 };
  if (kind === 'flat_discount') return { kind, valuePaise: s.valuePaise, costPerRedemptionPaise: s.valuePaise, minSpendPaise: s.minSpendPaise };
  return { kind, valuePaise: s.valuePaise, costPerRedemptionPaise: s.costPerRedemptionPaise, minSpendPaise: 0 };
}

// ── Input limits and validation ────────────────────────────────────────────

export interface Limit {
  min: number;
  max: number;
  step: number;
  /** Display unit of the bounds above. */
  unit: '₹' | '%' | 'visits';
}

/** Bounds in display units (₹, %, visits). Chosen to keep the model in a sensible range. */
export const LIMITS = {
  grossMarginRate: { min: 10, max: 90, step: 1, unit: '%' },
  baselineReturnRate: { min: 0, max: 60, step: 1, unit: '%' },
  redemptionRate: { min: 10, max: 100, step: 1, unit: '%' },
  messageCost: { min: 0, max: 5, step: 0.05, unit: '₹' },
  followOnVisits: { min: 0, max: 6, step: 1, unit: 'visits' },
  uplift: { min: 0, max: 60, step: 1, unit: '%' },
  discount: { min: 5, max: 200, step: 5, unit: '₹' },
  minSpend: { min: 0, max: 1000, step: 10, unit: '₹' },
  rewardCost: { min: 0, max: 200, step: 0.5, unit: '₹' },
} as const satisfies Record<string, Limit>;

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/** Parses a user-typed number and checks it against a limit. Never returns NaN. */
export function parseBounded(raw: string, limit: Limit): ParseResult {
  const text = raw.trim().replace(/,/g, '');
  if (text === '') return { ok: false, error: 'Enter a value.' };
  if (!/^-?\d*\.?\d+$/.test(text)) return { ok: false, error: 'Enter a number.' };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter a number.' };
  const fmt = (n: number) => (limit.unit === '₹' ? `₹${n}` : limit.unit === '%' ? `${n}%` : `${n}`);
  if (value < limit.min || value > limit.max) return { ok: false, error: `Use ${fmt(limit.min)} to ${fmt(limit.max)}.` };
  if (limit.unit === 'visits' && !Number.isInteger(value)) return { ok: false, error: 'Use a whole number.' };
  return { ok: true, value };
}

/** Cross-field checks on an option; returns problems in plain language. */
export function optionProblems(kind: OfferKind, s: OptionSettings, averageBasketPaise: number): string[] {
  const problems: string[] = [];
  if (kind === 'flat_discount') {
    const bill = Math.max(averageBasketPaise, s.minSpendPaise);
    if (s.valuePaise >= bill) problems.push('The discount is as large as the typical bill.');
    else if (s.minSpendPaise > 0 && s.valuePaise > s.minSpendPaise / 2) problems.push('The discount is more than half the minimum spend.');
  }
  return problems;
}

// ── Evaluation and ranking ─────────────────────────────────────────────────

export interface OptionEvaluation {
  intervention: Intervention;
  offer: Offer;
  offerLabel: string;
  uplift: number;
  returnRate: number;
  economics: CampaignEconomics;
  /** Net incremental profit if the uplift is DOWNSIDE_UPLIFT_FACTOR of the assumption. */
  downsideNetProfitPaise: number;
  /** Break-even expressed as redemptions (returners who use the offer). */
  breakEvenRedemptions: number;
  problems: string[];
}

export interface EvaluationInput {
  /** Customers who would receive the offer (the treatment group). */
  customers: number;
  averageBasketPaise: number;
  settings: DecisionSettings;
  interventions?: readonly Intervention[];
}

export function evaluateOptions({ customers, averageBasketPaise, settings, interventions = INTERVENTIONS }: EvaluationInput): OptionEvaluation[] {
  const { assumptions } = settings;
  return interventions.map((intervention) => {
    const s = settings.options[intervention.id];
    if (!s) throw new Error(`No settings for intervention ${intervention.id}`);
    const offer = offerFor(intervention.offer.kind, s);
    const uplift = intervention.offer.kind === 'none' ? 0 : s.uplift;
    const returnRate = returnRateWithUplift(assumptions.baselineReturnRate, uplift);
    const economics = campaignEconomics({ customers, averageBasketPaise, offer, assumedReturnRate: returnRate, assumptions });
    const downside = campaignEconomics({
      customers,
      averageBasketPaise,
      offer,
      assumedReturnRate: returnRateWithUplift(assumptions.baselineReturnRate, uplift * DOWNSIDE_UPLIFT_FACTOR),
      assumptions,
    });
    const redemptionRate = offer.kind === 'none' ? 0 : assumptions.redemptionRate;
    return {
      intervention,
      offer,
      offerLabel: describeOffer(offer),
      uplift,
      returnRate,
      economics,
      downsideNetProfitPaise: downside.netIncrementalProfitPaise,
      breakEvenRedemptions: economics.breakEvenReturners * redemptionRate,
      problems: optionProblems(offer.kind, s, averageBasketPaise),
    };
  });
}

export type Reliability = 'clear' | 'close' | 'none_profitable';

export interface Recommendation {
  objective: Objective;
  /** Intervention IDs, best first. */
  ranking: string[];
  recommendedId: string;
  reliability: Reliability;
  /** Plain-language reasons built from the numbers. */
  reasons: string[];
}

const isAction = (e: OptionEvaluation) => e.offer.kind !== 'none';

function score(e: OptionEvaluation, objective: Objective): number {
  return objective === 'profit' ? e.economics.netIncrementalProfitPaise : e.economics.expectedIncrementalReturners;
}

export function recommend(evaluations: readonly OptionEvaluation[], objective: Objective): Recommendation {
  const valid = evaluations.filter((e) => e.problems.length === 0);
  const eligible = (e: OptionEvaluation) => objective === 'profit' || e.economics.netIncrementalProfitPaise >= 0;
  const ordered = [...valid].sort((a, b) => {
    const ea = eligible(a);
    const eb = eligible(b);
    if (ea !== eb) return ea ? -1 : 1;
    const diff = ea ? score(b, objective) - score(a, objective) : b.economics.netIncrementalProfitPaise - a.economics.netIncrementalProfitPaise;
    if (diff !== 0) return diff;
    // Ties: prefer cheaper (do nothing first), then stable order.
    return a.economics.totalCostPaise - b.economics.totalCostPaise || evaluations.indexOf(a) - evaluations.indexOf(b);
  });
  const invalid = evaluations.filter((e) => e.problems.length > 0);
  const ranking = [...ordered, ...invalid].map((e) => e.intervention.id);

  const nothing = evaluations.find((e) => !isAction(e));
  const bestAction = ordered.find((e) => isAction(e) && e.economics.netIncrementalProfitPaise > 0);
  if (!bestAction) {
    if (!nothing) throw new Error('A "do nothing" option is required as the benchmark');
    return {
      objective,
      ranking: [nothing.intervention.id, ...ranking.filter((id) => id !== nothing.intervention.id)],
      recommendedId: nothing.intervention.id,
      reliability: 'none_profitable',
      reasons: [
        'Under these assumptions, no offer is expected to earn back what it costs.',
        'Doing nothing avoids spending on customers who might return anyway. Revisit the assumptions, or wait and watch.',
      ],
    };
  }

  const top = objective === 'profit' ? bestAction : ordered[0]!;
  const runnerUp = ordered.find((e) => e !== top && isAction(e));
  const e = top.economics;
  const reasons: string[] = [];

  if (objective === 'profit') {
    reasons.push(
      `Highest expected net profit: ${formatINR(e.netIncrementalProfitPaise)}` +
        (runnerUp ? `, against ${formatINR(runnerUp.economics.netIncrementalProfitPaise)} for ${runnerUp.intervention.label.toLowerCase()}.` : '.'),
    );
  } else {
    reasons.push(
      `Brings back the most customers who would not otherwise return: about ${formatCount(e.expectedIncrementalReturners)}` +
        (runnerUp ? `, against ${formatCount(runnerUp.economics.expectedIncrementalReturners)} for ${runnerUp.intervention.label.toLowerCase()}.` : '.'),
    );
  }
  reasons.push(
    Number.isFinite(e.breakEvenReturnRate)
      ? `Pays back if at least ${formatPercent(e.breakEvenReturnRate, { decimals: 0 })} come back, against an assumed ${formatPercent(top.returnRate, { decimals: 0 })}.`
      : 'Each redemption costs more than it earns, so it never pays back.',
  );
  reasons.push(
    `Offer cost about ${formatINR(e.offerCostPaise)}, including discounts for customers who would have come back anyway.`,
  );
  reasons.push(
    top.downsideNetProfitPaise >= 0
      ? `If the offer works only half as well as assumed, it still makes about ${formatINR(top.downsideNetProfitPaise)}.`
      : `If the offer works only half as well as assumed, it would lose about ${formatINR(-top.downsideNetProfitPaise)}.`,
  );

  const topScore = score(top, objective);
  const close =
    top.downsideNetProfitPaise < 0 ||
    (runnerUp !== undefined && eligible(runnerUp) && topScore > 0 && (topScore - score(runnerUp, objective)) / topScore < CLOSE_MARGIN);
  if (close && runnerUp) {
    reasons.push(`This is a close call with ${runnerUp.intervention.label.toLowerCase()}; small changes in the assumptions could swap them.`);
  }

  return {
    objective,
    ranking: [top.intervention.id, ...ranking.filter((id) => id !== top.intervention.id)],
    recommendedId: top.intervention.id,
    reliability: close ? 'close' : 'clear',
    reasons,
  };
}
