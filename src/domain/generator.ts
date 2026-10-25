/**
 * Synthetic transaction generator for a fictional neighbourhood bakery.
 *
 * Everything produced here is invented. Customer IDs are pseudonyms, and amounts,
 * rates and patterns are plausible illustrations, not Paytm data or benchmarks.
 *
 * Model (per customer, per day):
 *   P(visit) = min(0.9, weeklyRate / 7 × weekdayFactor × trendFactor × lapseFactor)
 * with at most one visit per customer per day.
 *
 * On top of the recurring customer base, a stream of one-time walk-in
 * customers (passers-by) arrives each day.
 *
 * The planted signal: a set of established morning regulars stop visiting
 * 21–42 days before the as-of day (a small residual chance of a stray visit
 * remains). Their IDs are returned separately as ground truth for tests only.
 */
import { createRng, deriveSeed, type Rng } from './rng';
import { dayOfWeek, dayStartTimestamp } from './time';
import type {
  Customer,
  CustomerSegment,
  Dataset,
  Daypart,
  GroundTruth,
  Merchant,
  PaymentMode,
  Transaction,
} from './types';

export interface GeneratorConfig {
  seed: number;
  startDate: string;
  dayCount: number;
  /** Size of the recurring customer base (walk-ins are added on top). */
  customerCount: number;
  /** Mean one-time walk-in customers per day, before weekday and trend effects. */
  walkInsPerDay: number;
  /** Target number of regulars to plant as lapsed (capped by eligible regulars). */
  plantedLapsedCount: number;
  /** Planted lapses begin this many days before the as-of day (inclusive range). */
  lapseStartDaysAgo: readonly [number, number];
  /** Visit probability multiplier after a planted lapse starts. */
  lapseResidualFactor: number;
}

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  seed: 20261020,
  startDate: '2026-04-23',
  dayCount: 180,
  customerCount: 900,
  walkInsPerDay: 7,
  plantedLapsedCount: 40,
  lapseStartDaysAgo: [21, 42],
  lapseResidualFactor: 0.03,
};

export const DEMO_MERCHANT: Merchant = {
  name: 'Sunrise Bakery',
  category: 'Bakery & café',
  locality: 'Fictional neighbourhood',
  synthetic: true,
};

/** Sunday … Saturday demand multipliers. */
const WEEKDAY_FACTOR = [1.2, 0.9, 0.9, 0.95, 0.95, 1.05, 1.25] as const;
/** Total demand growth across the period (linear). */
const TREND_GROWTH = 0.08;
const MAX_DAILY_VISIT_PROBABILITY = 0.9;

const DAYPART_WINDOWS: Record<Daypart, readonly [number, number]> = {
  morning: [7 * 60, 11 * 60 + 30],
  afternoon: [12 * 60, 16 * 60 + 30],
  evening: [17 * 60, 21 * 60 + 30],
};
const DAYPARTS: readonly Daypart[] = ['morning', 'afternoon', 'evening'];

interface SegmentSpec {
  share: number;
  weeklyRate: readonly [number, number];
  basketRupees: readonly [number, number];
  /** Probability the customer is active from day 0; otherwise joins at a random day. */
  activeFromStart: number;
  latestJoinDay: number;
}

const SEGMENTS: Record<Exclude<CustomerSegment, 'walk_in'>, SegmentSpec> = {
  regular: { share: 0.18, weeklyRate: [1.5, 4.0], basketRupees: [150, 300], activeFromStart: 0.7, latestJoinDay: 90 },
  occasional: { share: 0.45, weeklyRate: [0.25, 0.9], basketRupees: [180, 380], activeFromStart: 0.4, latestJoinDay: 150 },
  rare: { share: 0.37, weeklyRate: [0.03, 0.15], basketRupees: [200, 450], activeFromStart: 0.3, latestJoinDay: 170 },
};

/** Share of regulars who take one mid-period break (travel, illness) of 7–18 days. */
const BREAK_SHARE = 0.25;
const WALK_IN_BASKET_RUPEES = [120, 320] as const;

function roundToFiveRupees(paise: number): number {
  return Math.max(3000, Math.round(paise / 500) * 500);
}

function pickPaymentMode(rng: Rng): PaymentMode {
  const r = rng.next();
  return r < 0.82 ? 'upi' : r < 0.92 ? 'card' : 'wallet';
}

function pickDaypart(rng: Rng, preferred: Daypart, loyalty: number): Daypart {
  return rng.bernoulli(loyalty) ? preferred : rng.pick(DAYPARTS);
}

function makeCustomers(rng: Rng, config: GeneratorConfig): Customer[] {
  const customers: Customer[] = [];
  const order = ['regular', 'occasional', 'rare'] as const;
  let index = 0;
  for (const segment of order) {
    const spec = SEGMENTS[segment];
    const count = Math.round(config.customerCount * spec.share);
    for (let i = 0; i < count && index < config.customerCount; i++, index++) {
      const preferredDaypart: Daypart =
        segment === 'regular'
          ? rng.next() < 0.5 ? 'morning' : rng.next() < 0.4 ? 'afternoon' : 'evening'
          : rng.pick(DAYPARTS);
      customers.push({
        id: `C-${String(index + 1).padStart(4, '0')}`,
        segment,
        firstActiveDay: rng.bernoulli(spec.activeFromStart) ? 0 : rng.int(1, spec.latestJoinDay),
        weeklyVisitRate: rng.uniform(spec.weeklyRate[0], spec.weeklyRate[1]),
        preferredDaypart,
        typicalBasketPaise: roundToFiveRupees(rng.uniform(spec.basketRupees[0], spec.basketRupees[1]) * 100),
      });
    }
  }
  // Shuffle so IDs carry no information about segment.
  return rng.shuffle(customers).map((c, i) => ({ ...c, id: `C-${String(i + 1).padStart(4, '0')}` }));
}

export interface GeneratedData {
  dataset: Dataset;
  groundTruth: GroundTruth;
}

export function generateDataset(overrides: Partial<GeneratorConfig> = {}): GeneratedData {
  const config: GeneratorConfig = { ...DEFAULT_GENERATOR_CONFIG, ...overrides };
  const asOfDay = config.dayCount;

  const customers = makeCustomers(createRng(deriveSeed(config.seed, 'customers')), config);

  // Planted signal: established morning regulars who stop coming.
  const plantRng = createRng(deriveSeed(config.seed, 'plant'));
  const eligible = customers.filter(
    (c) => c.segment === 'regular' && c.preferredDaypart === 'morning' && c.firstActiveDay <= 60,
  );
  const planted = plantRng.shuffle(eligible).slice(0, config.plantedLapsedCount);
  const lapseStartDay: Record<string, number> = {};
  for (const c of planted) {
    lapseStartDay[c.id] = asOfDay - plantRng.int(config.lapseStartDaysAgo[0], config.lapseStartDaysAgo[1]);
  }

  // Ordinary noise: some regulars take a temporary break well before the as-of day.
  const breakRng = createRng(deriveSeed(config.seed, 'breaks'));
  const breaks: Record<string, readonly [number, number]> = {};
  for (const c of customers) {
    if (c.segment === 'regular' && !(c.id in lapseStartDay) && breakRng.bernoulli(BREAK_SHARE)) {
      const start = breakRng.int(10, Math.max(10, config.dayCount - 60));
      breaks[c.id] = [start, start + breakRng.int(7, 18)];
    }
  }

  const visitRng = createRng(deriveSeed(config.seed, 'visits'));
  const walkInRng = createRng(deriveSeed(config.seed, 'walk-ins'));
  const walkInCustomers: Customer[] = [];
  const transactions: Transaction[] = [];
  for (let day = 0; day < config.dayCount; day++) {
    const weekday = WEEKDAY_FACTOR[dayOfWeek(config.startDate, day)]!;
    const trend = 1 + TREND_GROWTH * (day / config.dayCount);
    const dayStart = dayStartTimestamp(config.startDate, day);
    let seq = 0;
    for (const c of customers) {
      if (day < c.firstActiveDay) continue;
      const pause = breaks[c.id];
      if (pause && day >= pause[0] && day < pause[1]) continue;
      const lapse = lapseStartDay[c.id];
      const lapseFactor = lapse !== undefined && day >= lapse ? config.lapseResidualFactor : 1;
      const p = Math.min(MAX_DAILY_VISIT_PROBABILITY, (c.weeklyVisitRate / 7) * weekday * trend * lapseFactor);
      if (!visitRng.bernoulli(p)) continue;

      const daypart = pickDaypart(visitRng, c.preferredDaypart, c.segment === 'regular' ? 0.8 : 0.5);
      const [from, to] = DAYPART_WINDOWS[daypart];
      const minute = visitRng.int(from, to);
      const amountPaise = roundToFiveRupees(c.typicalBasketPaise * Math.exp(visitRng.normal(0, 0.25)));
      transactions.push({
        id: `T-${String(day).padStart(3, '0')}-${String(++seq).padStart(4, '0')}`,
        customerId: c.id,
        day,
        timestamp: dayStart + minute * 60_000 + visitRng.int(0, 59) * 1000,
        daypart,
        amountPaise,
        itemCount: Math.max(1, Math.round(amountPaise / 7500 + visitRng.normal(0, 0.6))),
        paymentMode: pickPaymentMode(visitRng),
      });
    }

    const walkIns = Math.round(config.walkInsPerDay * weekday * trend * walkInRng.uniform(0.6, 1.4));
    for (let i = 0; i < walkIns; i++) {
      const customer: Customer = {
        id: `C-${String(customers.length + walkInCustomers.length + 1).padStart(4, '0')}`,
        segment: 'walk_in',
        firstActiveDay: day,
        weeklyVisitRate: 0,
        preferredDaypart: walkInRng.pick(DAYPARTS),
        typicalBasketPaise: roundToFiveRupees(walkInRng.uniform(...WALK_IN_BASKET_RUPEES) * 100),
      };
      walkInCustomers.push(customer);
      const [from, to] = DAYPART_WINDOWS[customer.preferredDaypart];
      transactions.push({
        id: `T-${String(day).padStart(3, '0')}-${String(++seq).padStart(4, '0')}`,
        customerId: customer.id,
        day,
        timestamp: dayStart + walkInRng.int(from, to) * 60_000 + walkInRng.int(0, 59) * 1000,
        daypart: customer.preferredDaypart,
        amountPaise: customer.typicalBasketPaise,
        itemCount: Math.max(1, Math.round(customer.typicalBasketPaise / 7500)),
        paymentMode: pickPaymentMode(walkInRng),
      });
    }
  }
  transactions.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));

  return {
    dataset: {
      seed: config.seed,
      merchant: DEMO_MERCHANT,
      startDate: config.startDate,
      dayCount: config.dayCount,
      asOfDay,
      customers: [...customers, ...walkInCustomers],
      transactions,
    },
    groundTruth: { lapsedCustomerIds: planted.map((c) => c.id).sort(), lapseStartDay },
  };
}
