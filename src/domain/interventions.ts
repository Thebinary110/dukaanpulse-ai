/**
 * Candidate interventions and default campaign assumptions.
 *
 * Every rate and cost here is an ILLUSTRATIVE ASSUMPTION for the demo. None of
 * them is a measured result, a market benchmark or a quoted Paytm price. The UI
 * shows them and lets the merchant edit them.
 */
import type { CampaignAssumptions, Intervention } from './types';

export const DEFAULT_ASSUMPTIONS: CampaignAssumptions = {
  grossMarginRate: 0.55,
  baselineReturnRate: 0.1,
  redemptionRate: 0.85,
  messageCostPaise: 25,
  windowDays: 14,
};

export const INTERVENTIONS: readonly Intervention[] = [
  {
    id: 'win-back-30',
    label: '₹30 off on ₹200+',
    description: 'A time-limited win-back discount for lapsed regulars.',
    offer: { kind: 'flat_discount', valuePaise: 3000, costPerRedemptionPaise: 3000, minSpendPaise: 20000 },
    assumedReturnRate: 0.3,
  },
  {
    id: 'free-addon',
    label: 'Free cookie with any order',
    description: 'A small free item (₹40 retail, about ₹14 ingredient cost).',
    offer: { kind: 'free_item', valuePaise: 4000, costPerRedemptionPaise: 1400, minSpendPaise: 0 },
    assumedReturnRate: 0.24,
  },
  {
    id: 'double-stamps',
    label: 'Double loyalty stamps',
    description: 'Two stamps instead of one toward a free item; low cost, weaker pull.',
    offer: { kind: 'loyalty_stamp', valuePaise: 1000, costPerRedemptionPaise: 450, minSpendPaise: 0 },
    assumedReturnRate: 0.17,
  },
  {
    id: 'no-action',
    label: 'Do nothing',
    description: 'No message or offer. Some regulars may return on their own.',
    offer: { kind: 'none', valuePaise: 0, costPerRedemptionPaise: 0, minSpendPaise: 0 },
    assumedReturnRate: DEFAULT_ASSUMPTIONS.baselineReturnRate,
  },
];

export function getIntervention(id: string): Intervention {
  const found = INTERVENTIONS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown intervention: ${id}`);
  return found;
}
