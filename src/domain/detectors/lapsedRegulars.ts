/**
 * Lapsed-regular detection.
 *
 * Works only from transactions; it has no knowledge of how the data was generated.
 *
 * For each customer with enough history:
 * 1. Estimate their daily visit probability p from their own past behaviour:
 *    p = (visitDays − 1) / (lastVisitDay − firstVisitDay). The current gap is
 *    excluded so it cannot dilute the estimate it is being tested against.
 * 2. Count the observed days with no visit since the last one: g = asOfDay − lastVisitDay − 1.
 * 3. Under "nothing has changed", the chance of g consecutive empty days is (1 − p)^g.
 * 4. Flag regulars when that probability is below the threshold.
 *
 * The probability is per customer; when many regulars are tested, a few will
 * cross the threshold by chance. `expectedFalseAlarms` reports that number.
 */
import type {
  ConfidenceLevel,
  LapsedCustomer,
  LapsedDetectorConfig,
  LapsedRegularsOpportunity,
  Transaction,
} from '../types';

export const DEFAULT_LAPSED_CONFIG: LapsedDetectorConfig = {
  minVisitDays: 6,
  minWeeklyRate: 1.0,
  minGapDays: 14,
  probabilityThreshold: 0.01,
};

/** Minimum span of history (days between first and last visit) needed to estimate a rate. */
export const MIN_HISTORY_SPAN_DAYS = 28;
const DAYS_PER_MONTH = 30;

export interface ScoredRegular extends LapsedCustomer {
  flagged: boolean;
}

/** Scores every customer who qualifies as a regular. Exposed for evaluation and evidence views. */
export function scoreRegulars(
  transactions: readonly Transaction[],
  asOfDay: number,
  config: LapsedDetectorConfig = DEFAULT_LAPSED_CONFIG,
): ScoredRegular[] {
  const history = new Map<string, { days: Set<number>; spendPaise: number; orders: number }>();
  for (const t of transactions) {
    if (t.day >= asOfDay) continue;
    let h = history.get(t.customerId);
    if (!h) history.set(t.customerId, (h = { days: new Set(), spendPaise: 0, orders: 0 }));
    h.days.add(t.day);
    h.spendPaise += t.amountPaise;
    h.orders += 1;
  }

  const scored: ScoredRegular[] = [];
  for (const [customerId, h] of history) {
    const visitDays = h.days.size;
    if (visitDays < config.minVisitDays) continue;
    let firstVisitDay = Infinity;
    let lastVisitDay = -Infinity;
    for (const d of h.days) {
      if (d < firstVisitDay) firstVisitDay = d;
      if (d > lastVisitDay) lastVisitDay = d;
    }
    const span = lastVisitDay - firstVisitDay;
    if (span < MIN_HISTORY_SPAN_DAYS) continue;

    const dailyProbability = Math.min(0.99, (visitDays - 1) / span);
    const weeklyVisitRate = dailyProbability * 7;
    if (weeklyVisitRate < config.minWeeklyRate) continue;

    const currentGapDays = asOfDay - lastVisitDay;
    const emptyDays = currentGapDays - 1;
    const gapProbability = Math.pow(1 - dailyProbability, emptyDays);
    const averageBasketPaise = h.spendPaise / h.orders;

    scored.push({
      customerId,
      visitDays,
      firstVisitDay,
      lastVisitDay,
      weeklyVisitRate,
      typicalGapDays: 1 / dailyProbability,
      currentGapDays,
      gapProbability,
      averageBasketPaise,
      monthlyValuePaise: dailyProbability * DAYS_PER_MONTH * averageBasketPaise,
      flagged: currentGapDays >= config.minGapDays && gapProbability < config.probabilityThreshold,
    });
  }
  return scored.sort((a, b) => a.gapProbability - b.gapProbability || a.customerId.localeCompare(b.customerId));
}

function assessConfidence(cohortSize: number, expectedFalseAlarms: number): { level: ConfidenceLevel; reasons: string[] } {
  const falseShare = cohortSize === 0 ? 1 : expectedFalseAlarms / cohortSize;
  const reasons = [
    `${cohortSize} regulars show an unusually long absence.`,
    `About ${expectedFalseAlarms.toFixed(1)} would be flagged by chance alone if no one had actually stopped visiting.`,
  ];
  let level: ConfidenceLevel = 'low';
  if (cohortSize >= 15 && falseShare <= 0.1) level = 'high';
  else if (cohortSize >= 5 && falseShare <= 0.25) level = 'medium';
  if (level === 'low') reasons.push('Too few customers, or too many chance flags, to act with confidence.');
  return { level, reasons };
}

/** Returns the lapsed-regulars opportunity, or null when no regular is flagged. */
export function detectLapsedRegulars(
  transactions: readonly Transaction[],
  asOfDay: number,
  config: LapsedDetectorConfig = DEFAULT_LAPSED_CONFIG,
): LapsedRegularsOpportunity | null {
  const scored = scoreRegulars(transactions, asOfDay, config);
  const cohort: LapsedCustomer[] = scored.filter((s) => s.flagged).map(({ flagged: _flagged, ...rest }) => rest);
  if (cohort.length === 0) return null;
  const expectedFalseAlarms = scored.length * config.probabilityThreshold;
  return {
    id: `lapsed-regulars-day-${asOfDay}`,
    type: 'lapsed_regulars',
    asOfDay,
    cohort,
    regularsTested: scored.length,
    expectedFalseAlarms,
    atRiskMonthlyRevenuePaise: cohort.reduce((sum, c) => sum + c.monthlyValuePaise, 0),
    confidence: assessConfidence(cohort.length, expectedFalseAlarms),
    method: config,
  };
}
