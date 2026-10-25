/**
 * Core domain types.
 *
 * Units:
 * - Money is always integer **paise** (₹1 = 100 paise) in fields suffixed `Paise`.
 *   Expected values from models may be fractional paise; round only for display.
 * - `day` is a 0-based index from the dataset start date, in IST (UTC+05:30).
 * - `timestamp` is Unix epoch milliseconds (UTC).
 * - Rates suffixed `PerWeek` / `PerDay` are visits per week / per day.
 * - Probabilities and shares are fractions in [0, 1].
 */

export type Daypart = 'morning' | 'afternoon' | 'evening';
export type PaymentMode = 'upi' | 'card' | 'wallet';
export type CustomerSegment = 'regular' | 'occasional' | 'rare' | 'walk_in';

export interface Customer {
  /** Synthetic pseudonymous ID, e.g. "C-0142". Not a real person or account. */
  id: string;
  segment: CustomerSegment;
  /** Day the customer first became active. */
  firstActiveDay: number;
  weeklyVisitRate: number;
  preferredDaypart: Daypart;
  /** Typical basket size; individual baskets vary around it. */
  typicalBasketPaise: number;
}

export interface Transaction {
  id: string;
  customerId: string;
  day: number;
  timestamp: number;
  daypart: Daypart;
  amountPaise: number;
  itemCount: number;
  paymentMode: PaymentMode;
}

export interface Merchant {
  name: string;
  category: string;
  locality: string;
  /** Always true: every merchant in this prototype is fictional. */
  synthetic: true;
}

export interface Dataset {
  seed: number;
  merchant: Merchant;
  /** ISO date (YYYY-MM-DD, IST) of day 0. */
  startDate: string;
  /** Number of days covered; valid days are 0 … dayCount-1. */
  dayCount: number;
  /** "Today" for analysis: the day after the last generated day. */
  asOfDay: number;
  customers: Customer[];
  /** Sorted by timestamp ascending. */
  transactions: Transaction[];
}

/**
 * The generator's record of what it planted. Used ONLY by tests to measure the
 * detector; application code and the detector never read it.
 */
export interface GroundTruth {
  lapsedCustomerIds: string[];
  /** Day each planted customer stopped visiting. */
  lapseStartDay: Record<string, number>;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface LapsedCustomer {
  customerId: string;
  /** Distinct visit days observed before the as-of day. */
  visitDays: number;
  firstVisitDay: number;
  lastVisitDay: number;
  /** Estimated from the customer's own history before the current gap. */
  weeklyVisitRate: number;
  /** Mean days between visits implied by the rate (7 / weeklyVisitRate). */
  typicalGapDays: number;
  /** Days since the last visit, as of the analysis day. */
  currentGapDays: number;
  /** P(a gap at least this long | the customer's usual rate). Smaller = more unusual. */
  gapProbability: number;
  averageBasketPaise: number;
  /** Revenue per 30 days this customer used to generate (rate × basket). */
  monthlyValuePaise: number;
}

export interface LapsedRegularsOpportunity {
  id: string;
  type: 'lapsed_regulars';
  asOfDay: number;
  cohort: LapsedCustomer[];
  /** Customers who met the "regular" bar and were tested. */
  regularsTested: number;
  /** Expected number of false alarms if no one had truly lapsed (tested × threshold). */
  expectedFalseAlarms: number;
  atRiskMonthlyRevenuePaise: number;
  confidence: { level: ConfidenceLevel; reasons: string[] };
  /** Detection settings used, surfaced for transparency. */
  method: LapsedDetectorConfig;
}

export interface LapsedDetectorConfig {
  /** Minimum distinct visit days before the current gap to estimate a rate. */
  minVisitDays: number;
  /** Minimum historical visit rate to count as a "regular". */
  minWeeklyRate: number;
  /** Ignore gaps shorter than this regardless of probability. */
  minGapDays: number;
  /** Flag when the gap probability falls below this value. */
  probabilityThreshold: number;
}

export type OfferKind = 'flat_discount' | 'free_item' | 'loyalty_stamp' | 'none';

export interface Offer {
  kind: OfferKind;
  /** Customer-facing value (discount amount or retail price of a free item). */
  valuePaise: number;
  /** Merchant's cost per redemption (discount = value; free item = its ingredient cost). */
  costPerRedemptionPaise: number;
  /** Minimum bill to redeem; 0 when none. */
  minSpendPaise: number;
}

export interface Intervention {
  id: string;
  label: string;
  description: string;
  offer: Offer;
  /**
   * Assumed extra return rate caused by the offer, on top of the baseline return rate
   * (customers who would come back anyway). Illustrative, not measured.
   */
  assumedUplift: number;
}

export interface CampaignAssumptions {
  /** Gross margin on bakery sales, as a fraction of the bill before discount. */
  grossMarginRate: number;
  /** Return rate within the campaign window without any message (customers who come back anyway). */
  baselineReturnRate: number;
  /** Share of returning treated customers who use the offer. */
  redemptionRate: number;
  /** Illustrative cost of sending one message. Not a quoted price. */
  messageCostPaise: number;
  /** Campaign measurement window. */
  windowDays: number;
  /** Extra full-price visits a returning customer makes later in the window. */
  followOnVisits: number;
}

export interface CampaignDraft {
  opportunityId: string;
  interventionId: string;
  offer: Offer;
  message: string;
  treatmentIds: string[];
  holdoutIds: string[];
  assumptions: CampaignAssumptions;
  assumedReturnRate: number;
}

export interface GroupOutcome {
  customers: number;
  returned: number;
  redeemed: number;
  /** Bills before discount. */
  grossRevenuePaise: number;
}

export interface SimulatedOutcome {
  /** Always true: outcomes come from a model, never from real campaigns. */
  simulated: true;
  seed: number;
  treatment: GroupOutcome;
  holdout: GroupOutcome;
  treatmentReturnRate: number;
  holdoutReturnRate: number;
  /** Treatment minus holdout return rate. */
  liftRate: number;
  incrementalRevenuePaise: number;
  incrementalMarginPaise: number;
  offerCostPaise: number;
  messageCostPaise: number;
  netIncrementalProfitPaise: number;
  /** Cumulative treatment returns per simulated day (length = windowDays), for the timeline. */
  dailyTreatmentReturns: number[];
}

export interface ProfitRange {
  runs: number;
  p10Paise: number;
  p50Paise: number;
  p90Paise: number;
  /** Share of runs with net profit > 0. */
  probabilityProfitable: number;
}
