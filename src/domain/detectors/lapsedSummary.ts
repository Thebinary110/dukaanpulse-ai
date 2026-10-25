/**
 * Plain-language summary of the lapsed-regulars detection, for the merchant.
 *
 * Every number and phrase here is derived from detector output and the
 * flagged customers' own transactions. Wording is deliberately qualified
 * ("may be slipping away"): a long absence is evidence, not proof of churn.
 */
import { weeklyVisits } from '../metrics';
import { median } from '../stats';
import type { Daypart, LapsedDetectorConfig, LapsedRegularsOpportunity, Transaction } from '../types';
import { DEFAULT_LAPSED_CONFIG, detectLapsedRegulars, scoreRegulars } from './lapsedRegulars';

/** A daypart is "theirs" when at least this share of the cohort's past visits fell in it. */
export const DOMINANT_DAYPART_SHARE = 0.5;
export const EVIDENCE_WEEKS = 12;

export interface NoOpportunity {
  status: 'none';
  asOfDay: number;
  regularsTested: number;
  method: LapsedDetectorConfig;
}

export interface LapsedOpportunitySummary {
  status: 'found';
  opportunity: LapsedRegularsOpportunity;
  customers: number;
  headline: string;
  /** One-sentence observed evidence. */
  summary: string;
  dominantDaypart: Daypart | null;
  /** Share of the cohort's visits in each daypart (before the as-of day). */
  daypartShares: Record<Daypart, number>;
  medianWeeklyVisitRate: number;
  medianTypicalGapDays: number;
  medianCurrentGapDays: number;
  shortestCurrentGapDays: number;
  /** What the cohort used to spend per 30 days at their usual rate (an estimate of revenue at risk). */
  pastMonthlySpendPaise: number;
  /** Visits by the flagged customers per week, oldest first, ending at the as-of day. */
  weeklyVisits: { weekStartDay: number; visits: number }[];
}

export type OpportunityOverview = NoOpportunity | LapsedOpportunitySummary;

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function summarizeLapsedOpportunity(
  transactions: readonly Transaction[],
  asOfDay: number,
  config: LapsedDetectorConfig = DEFAULT_LAPSED_CONFIG,
): OpportunityOverview {
  const opportunity = detectLapsedRegulars(transactions, asOfDay, config);
  if (!opportunity) {
    return { status: 'none', asOfDay, regularsTested: scoreRegulars(transactions, asOfDay, config).length, method: config };
  }

  const ids = new Set(opportunity.cohort.map((c) => c.customerId));
  const counts: Record<Daypart, number> = { morning: 0, afternoon: 0, evening: 0 };
  let visits = 0;
  for (const t of transactions) {
    if (t.day >= asOfDay || !ids.has(t.customerId)) continue;
    counts[t.daypart] += 1;
    visits += 1;
  }
  const daypartShares: Record<Daypart, number> = {
    morning: visits ? counts.morning / visits : 0,
    afternoon: visits ? counts.afternoon / visits : 0,
    evening: visits ? counts.evening / visits : 0,
  };
  const top = (Object.keys(daypartShares) as Daypart[]).reduce((a, b) => (daypartShares[b] > daypartShares[a] ? b : a));
  const dominantDaypart = daypartShares[top] >= DOMINANT_DAYPART_SHARE ? top : null;

  const n = opportunity.cohort.length;
  const medianWeeklyVisitRate = median(opportunity.cohort.map((c) => c.weeklyVisitRate));
  const medianTypicalGapDays = median(opportunity.cohort.map((c) => c.typicalGapDays));
  const medianCurrentGapDays = median(opportunity.cohort.map((c) => c.currentGapDays));
  const shortestCurrentGapDays = Math.min(...opportunity.cohort.map((c) => c.currentGapDays));

  const who = n === 1 ? 'regular' : 'regulars';
  const headline = dominantDaypart
    ? `Your ${dominantDaypart} ${who} may be slipping away`
    : `${n === 1 ? 'One of your regulars' : 'Some of your regulars'} may be slipping away`;
  const customersPhrase = n === 1 ? '1 customer who' : `${n} customers who`;
  const summary =
    `${customersPhrase} used to pay about ${roundTo(medianWeeklyVisitRate, 1)} times a week ` +
    `${n === 1 ? 'has' : 'have'} not paid in at least ${shortestCurrentGapDays} days. ` +
    `Normally they return every ${Math.max(1, Math.round(medianTypicalGapDays))} days or so.`;

  const lookbackStart = Math.max(0, asOfDay - EVIDENCE_WEEKS * 7);
  return {
    status: 'found',
    opportunity,
    customers: n,
    headline,
    summary,
    dominantDaypart,
    daypartShares,
    medianWeeklyVisitRate,
    medianTypicalGapDays,
    medianCurrentGapDays,
    shortestCurrentGapDays,
    pastMonthlySpendPaise: opportunity.atRiskMonthlyRevenuePaise,
    weeklyVisits: weeklyVisits(transactions, ids, lookbackStart, asOfDay),
  };
}
