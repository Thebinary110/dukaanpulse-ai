/**
 * Turning a chosen intervention into a campaign draft, checking it, estimating it,
 * and stepping through its simulated run. Drafting only: nothing is sent, and
 * execution still requires approval in the scenario state machine.
 */
import { DOWNSIDE_UPLIFT_FACTOR, offerFor, optionProblems, type OptionSettings } from './decision';
import { campaignEconomics, type CampaignEconomics } from './financials';
import { formatINR } from './format';
import { returnRateWithUplift } from './interventions';
import { generateMessage, syncMessage, validateMessage, type MessageIssue } from './message';
import { deriveSeed } from './rng';
import { splitTreatmentHoldout } from './simulator';
import type { CampaignAssumptions, CampaignDraft, Offer, SimulatedOutcome } from './types';

/** Share of the flagged customers held back (no offer) so the result can be measured fairly. */
export const HOLDOUT_SHARE = 0.2;
export const CAMPAIGN_NAME_MAX_LENGTH = 60;

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
  /** Default internal name, e.g. "Win back morning regulars". */
  name: string;
  /** An existing draft being replaced: its name and any hand-edited message are kept. */
  previous?: CampaignDraft | null;
}

export function createCampaignDraft(input: DraftInput): CampaignDraft {
  if (input.offer.kind === 'none') throw new Error('"Do nothing" cannot be drafted as a campaign');
  const { previous } = input;
  const generated = generateMessage(input.offer, input.merchantName, input.assumptions.windowDays);
  const message =
    previous && previous.interventionId === input.interventionId
      ? syncMessage(previous.message, previous.offer, input.offer, input.merchantName, previous.assumptions.windowDays)
      : generated;
  return {
    opportunityId: input.opportunityId,
    interventionId: input.interventionId,
    name: previous?.name ?? input.name,
    offer: { ...input.offer },
    message,
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

/** The editable settings a draft's offer corresponds to. */
export function draftOptionSettings(draft: CampaignDraft): OptionSettings {
  return {
    valuePaise: draft.offer.valuePaise,
    costPerRedemptionPaise: draft.offer.costPerRedemptionPaise,
    minSpendPaise: draft.offer.minSpendPaise,
    uplift: draftUplift(draft),
  };
}

/**
 * Applies a change to the structured offer. Discount cost follows its face value; an
 * unedited message is regenerated to match, an edited one is kept for the merchant to fix.
 */
export function updateDraftOffer(draft: CampaignDraft, patch: Partial<OptionSettings>, merchantName: string): CampaignDraft {
  const offer = offerFor(draft.offer.kind, { ...draftOptionSettings(draft), ...patch });
  return {
    ...draft,
    offer,
    message: syncMessage(draft.message, draft.offer, offer, merchantName, draft.assumptions.windowDays),
  };
}

// ── Checks ─────────────────────────────────────────────────────────────────

/** Offer rules that hold regardless of customers' bills. */
export function offerRuleProblems(offer: Offer): string[] {
  const problems: string[] = [];
  const values = [offer.valuePaise, offer.costPerRedemptionPaise, offer.minSpendPaise];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) problems.push('Offer amounts must be zero or more.');
  if (offer.kind === 'flat_discount') {
    if (!(offer.valuePaise > 0)) problems.push('The discount must be more than ₹0.');
    if (offer.minSpendPaise > 0 && offer.valuePaise > offer.minSpendPaise / 2) {
      problems.push(`The discount must be at most half the minimum order (${formatINR(offer.minSpendPaise / 2)}).`);
    }
  }
  return problems;
}

/** Treatment and holdout must be non-empty, disjoint, and drawn only from the flagged customers. */
export function audienceProblems(draft: CampaignDraft, flaggedIds: readonly string[]): string[] {
  const problems: string[] = [];
  const flagged = new Set(flaggedIds);
  const holdout = new Set(draft.holdoutIds);
  if (draft.treatmentIds.length === 0) problems.push('No customers would receive the offer.');
  if (draft.holdoutIds.length === 0) problems.push('There is no holdout group to measure against.');
  if (new Set(draft.treatmentIds).size !== draft.treatmentIds.length || holdout.size !== draft.holdoutIds.length) {
    problems.push('A customer is listed twice.');
  }
  if (draft.treatmentIds.some((id) => holdout.has(id))) problems.push('A customer is in both the offer group and the holdout.');
  if ([...draft.treatmentIds, ...draft.holdoutIds].some((id) => !flagged.has(id))) problems.push('The audience includes customers who were not flagged.');
  return problems;
}

export function nameProblems(name: string): string[] {
  const n = name.trim();
  if (n.length === 0) return ['Give the campaign a name.'];
  if (name.length > CAMPAIGN_NAME_MAX_LENGTH) return [`Keep the name within ${CAMPAIGN_NAME_MAX_LENGTH} characters.`];
  return [];
}

export interface DraftCheck {
  name: string[];
  offer: string[];
  message: MessageIssue[];
  audience: string[];
  ok: boolean;
}

/** Everything that must pass before a draft can be approved. */
export function checkDraft(draft: CampaignDraft, flaggedIds: readonly string[], averageBasketPaise: number): DraftCheck {
  const name = nameProblems(draft.name);
  const offer = [...offerRuleProblems(draft.offer), ...optionProblems(draft.offer.kind, draftOptionSettings(draft), averageBasketPaise)];
  const message = validateMessage(draft.message, draft.offer);
  const audience = audienceProblems(draft, flaggedIds);
  return { name, offer: [...new Set(offer)], message, audience, ok: name.length + offer.length + message.length + audience.length === 0 };
}

// ── Estimates ──────────────────────────────────────────────────────────────

export interface DraftEstimate {
  economics: CampaignEconomics;
  downsideNetProfitPaise: number;
  breakEvenRedemptions: number;
  averageBasketPaise: number;
}

/** Expected-value economics for exactly this draft (its offer, recipients and assumptions). */
export function estimateDraft(draft: CampaignDraft, averageBasketPaise: number): DraftEstimate {
  const base = { customers: draft.treatmentIds.length, averageBasketPaise, offer: draft.offer, assumptions: draft.assumptions };
  const economics = campaignEconomics({ ...base, assumedReturnRate: draft.assumedReturnRate });
  const downside = campaignEconomics({
    ...base,
    assumedReturnRate: returnRateWithUplift(draft.assumptions.baselineReturnRate, draftUplift(draft) * DOWNSIDE_UPLIFT_FACTOR),
  });
  return {
    economics,
    downsideNetProfitPaise: downside.netIncrementalProfitPaise,
    breakEvenRedemptions: economics.breakEvenReturners * draft.assumptions.redemptionRate,
    averageBasketPaise,
  };
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

// ── Simulated run, step by step ────────────────────────────────────────────

export type SimulationPhase = 'queued' | 'delivered' | 'visits' | 'redemptions' | 'ready';

export interface SimulationFrame {
  phase: SimulationPhase;
  /** Simulated campaign day shown (0 before visits start, windowDays at the end). */
  day: number;
  /** Treatment customers who have returned by this day. */
  returnsSoFar: number;
  /** Redemptions, revealed once visits are complete. */
  redemptions: number | null;
  complete: boolean;
}

/** Frames: queued, delivered, one per campaign day, redemptions, ready. */
export function simulationFrameCount(windowDays: number): number {
  return windowDays + 4;
}

/** A deterministic view of the simulated outcome at a given frame of the animation. */
export function simulationFrame(outcome: SimulatedOutcome, windowDays: number, frame: number): SimulationFrame {
  const last = simulationFrameCount(windowDays) - 1;
  const f = Math.min(Math.max(0, Math.floor(frame)), last);
  if (f === 0) return { phase: 'queued', day: 0, returnsSoFar: 0, redemptions: null, complete: false };
  if (f === 1) return { phase: 'delivered', day: 0, returnsSoFar: 0, redemptions: null, complete: false };
  if (f <= windowDays + 1) {
    const day = f - 1;
    return { phase: 'visits', day, returnsSoFar: outcome.dailyTreatmentReturns[day - 1] ?? 0, redemptions: null, complete: false };
  }
  const returnsSoFar = outcome.treatment.returned;
  if (f === windowDays + 2) return { phase: 'redemptions', day: windowDays, returnsSoFar, redemptions: outcome.treatment.redeemed, complete: false };
  return { phase: 'ready', day: windowDays, returnsSoFar, redemptions: outcome.treatment.redeemed, complete: true };
}
