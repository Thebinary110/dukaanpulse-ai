/**
 * Results & learning for a completed simulated campaign.
 *
 * Three kinds of numbers appear here and are kept apart:
 * - Observed: synthetic transaction history (e.g. the customers' average bill).
 * - Estimated: the expected-value model, frozen at completion from the approved draft.
 * - Simulated: one seeded simulated run, plus a distribution of many runs of the same
 *   configuration to show how much a single run can vary.
 * None of these are real Paytm or merchant results.
 *
 * Decision rule (recommendNextStep), applied in order:
 * 1. Stop: the median simulated net profit across PROFIT_RUNS runs of the approved
 *    configuration is ≤ 0. Even under its own assumptions it usually loses money.
 * 2. Revise the offer: the estimate loses money if the offer works half as well as assumed,
 *    or fewer than REVISE_BELOW_PROFITABLE_SHARE of simulated runs are profitable. The
 *    economics are fragile.
 * 3. Otherwise repeat with a larger test. This is also where too-small samples land: one
 *    simulated run with a small holdout cannot confirm or refute the assumed lift.
 * The single simulated run never decides on its own; it is reported as evidence.
 */
import { estimateDraft } from './campaign';
import { formatCount, formatINR, formatPercent } from './format';
import { describeOffer, getIntervention } from './interventions';
import { deriveSeed } from './rng';
import { simulateProfitDistribution, summarizeProfits, OFFER_RATE_UNCERTAINTY, BASELINE_RATE_UNCERTAINTY } from './simulator';
import { histogram, percentileRank, sampleSizePerGroup, twoProportionPower, wilsonInterval, type Bin, type Interval } from './stats';
import type { CampaignAssumptions, CampaignDraft, Offer, ProfitRange, SimulatedOutcome } from './types';

export const PROFIT_RUNS = 500;
export const PROFIT_BINS = 16;
/** Below this many customers, a group's return rate moves a lot with each customer. */
export const SMALL_GROUP = 30;
export const POWER_TARGET = 0.8;
export const REVISE_BELOW_PROFITABLE_SHARE = 0.6;

export interface EstimateSnapshot {
  averageBasketPaise: number;
  expectedReturners: number;
  expectedHoldoutReturners: number;
  expectedIncrementalReturners: number;
  totalCostPaise: number;
  incrementalMarginPaise: number;
  netIncrementalProfitPaise: number;
  breakEvenReturnRate: number;
  downsideNetProfitPaise: number;
}

/** Everything needed to review a completed run later, frozen at completion. */
export interface LearningRecord {
  version: 1;
  id: string;
  opportunityId: string;
  campaignName: string;
  interventionId: string;
  interventionLabel: string;
  offer: Offer;
  offerLabel: string;
  message: string;
  assumptions: CampaignAssumptions;
  assumedReturnRate: number;
  treatmentSize: number;
  holdoutSize: number;
  approvedAt: string;
  approvedBy: string;
  completedAt: string;
  seed: number;
  estimate: EstimateSnapshot;
  outcome: SimulatedOutcome;
  range: ProfitRange;
  bins: Bin[];
  /** Share of the PROFIT_RUNS runs at or below this run's net profit. */
  runPercentile: number;
}

export interface RecordInput {
  draft: CampaignDraft;
  outcome: SimulatedOutcome;
  approval: { at: string; approvedBy: string };
  completedAt: string;
  averageBasketPaise: number;
  basketByCustomer: ReadonlyMap<string, number>;
}

export function buildLearningRecord({ draft, outcome, approval, completedAt, averageBasketPaise, basketByCustomer }: RecordInput): LearningRecord {
  const e = estimateDraft(draft, averageBasketPaise);
  // Same configuration, independent seeds: how much one run can vary.
  const profits = simulateProfitDistribution(draft, basketByCustomer, deriveSeed(outcome.seed, 'range'), PROFIT_RUNS);
  return {
    version: 1,
    id: `${approval.at}|${outcome.seed}`,
    opportunityId: draft.opportunityId,
    campaignName: draft.name,
    interventionId: draft.interventionId,
    interventionLabel: getIntervention(draft.interventionId).label,
    offer: { ...draft.offer },
    offerLabel: describeOffer(draft.offer),
    message: draft.message,
    assumptions: { ...draft.assumptions },
    assumedReturnRate: draft.assumedReturnRate,
    treatmentSize: draft.treatmentIds.length,
    holdoutSize: draft.holdoutIds.length,
    approvedAt: approval.at,
    approvedBy: approval.approvedBy,
    completedAt,
    seed: outcome.seed,
    estimate: {
      averageBasketPaise,
      expectedReturners: e.economics.expectedReturners,
      expectedHoldoutReturners: draft.holdoutIds.length * draft.assumptions.baselineReturnRate,
      expectedIncrementalReturners: e.economics.expectedIncrementalReturners,
      totalCostPaise: e.economics.totalCostPaise,
      incrementalMarginPaise: e.economics.incrementalMarginPaise,
      netIncrementalProfitPaise: e.economics.netIncrementalProfitPaise,
      breakEvenReturnRate: e.economics.breakEvenReturnRate,
      downsideNetProfitPaise: e.downsideNetProfitPaise,
    },
    outcome,
    range: summarizeProfits(profits),
    bins: histogram(profits, PROFIT_BINS),
    runPercentile: percentileRank(profits, outcome.netIncrementalProfitPaise),
  };
}

// ── Metrics with explicit denominators ─────────────────────────────────────

export interface RateMetric {
  count: number;
  denominator: number;
  rate: number;
  /** 95% Wilson interval. */
  interval: Interval;
}

export function rateMetric(count: number, denominator: number): RateMetric {
  if (!Number.isInteger(count) || !Number.isInteger(denominator) || denominator <= 0 || count < 0 || count > denominator) {
    throw new Error(`Invalid rate ${count} / ${denominator}`);
  }
  return { count, denominator, rate: count / denominator, interval: wilsonInterval(count, denominator) };
}

export interface ResultMetrics {
  treatment: RateMetric;
  holdout: RateMetric;
  /** Treatment rate minus holdout rate. */
  liftRate: number;
  /** liftRate × treatment size: returners the run attributes to the offer. */
  simulatedIncrementalReturners: number;
  spendPaise: number;
  netPaise: number;
  /** Chance a two-proportion test of this size detects the assumed lift (normal approximation). */
  powerForAssumedLift: number;
  /** Customers per group needed for 80% power at the assumed rates. */
  requiredPerGroup: number;
  smallSample: boolean;
  /** How much one holdout customer moves the holdout rate. */
  holdoutRateStep: number;
}

export function resultMetrics(record: LearningRecord): ResultMetrics {
  const { outcome } = record;
  const treatment = rateMetric(outcome.treatment.returned, outcome.treatment.customers);
  const holdout = rateMetric(outcome.holdout.returned, outcome.holdout.customers);
  const liftRate = treatment.rate - holdout.rate;
  const baseline = record.assumptions.baselineReturnRate;
  return {
    treatment,
    holdout,
    liftRate,
    simulatedIncrementalReturners: liftRate * treatment.denominator,
    spendPaise: outcome.offerCostPaise + outcome.messageCostPaise,
    netPaise: outcome.netIncrementalProfitPaise,
    powerForAssumedLift: twoProportionPower(record.assumedReturnRate, baseline, treatment.denominator, holdout.denominator),
    requiredPerGroup: sampleSizePerGroup(record.assumedReturnRate, baseline),
    smallSample: treatment.denominator < SMALL_GROUP || holdout.denominator < SMALL_GROUP,
    holdoutRateStep: 1 / holdout.denominator,
  };
}

// ── Estimate versus simulated outcome ──────────────────────────────────────

export interface ComparisonRow {
  key: 'treatment_returners' | 'holdout_returners' | 'incremental_returners' | 'spend' | 'net';
  label: string;
  unit: 'customers' | 'paise';
  /** Group size the counts refer to, when relevant. */
  denominator: number | null;
  estimate: number;
  simulated: number;
  difference: number;
}

export function compareEstimateToOutcome(record: LearningRecord): ComparisonRow[] {
  const m = resultMetrics(record);
  const e = record.estimate;
  const row = (r: Omit<ComparisonRow, 'difference'>): ComparisonRow => ({ ...r, difference: r.simulated - r.estimate });
  return [
    row({ key: 'treatment_returners', label: 'Came back, offer group', unit: 'customers', denominator: record.treatmentSize, estimate: e.expectedReturners, simulated: m.treatment.count }),
    row({ key: 'holdout_returners', label: 'Came back, held back', unit: 'customers', denominator: record.holdoutSize, estimate: e.expectedHoldoutReturners, simulated: m.holdout.count }),
    row({ key: 'incremental_returners', label: 'Extra customers back', unit: 'customers', denominator: record.treatmentSize, estimate: e.expectedIncrementalReturners, simulated: m.simulatedIncrementalReturners }),
    row({ key: 'spend', label: 'Campaign spend', unit: 'paise', denominator: null, estimate: e.totalCostPaise, simulated: m.spendPaise }),
    row({ key: 'net', label: 'Net extra profit', unit: 'paise', denominator: null, estimate: e.netIncrementalProfitPaise, simulated: m.netPaise }),
  ];
}

/** Plain-language, data-driven reasons the simulated run may differ from the estimate. */
export function divergenceReasons(record: LearningRecord): string[] {
  const m = resultMetrics(record);
  const e = record.estimate;
  const reasons: string[] = [];
  const pct = Math.round(record.runPercentile * 100);
  reasons.push(
    `Random variation: across ${formatCount(record.range.runs)} simulated runs of this exact configuration, net profit ranged from ${formatINR(record.range.p10Paise)} to ${formatINR(record.range.p90Paise)} (10th to 90th percentile). This run sits at about the ${pct}th percentile.`,
  );
  if (m.smallSample) {
    reasons.push(
      `Small groups: with ${formatCount(m.holdout.denominator)} held-back customers, one more or one fewer return moves the holdout rate by ${Math.round(m.holdoutRateStep * 100)} percentage points. Neither group is large enough for a reliable comparison.`,
    );
  }
  reasons.push(
    `Realised counts: ${formatCount(m.treatment.count)} of ${formatCount(m.treatment.denominator)} came back in the offer group against ${(Math.round(e.expectedReturners * 10) / 10).toLocaleString('en-IN')} expected, and ${formatCount(m.holdout.count)} of ${formatCount(m.holdout.denominator)} in the holdout against ${(Math.round(e.expectedHoldoutReturners * 10) / 10).toLocaleString('en-IN')} expected.`,
  );
  const drawn = record.outcome.drawnRates;
  reasons.push(
    drawn
      ? `Assumptions are uncertain by design: the simulator varies the true response around your assumptions (±${OFFER_RATE_UNCERTAINTY * 100}% for the offer, ±${BASELINE_RATE_UNCERTAINTY * 100}% for the baseline). This run drew an underlying offer return rate of ${formatPercent(drawn.offer, { decimals: 0 })} (assumed ${formatPercent(record.assumedReturnRate, { decimals: 0 })}) and a baseline of ${formatPercent(drawn.baseline, { decimals: 0 })} (assumed ${formatPercent(record.assumptions.baselineReturnRate, { decimals: 0 })}).`
      : `Assumptions are uncertain by design: the simulator varies the true response around your assumptions (±${OFFER_RATE_UNCERTAINTY * 100}% for the offer, ±${BASELINE_RATE_UNCERTAINTY * 100}% for the baseline).`,
  );
  return reasons;
}

// ── Recommendation ─────────────────────────────────────────────────────────

export type NextStep = 'repeat_larger' | 'revise_offer' | 'stop';

export interface NextStepRecommendation {
  decision: NextStep;
  title: string;
  /** Which numbered rule fired (see the module comment). */
  rule: 1 | 2 | 3;
  reasons: string[];
}

export const NEXT_STEP_TITLE: Record<NextStep, string> = {
  repeat_larger: 'Repeat with a larger test',
  revise_offer: 'Revise the offer',
  stop: 'Stop this campaign',
};

export function recommendNextStep(record: LearningRecord): NextStepRecommendation {
  const m = resultMetrics(record);
  const { range, estimate } = record;
  const profitable = formatPercent(range.probabilityProfitable, { decimals: 0 });
  const powerLine =
    m.powerForAssumedLift < POWER_TARGET
      ? `This test is too small to confirm the assumed lift: with ${formatCount(m.treatment.denominator)} and ${formatCount(m.holdout.denominator)} customers, a real lift of that size would be detected only about ${formatPercent(m.powerForAssumedLift, { decimals: 0 })} of the time. About ${formatCount(m.requiredPerGroup)} customers per group are needed for ${formatPercent(POWER_TARGET, { decimals: 0 })}.`
      : `The test is large enough to detect the assumed lift about ${formatPercent(m.powerForAssumedLift, { decimals: 0 })} of the time.`;

  if (range.p50Paise <= 0) {
    return {
      decision: 'stop',
      title: NEXT_STEP_TITLE.stop,
      rule: 1,
      reasons: [
        `Under its own assumptions this configuration usually loses money: the median of ${formatCount(range.runs)} simulated runs is ${formatINR(range.p50Paise, { signed: true })}.`,
        `Only ${profitable} of simulated runs were profitable.`,
        powerLine,
      ],
    };
  }
  if (estimate.downsideNetProfitPaise < 0 || range.probabilityProfitable < REVISE_BELOW_PROFITABLE_SHARE) {
    return {
      decision: 'revise_offer',
      title: NEXT_STEP_TITLE.revise_offer,
      rule: 2,
      reasons: [
        estimate.downsideNetProfitPaise < 0
          ? `The economics are fragile: if the offer works half as well as assumed, the estimate turns to ${formatINR(estimate.downsideNetProfitPaise, { signed: true })}.`
          : `The economics are fragile: only ${profitable} of simulated runs were profitable (threshold ${formatPercent(REVISE_BELOW_PROFITABLE_SHARE, { decimals: 0 })}).`,
        'A cheaper offer or a higher minimum order would give more room for error.',
        powerLine,
      ],
    };
  }
  return {
    decision: 'repeat_larger',
    title: NEXT_STEP_TITLE.repeat_larger,
    rule: 3,
    reasons: [
      `The economics hold up under their own assumptions: ${profitable} of ${formatCount(range.runs)} simulated runs were profitable, and the estimate stays at ${formatINR(estimate.downsideNetProfitPaise, { signed: true })} even if the offer works half as well.`,
      powerLine,
      `This run's ${formatINR(m.netPaise, { signed: true })} is one draw. It neither confirms nor rules out the estimate of ${formatINR(estimate.netIncrementalProfitPaise, { signed: true })}.`,
    ],
  };
}
