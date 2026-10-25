/**
 * Treatment-versus-holdout campaign simulator.
 *
 * SIMULATION ONLY. No message is sent and no money moves. Outcomes come from
 * the campaign's stated assumptions plus random variation, never from
 * observed customer behaviour.
 *
 * Each run:
 * 1. Draws this run's actual return rates around the assumptions (±30% for the
 *    offer, ±20% for baseline) because the assumptions themselves are uncertain.
 * 2. For every customer, draws whether they return within the window, on which
 *    day (earlier days are more likely), their basket, and, for treated
 *    customers, whether they redeem the offer.
 * 3. Measures lift the way a real test would: the treatment group against the
 *    holdout group, which received nothing.
 */
import { createRng, deriveSeed, type Rng } from './rng';
import { messageCostPerCustomer, redeemingBasketPaise } from './financials';
import { quantile } from './stats';
import type { CampaignDraft, GroupOutcome, ProfitRange, SimulatedOutcome } from './types';

export const OFFER_RATE_UNCERTAINTY = 0.3;
export const BASELINE_RATE_UNCERTAINTY = 0.2;
const BASKET_LOG_SD = 0.2;
/** Shape > 1 front-loads return days toward the start of the window. */
const RETURN_DAY_SKEW = 1.6;

export interface Split {
  treatmentIds: string[];
  holdoutIds: string[];
}

/**
 * Deterministic random split. The result depends only on the set of IDs and
 * the seed, not on input order. Requires at least two customers so both
 * groups are non-empty.
 */
export function splitTreatmentHoldout(customerIds: readonly string[], holdoutShare: number, seed: number): Split {
  const unique = [...new Set(customerIds)].sort();
  if (unique.length < 2) throw new Error('Need at least two customers to form treatment and holdout groups');
  if (!(holdoutShare > 0 && holdoutShare < 1)) throw new Error('holdoutShare must be between 0 and 1');
  const shuffled = createRng(deriveSeed(seed, 'split')).shuffle(unique);
  const holdoutCount = Math.min(unique.length - 1, Math.max(1, Math.round(unique.length * holdoutShare)));
  return {
    holdoutIds: shuffled.slice(0, holdoutCount).sort(),
    treatmentIds: shuffled.slice(holdoutCount).sort(),
  };
}

function clampRate(r: number): number {
  return Math.min(1, Math.max(0, r));
}

function basketFor(rng: Rng, basketByCustomer: ReadonlyMap<string, number>, id: string): number {
  const typical = basketByCustomer.get(id);
  if (typical === undefined) throw new Error(`No basket estimate for customer ${id}`);
  return Math.round(typical * Math.exp(rng.normal(0, BASKET_LOG_SD)));
}

export function simulateCampaign(
  draft: CampaignDraft,
  basketByCustomer: ReadonlyMap<string, number>,
  seed: number,
): SimulatedOutcome {
  const overlap = draft.treatmentIds.filter((id) => draft.holdoutIds.includes(id));
  if (overlap.length > 0) throw new Error(`Customers in both groups: ${overlap.join(', ')}`);
  if (draft.treatmentIds.length === 0 || draft.holdoutIds.length === 0) {
    throw new Error('Both treatment and holdout groups must be non-empty');
  }

  const { assumptions, offer } = draft;
  const rng = createRng(seed);
  const offerRate = clampRate(draft.assumedReturnRate * rng.uniform(1 - OFFER_RATE_UNCERTAINTY, 1 + OFFER_RATE_UNCERTAINTY));
  const baselineRate = clampRate(
    assumptions.baselineReturnRate * rng.uniform(1 - BASELINE_RATE_UNCERTAINTY, 1 + BASELINE_RATE_UNCERTAINTY),
  );
  const redemptionRate = offer.kind === 'none' ? 0 : assumptions.redemptionRate;

  const dailyReturns = new Array<number>(assumptions.windowDays).fill(0);
  const treatment: GroupOutcome = { customers: draft.treatmentIds.length, returned: 0, redeemed: 0, grossRevenuePaise: 0 };
  for (const id of draft.treatmentIds) {
    if (!rng.bernoulli(offerRate)) continue;
    treatment.returned += 1;
    dailyReturns[Math.floor(assumptions.windowDays * Math.pow(rng.next(), RETURN_DAY_SKEW))]! += 1;
    const basket = basketFor(rng, basketByCustomer, id);
    if (rng.bernoulli(redemptionRate)) {
      treatment.redeemed += 1;
      treatment.grossRevenuePaise += redeemingBasketPaise(basket, offer);
    } else {
      treatment.grossRevenuePaise += basket;
    }
  }

  const holdout: GroupOutcome = { customers: draft.holdoutIds.length, returned: 0, redeemed: 0, grossRevenuePaise: 0 };
  for (const id of draft.holdoutIds) {
    if (!rng.bernoulli(baselineRate)) continue;
    holdout.returned += 1;
    holdout.grossRevenuePaise += basketFor(rng, basketByCustomer, id);
  }

  // Lift is measured, as in a real test: treatment versus a holdout-based estimate of "no campaign".
  const holdoutRevenuePerCustomer = holdout.grossRevenuePaise / holdout.customers;
  const incrementalRevenuePaise = treatment.grossRevenuePaise - holdoutRevenuePerCustomer * treatment.customers;
  const incrementalMarginPaise = incrementalRevenuePaise * assumptions.grossMarginRate;
  const offerCostPaise = treatment.redeemed * offer.costPerRedemptionPaise;
  const messageCostPaise = treatment.customers * messageCostPerCustomer(offer, assumptions);

  let cumulative = 0;
  const dailyTreatmentReturns = dailyReturns.map((n) => (cumulative += n));

  const treatmentReturnRate = treatment.returned / treatment.customers;
  const holdoutReturnRate = holdout.returned / holdout.customers;
  return {
    simulated: true,
    seed,
    treatment,
    holdout,
    treatmentReturnRate,
    holdoutReturnRate,
    liftRate: treatmentReturnRate - holdoutReturnRate,
    incrementalRevenuePaise,
    incrementalMarginPaise,
    offerCostPaise,
    messageCostPaise,
    netIncrementalProfitPaise: incrementalMarginPaise - offerCostPaise - messageCostPaise,
    dailyTreatmentReturns,
  };
}

/** Distribution of net incremental profit over many seeded runs. */
export function simulateProfitRange(
  draft: CampaignDraft,
  basketByCustomer: ReadonlyMap<string, number>,
  seed: number,
  runs = 500,
): ProfitRange {
  if (runs < 1) throw new Error('runs must be at least 1');
  const profits: number[] = [];
  for (let i = 0; i < runs; i++) {
    profits.push(simulateCampaign(draft, basketByCustomer, deriveSeed(seed, `run-${i}`)).netIncrementalProfitPaise);
  }
  profits.sort((a, b) => a - b);
  return {
    runs,
    p10Paise: quantile(profits, 0.1),
    p50Paise: quantile(profits, 0.5),
    p90Paise: quantile(profits, 0.9),
    probabilityProfitable: profits.filter((p) => p > 0).length / runs,
  };
}
