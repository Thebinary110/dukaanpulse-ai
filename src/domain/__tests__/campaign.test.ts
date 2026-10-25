import { describe, expect, it } from 'vitest';
import { averageBasketOf, basketByCustomer, createCampaignDraft, draftUplift, HOLDOUT_SHARE, planAudience } from '../campaign';
import { DEFAULT_ASSUMPTIONS, getIntervention } from '../interventions';
import { validateDraft } from '../../state/scenario';

const ids = Array.from({ length: 34 }, (_, i) => `C-${String(i + 1).padStart(4, '0')}`);

describe('campaign drafting', () => {
  it('splits the cohort deterministically with a 20% holdout', () => {
    const a = planAudience(ids, 7);
    expect(a).toEqual(planAudience([...ids].reverse(), 7));
    expect(a.holdoutIds).toHaveLength(Math.round(ids.length * HOLDOUT_SHARE));
    expect(new Set([...a.treatmentIds, ...a.holdoutIds]).size).toBe(ids.length);
  });

  it('creates a valid draft carrying the edited offer and assumptions', () => {
    const offer = { ...getIntervention('win-back-30').offer, valuePaise: 4000, costPerRedemptionPaise: 4000, minSpendPaise: 25_000 };
    const assumptions = { ...DEFAULT_ASSUMPTIONS, grossMarginRate: 0.6 };
    const draft = createCampaignDraft({
      opportunityId: 'opp',
      interventionId: 'win-back-30',
      offer,
      uplift: 0.25,
      assumptions,
      audience: planAudience(ids, 7),
      merchantName: 'Sunrise Bakery',
    });
    expect(draft.offer).toEqual(offer);
    expect(draft.assumptions.grossMarginRate).toBe(0.6);
    expect(draft.assumedReturnRate).toBeCloseTo(0.35);
    expect(draftUplift(draft)).toBeCloseTo(0.25);
    expect(draft.message).toContain('₹40 off your next order of ₹250 or more');
    expect(validateDraft(draft, 'opp')).toEqual([]);
  });

  it('refuses to draft "do nothing"', () => {
    expect(() =>
      createCampaignDraft({
        opportunityId: 'opp',
        interventionId: 'no-action',
        offer: getIntervention('no-action').offer,
        uplift: 0,
        assumptions: DEFAULT_ASSUMPTIONS,
        audience: planAudience(ids, 7),
        merchantName: 'X',
      }),
    ).toThrow();
  });

  it('averages baskets over the chosen customers', () => {
    const baskets = basketByCustomer([
      { customerId: 'A', averageBasketPaise: 20_000 },
      { customerId: 'B', averageBasketPaise: 30_000 },
    ]);
    expect(averageBasketOf(baskets, ['A', 'B'])).toBe(25_000);
    expect(averageBasketOf(baskets, ['A', 'Z'])).toBe(20_000);
    expect(averageBasketOf(baskets, [])).toBe(0);
  });
});
