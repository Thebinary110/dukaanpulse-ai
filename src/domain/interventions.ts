/**
 * Candidate interventions and default campaign assumptions.
 *
 * Every rate and cost here is an ILLUSTRATIVE ASSUMPTION for the demo. None of
 * them is a measured result, a market benchmark or a quoted Paytm price. The UI
 * shows them and lets the merchant edit them.
 */
import { formatINR } from './format';
import type { CampaignAssumptions, Intervention, Offer } from './types';

export const DEFAULT_ASSUMPTIONS: CampaignAssumptions = {
  grossMarginRate: 0.55,
  baselineReturnRate: 0.1,
  redemptionRate: 0.85,
  messageCostPaise: 25,
  windowDays: 14,
  followOnVisits: 1,
};

export const INTERVENTIONS: readonly Intervention[] = [
  {
    id: 'win-back-30',
    label: 'Targeted discount',
    description: 'A time-limited discount above a minimum spend.',
    offer: { kind: 'flat_discount', valuePaise: 3000, costPerRedemptionPaise: 3000, minSpendPaise: 20000 },
    assumedUplift: 0.2,
  },
  {
    id: 'free-addon',
    label: 'Free add-on',
    description: 'A low-cost free item with the next order (₹40 retail, about ₹14 ingredient cost).',
    offer: { kind: 'free_item', valuePaise: 4000, costPerRedemptionPaise: 1400, minSpendPaise: 0 },
    assumedUplift: 0.14,
  },
  {
    id: 'double-stamps',
    label: 'Loyalty bonus',
    description: 'Double stamps toward a free item: low cost, weaker pull.',
    offer: { kind: 'loyalty_stamp', valuePaise: 1000, costPerRedemptionPaise: 450, minSpendPaise: 0 },
    assumedUplift: 0.07,
  },
  {
    id: 'no-action',
    label: 'Do nothing',
    description: 'No message, no offer. Some regulars may come back on their own.',
    offer: { kind: 'none', valuePaise: 0, costPerRedemptionPaise: 0, minSpendPaise: 0 },
    assumedUplift: 0,
  },
];

/** Return rate with the offer = baseline + uplift, capped at 100%. */
export function returnRateWithUplift(baselineReturnRate: number, uplift: number): number {
  return Math.min(1, Math.max(0, baselineReturnRate + uplift));
}

/** Short customer-facing description of an offer, e.g. "₹30 off on ₹200+". */
export function describeOffer(offer: Offer): string {
  switch (offer.kind) {
    case 'flat_discount':
      return offer.minSpendPaise > 0
        ? `${formatINR(offer.valuePaise)} off on ${formatINR(offer.minSpendPaise)}+`
        : `${formatINR(offer.valuePaise)} off any order`;
    case 'free_item':
      return 'Free cookie with any order';
    case 'loyalty_stamp':
      return 'Double loyalty stamps';
    case 'none':
      return 'No offer';
  }
}

export function getIntervention(id: string): Intervention {
  const found = INTERVENTIONS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown intervention: ${id}`);
  return found;
}
