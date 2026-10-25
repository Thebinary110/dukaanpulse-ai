/**
 * Turning a chosen intervention into a campaign draft. Drafting only: nothing is
 * sent, and execution still requires approval in the scenario state machine.
 */
import { deriveSeed } from './rng';
import { splitTreatmentHoldout } from './simulator';
import { defaultCampaignMessage, returnRateWithUplift } from './interventions';
import type { CampaignAssumptions, CampaignDraft, Offer } from './types';

/** Share of the flagged customers held back (no offer) so the result can be measured fairly. */
export const HOLDOUT_SHARE = 0.2;

export interface Audience {
  treatmentIds: string[];
  holdoutIds: string[];
}

/** Deterministic treatment/holdout split of the flagged customers for a dataset seed. */
export function planAudience(customerIds: readonly string[], datasetSeed: number): Audience {
  return splitTreatmentHoldout(customerIds, HOLDOUT_SHARE, deriveSeed(datasetSeed, 'holdout'));
}

export interface DraftInput {
  opportunityId: string;
  interventionId: string;
  offer: Offer;
  uplift: number;
  assumptions: CampaignAssumptions;
  audience: Audience;
  merchantName: string;
}

export function createCampaignDraft(input: DraftInput): CampaignDraft {
  if (input.offer.kind === 'none') throw new Error('"Do nothing" cannot be drafted as a campaign');
  return {
    opportunityId: input.opportunityId,
    interventionId: input.interventionId,
    offer: { ...input.offer },
    message: defaultCampaignMessage(input.offer, input.merchantName, input.assumptions.windowDays),
    treatmentIds: [...input.audience.treatmentIds],
    holdoutIds: [...input.audience.holdoutIds],
    assumptions: { ...input.assumptions },
    assumedReturnRate: returnRateWithUplift(input.assumptions.baselineReturnRate, input.uplift),
  };
}

/** Uplift implied by a draft (return rate above baseline). */
export function draftUplift(draft: CampaignDraft): number {
  return draft.assumedReturnRate - draft.assumptions.baselineReturnRate;
}

/** Each flagged customer's own historical average basket, for the simulator. */
export function basketByCustomer(cohort: readonly { customerId: string; averageBasketPaise: number }[]): Map<string, number> {
  return new Map(cohort.map((c) => [c.customerId, c.averageBasketPaise]));
}

/** Mean historical basket of the given customers; 0 when none match. */
export function averageBasketOf(baskets: ReadonlyMap<string, number>, ids: readonly string[]): number {
  const values = ids.map((id) => baskets.get(id)).filter((v): v is number => v !== undefined);
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
