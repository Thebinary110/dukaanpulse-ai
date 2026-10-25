/**
 * Scenario state machine: the single path from a detected opportunity to a
 * measured (simulated) outcome.
 *
 *   detected → reviewing → drafting → awaiting_approval → approved → executing → measured
 *                  │            │               │  └── REQUEST_CHANGES → drafting
 *                  └────────────┴───────────────┴──── REJECT → rejected → (START_DRAFT | RESET)
 *   RESET from any state returns to detected.
 *
 * Safety rules enforced here, not just in the UI:
 * - Execution requires an explicit approval of the exact draft that will run.
 *   Editing after approval is impossible, and a changed draft voids the approval.
 * - Outcomes must be marked as simulated.
 *
 * Pure TypeScript with no React; timestamps are passed in so tests stay deterministic.
 */
import type { CampaignDraft, SimulatedOutcome } from '../domain/types';

export type ScenarioStatus =
  | 'detected'
  | 'reviewing'
  | 'drafting'
  | 'awaiting_approval'
  | 'approved'
  | 'executing'
  | 'measured'
  | 'rejected';

export interface Approval {
  /** ISO timestamp. */
  at: string;
  approvedBy: string;
  /** Fingerprint of the draft that was approved. */
  draftFingerprint: string;
}

export interface Rejection {
  at: string;
  reason: string;
  fromStatus: ScenarioStatus;
}

export interface ScenarioState {
  opportunityId: string;
  status: ScenarioStatus;
  draft: CampaignDraft | null;
  approval: Approval | null;
  rejection: Rejection | null;
  outcome: SimulatedOutcome | null;
  executionStartedAt: string | null;
  /** Message from the most recent refused event, for display; cleared on success. */
  lastError: string | null;
}

export type ScenarioEvent =
  | { type: 'REVIEW' }
  | { type: 'START_DRAFT'; draft: CampaignDraft }
  | { type: 'UPDATE_DRAFT'; draft: CampaignDraft }
  | { type: 'SUBMIT_FOR_APPROVAL' }
  | { type: 'REQUEST_CHANGES' }
  | { type: 'APPROVE'; at: string; approvedBy: string }
  | { type: 'REJECT'; at: string; reason: string }
  | { type: 'START_EXECUTION'; at: string }
  | { type: 'COMPLETE'; outcome: SimulatedOutcome }
  | { type: 'RESET' };

export type TransitionResult = { ok: true; state: ScenarioState } | { ok: false; error: string };

export function initialScenario(opportunityId: string): ScenarioState {
  return {
    opportunityId,
    status: 'detected',
    draft: null,
    approval: null,
    rejection: null,
    outcome: null,
    executionStartedAt: null,
    lastError: null,
  };
}

/** Stable identity of a draft's content, used to bind an approval to exactly what was approved. */
export function draftFingerprint(draft: CampaignDraft): string {
  return JSON.stringify([
    draft.opportunityId,
    draft.interventionId,
    draft.offer,
    draft.message,
    [...draft.treatmentIds].sort(),
    [...draft.holdoutIds].sort(),
    draft.assumptions,
    draft.assumedReturnRate,
  ]);
}

/** Returns a list of problems that prevent a draft from being submitted; empty when valid. */
export function validateDraft(draft: CampaignDraft, opportunityId: string): string[] {
  const problems: string[] = [];
  if (draft.opportunityId !== opportunityId) problems.push('Draft belongs to a different opportunity.');
  if (draft.offer.kind === 'none') problems.push('"Do nothing" cannot be sent as a campaign.');
  if (draft.message.trim().length === 0) problems.push('Message is empty.');
  if (draft.treatmentIds.length === 0) problems.push('No customers selected to receive the offer.');
  if (draft.holdoutIds.length === 0) problems.push('A holdout group is required to measure the result.');
  const holdout = new Set(draft.holdoutIds);
  if (draft.treatmentIds.some((id) => holdout.has(id))) problems.push('A customer is in both treatment and holdout.');
  return problems;
}

const fail = (error: string): TransitionResult => ({ ok: false, error });

export function transition(state: ScenarioState, event: ScenarioEvent): TransitionResult {
  const ok = (next: Partial<ScenarioState>): TransitionResult => ({ ok: true, state: { ...state, ...next, lastError: null } });
  const refuse = () => fail(`Cannot ${event.type} while ${state.status}.`);

  switch (event.type) {
    case 'RESET':
      return { ok: true, state: initialScenario(state.opportunityId) };

    case 'REVIEW':
      return state.status === 'detected' ? ok({ status: 'reviewing' }) : refuse();

    case 'START_DRAFT':
      if (state.status !== 'reviewing' && state.status !== 'rejected') return refuse();
      if (event.draft.opportunityId !== state.opportunityId) return fail('Draft belongs to a different opportunity.');
      return ok({ status: 'drafting', draft: event.draft, rejection: null });

    case 'UPDATE_DRAFT':
      if (state.status !== 'drafting') return refuse();
      if (event.draft.opportunityId !== state.opportunityId) return fail('Draft belongs to a different opportunity.');
      return ok({ draft: event.draft });

    case 'SUBMIT_FOR_APPROVAL': {
      if (state.status !== 'drafting' || !state.draft) return refuse();
      const problems = validateDraft(state.draft, state.opportunityId);
      return problems.length > 0 ? fail(problems.join(' ')) : ok({ status: 'awaiting_approval' });
    }

    case 'REQUEST_CHANGES':
      return state.status === 'awaiting_approval' ? ok({ status: 'drafting' }) : refuse();

    case 'APPROVE':
      if (state.status !== 'awaiting_approval' || !state.draft) return refuse();
      if (event.approvedBy.trim().length === 0) return fail('Approval must name who approved.');
      return ok({
        status: 'approved',
        approval: { at: event.at, approvedBy: event.approvedBy, draftFingerprint: draftFingerprint(state.draft) },
      });

    case 'REJECT':
      if (state.status !== 'reviewing' && state.status !== 'drafting' && state.status !== 'awaiting_approval') {
        return refuse();
      }
      return ok({
        status: 'rejected',
        approval: null,
        rejection: { at: event.at, reason: event.reason, fromStatus: state.status },
      });

    case 'START_EXECUTION':
      if (state.status !== 'approved') return fail('Execution requires an explicit approval first.');
      if (!state.draft || !state.approval) return fail('Execution requires an approved draft.');
      if (state.approval.draftFingerprint !== draftFingerprint(state.draft)) {
        return fail('The draft changed after approval; approve it again.');
      }
      return ok({ status: 'executing', executionStartedAt: event.at });

    case 'COMPLETE':
      if (state.status !== 'executing') return refuse();
      if (event.outcome.simulated !== true) return fail('Only simulated outcomes are supported.');
      return ok({ status: 'measured', outcome: event.outcome });
  }
}

/** Reducer for UI use: applies valid events and records the reason for refused ones. */
export function scenarioReducer(state: ScenarioState, event: ScenarioEvent): ScenarioState {
  const result = transition(state, event);
  return result.ok ? result.state : { ...state, lastError: result.error };
}

// ── Selectors ────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ScenarioStatus, string> = {
  detected: 'New',
  reviewing: 'Under review',
  drafting: 'Draft in progress',
  awaiting_approval: 'Awaiting your approval',
  approved: 'Approved',
  executing: 'Simulating',
  measured: 'Simulated result ready',
  rejected: 'Dismissed',
};

export const SCENARIO_STEPS = ['Detect', 'Review', 'Draft', 'Approve', 'Simulate', 'Measure'] as const;

const STEP_INDEX: Record<ScenarioStatus, number> = {
  detected: 0,
  reviewing: 1,
  drafting: 2,
  awaiting_approval: 3,
  approved: 3,
  executing: 4,
  measured: 5,
  rejected: -1,
};

/** Index into SCENARIO_STEPS for a progress indicator; -1 when rejected. */
export function currentStepIndex(state: ScenarioState): number {
  return STEP_INDEX[state.status];
}

export function canExecute(state: ScenarioState): boolean {
  return (
    state.status === 'approved' &&
    state.draft !== null &&
    state.approval !== null &&
    state.approval.draftFingerprint === draftFingerprint(state.draft)
  );
}

export function isDraftEditable(state: ScenarioState): boolean {
  return state.status === 'drafting';
}

export function hasMeasuredOutcome(state: ScenarioState): state is ScenarioState & { outcome: SimulatedOutcome } {
  return state.status === 'measured' && state.outcome !== null;
}
