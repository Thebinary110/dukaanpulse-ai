import { describe, expect, it } from 'vitest';
import {
  audienceProblems,
  averageBasketOf,
  basketByCustomer,
  checkDraft,
  createCampaignDraft,
  draftUplift,
  estimateDraft,
  HOLDOUT_SHARE,
  offerRuleProblems,
  planAudience,
  simulationFrame,
  simulationFrameCount,
  updateDraftOffer,
} from '../campaign';
import { campaignEconomics } from '../financials';
import { simulateCampaign } from '../simulator';
import { makeDraft } from './fixtures';
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
      name: 'Win back morning regulars',
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
        name: 'X',
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

describe('draft editing, checks and estimates', () => {
  const draftFor = () =>
    createCampaignDraft({
      opportunityId: 'opp',
      interventionId: 'win-back-30',
      offer: getIntervention('win-back-30').offer,
      uplift: 0.2,
      assumptions: DEFAULT_ASSUMPTIONS,
      audience: planAudience(ids, 7),
      merchantName: 'Sunrise Bakery',
      name: 'Win back morning regulars',
    });

  it('keeps the name and a hand-edited message when the draft is recreated', () => {
    const edited = { ...draftFor(), name: 'Diwali win-back', message: 'Namaste! ₹30 off your next order of ₹200 or more at Sunrise Bakery.' };
    const again = createCampaignDraft({
      opportunityId: 'opp',
      interventionId: 'win-back-30',
      offer: edited.offer,
      uplift: 0.2,
      assumptions: DEFAULT_ASSUMPTIONS,
      audience: planAudience(ids, 7),
      merchantName: 'Sunrise Bakery',
      name: 'Win back morning regulars',
      previous: edited,
    });
    expect(again.name).toBe('Diwali win-back');
    expect(again.message).toBe(edited.message);
  });

  it('updates the structured offer and regenerates an unedited message', () => {
    const d = updateDraftOffer(draftFor(), { valuePaise: 4000, minSpendPaise: 25_000 }, 'Sunrise Bakery');
    expect(d.offer).toEqual({ kind: 'flat_discount', valuePaise: 4000, costPerRedemptionPaise: 4000, minSpendPaise: 25_000 });
    expect(d.message).toContain('₹40 off your next order of ₹250 or more');
    expect(d.treatmentIds).toEqual(draftFor().treatmentIds);
  });

  it('passes all checks for a generated draft', () => {
    const d = draftFor();
    expect(checkDraft(d, ids, 22_000)).toEqual({ name: [], offer: [], message: [], audience: [], ok: true });
  });

  it('fails checks for bad offers, messages, names and audiences', () => {
    const d = draftFor();
    expect(checkDraft(updateDraftOffer(d, { valuePaise: 15_000 }, 'Sunrise Bakery'), ids, 22_000).offer.length).toBeGreaterThan(0);
    expect(checkDraft({ ...d, message: 'Hi! ₹99 off everything at Sunrise Bakery.' }, ids, 22_000).message.length).toBeGreaterThan(0);
    expect(checkDraft({ ...d, name: '   ' }, ids, 22_000).name).toEqual(['Give the campaign a name.']);
    const overlap = { ...d, holdoutIds: [...d.holdoutIds, d.treatmentIds[0]!] };
    expect(audienceProblems(overlap, ids)).toContain('A customer is in both the offer group and the holdout.');
    expect(audienceProblems({ ...d, treatmentIds: [...d.treatmentIds, 'C-9999'] }, ids)).toContain('The audience includes customers who were not flagged.');
    expect(audienceProblems({ ...d, treatmentIds: [] }, ids)).toContain('No customers would receive the offer.');
    expect(checkDraft(overlap, ids, 22_000).ok).toBe(false);
  });

  it('validates offer rules independently of bills', () => {
    expect(offerRuleProblems({ kind: 'flat_discount', valuePaise: 0, costPerRedemptionPaise: 0, minSpendPaise: 0 })).toContain('The discount must be more than ₹0.');
    expect(offerRuleProblems({ kind: 'flat_discount', valuePaise: 12_000, costPerRedemptionPaise: 12_000, minSpendPaise: 20_000 })).toHaveLength(1);
    expect(offerRuleProblems({ kind: 'free_item', valuePaise: 4000, costPerRedemptionPaise: Number.NaN, minSpendPaise: 0 })).toHaveLength(1);
  });

  it('estimates exactly the draft with the shared economics model', () => {
    const d = draftFor();
    const e = estimateDraft(d, 22_000);
    expect(e.economics).toEqual(
      campaignEconomics({ customers: d.treatmentIds.length, averageBasketPaise: 22_000, offer: d.offer, assumedReturnRate: d.assumedReturnRate, assumptions: d.assumptions }),
    );
    const bigger = estimateDraft(updateDraftOffer(d, { valuePaise: 5000 }, 'S'), 22_000);
    expect(bigger.economics.offerCostPaise).toBeGreaterThan(e.economics.offerCostPaise);
    expect(bigger.economics.netIncrementalProfitPaise).toBeLessThan(e.economics.netIncrementalProfitPaise);
    expect(e.downsideNetProfitPaise).toBeLessThan(e.economics.netIncrementalProfitPaise);
  });
});

describe('simulation frames', () => {
  const ids2 = Array.from({ length: 40 }, (_, i) => `C-${i}`);
  const baskets = new Map(ids2.map((id) => [id, 25_000]));
  const draft = makeDraft({ ...planAudience(ids2, 3) });
  const outcome = simulateCampaign(draft, baskets, 42);
  const W = draft.assumptions.windowDays;

  it('steps from queued to ready with non-decreasing returns', () => {
    const frames = Array.from({ length: simulationFrameCount(W) }, (_, f) => simulationFrame(outcome, W, f));
    expect(frames.map((f) => f.phase)).toEqual(['queued', 'delivered', ...Array(W).fill('visits'), 'redemptions', 'ready']);
    for (let i = 1; i < frames.length; i++) expect(frames[i]!.returnsSoFar).toBeGreaterThanOrEqual(frames[i - 1]!.returnsSoFar);
    expect(frames.at(-1)).toEqual({ phase: 'ready', day: W, returnsSoFar: outcome.treatment.returned, redemptions: outcome.treatment.redeemed, complete: true });
    expect(frames.filter((f) => f.complete)).toHaveLength(1);
  });

  it('clamps out-of-range frames and is deterministic', () => {
    expect(simulationFrame(outcome, W, -5).phase).toBe('queued');
    expect(simulationFrame(outcome, W, 999).complete).toBe(true);
    expect(simulateCampaign(draft, baskets, 42)).toEqual(outcome);
  });
});
