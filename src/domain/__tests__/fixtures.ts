import type { CampaignDraft, Daypart, Transaction } from '../types';
import { DEFAULT_ASSUMPTIONS, getIntervention } from '../interventions';

let counter = 0;
/** Minimal transaction for hand-computed fixtures. Amount is in rupees for readability. */
export function tx(customerId: string, day: number, rupees: number, daypart: Daypart = 'morning'): Transaction {
  counter += 1;
  return {
    id: `T-fixture-${counter}`,
    customerId,
    day,
    timestamp: day * 86_400_000 + counter,
    daypart,
    amountPaise: rupees * 100,
    itemCount: 1,
    paymentMode: 'upi',
  };
}

/** A customer who visits every `every` days from `from` (inclusive) to `to` (exclusive). */
export function visitsEvery(
  customerId: string,
  every: number,
  from: number,
  to: number,
  rupees = 200,
  daypart: Daypart = 'morning',
): Transaction[] {
  const out: Transaction[] = [];
  for (let d = from; d < to; d += every) out.push(tx(customerId, d, rupees, daypart));
  return out;
}

export function makeDraft(overrides: Partial<CampaignDraft> = {}): CampaignDraft {
  const intervention = getIntervention('win-back-30');
  return {
    opportunityId: 'opp-1',
    interventionId: intervention.id,
    offer: intervention.offer,
    message: 'We miss you at Sunrise Bakery! ₹30 off your next order of ₹200+.',
    treatmentIds: ['C-0001', 'C-0002', 'C-0003', 'C-0004'],
    holdoutIds: ['C-0005'],
    assumptions: DEFAULT_ASSUMPTIONS,
    assumedReturnRate: intervention.assumedReturnRate,
    ...overrides,
  };
}

/** n synthetic IDs with a constant typical basket. */
export function cohort(n: number, basketPaise = 25_000): { ids: string[]; baskets: Map<string, number> } {
  const ids = Array.from({ length: n }, (_, i) => `C-${String(i + 1).padStart(5, '0')}`);
  return { ids, baskets: new Map(ids.map((id) => [id, basketPaise])) };
}
