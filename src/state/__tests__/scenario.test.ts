import { describe, expect, it } from 'vitest';
import {
  canExecute,
  currentStepIndex,
  initialScenario,
  scenarioReducer,
  simulationSeed,
  transition,
  type ScenarioEvent,
  type ScenarioState,
  type ScenarioStatus,
} from '../scenario';
import { makeDraft } from '../../domain/__tests__/fixtures';
import { getIntervention } from '../../domain/interventions';
import type { SimulatedOutcome } from '../../domain/types';

const AT = '2026-10-20T10:00:00.000+05:30';
const draft = makeDraft();
const outcome = { simulated: true } as SimulatedOutcome;

function run(events: ScenarioEvent[], start: ScenarioState = initialScenario('opp-1')): ScenarioState {
  return events.reduce((state, event) => {
    const result = transition(state, event);
    if (!result.ok) throw new Error(`Unexpected refusal of ${event.type}: ${result.error}`);
    return result.state;
  }, start);
}

const toAwaiting: ScenarioEvent[] = [{ type: 'REVIEW' }, { type: 'START_DRAFT', draft }, { type: 'SUBMIT_FOR_APPROVAL' }];
const approve: ScenarioEvent = { type: 'APPROVE', at: AT, approvedBy: 'Merchant (demo)' };

/** A reachable state for every status. */
const STATES: Record<ScenarioStatus, ScenarioState> = {
  detected: run([]),
  reviewing: run([{ type: 'REVIEW' }]),
  drafting: run([{ type: 'REVIEW' }, { type: 'START_DRAFT', draft }]),
  awaiting_approval: run(toAwaiting),
  approved: run([...toAwaiting, approve]),
  executing: run([...toAwaiting, approve, { type: 'START_EXECUTION', at: AT }]),
  measured: run([...toAwaiting, approve, { type: 'START_EXECUTION', at: AT }, { type: 'COMPLETE', outcome }]),
  rejected: run([{ type: 'REVIEW' }, { type: 'REJECT', at: AT, reason: 'Not now' }]),
};

describe('scenario state machine', () => {
  it('walks the full path from detection to a measured outcome', () => {
    const s = STATES.measured;
    expect(s.status).toBe('measured');
    expect(s.approval).toMatchObject({ at: AT, approvedBy: 'Merchant (demo)' });
    expect(s.executionStartedAt).toBe(AT);
    expect(s.outcome?.simulated).toBe(true);
    expect(currentStepIndex(s)).toBe(5);
  });

  describe('approval gate', () => {
    const notApproved = (Object.keys(STATES) as ScenarioStatus[]).filter((s) => s !== 'approved');

    it.each(notApproved)('refuses to execute from %s', (status) => {
      const result = transition(STATES[status], { type: 'START_EXECUTION', at: AT });
      expect(result.ok).toBe(false);
      expect(canExecute(STATES[status])).toBe(false);
    });

    it('allows execution only after explicit approval', () => {
      expect(canExecute(STATES.approved)).toBe(true);
      expect(transition(STATES.approved, { type: 'START_EXECUTION', at: AT }).ok).toBe(true);
    });

    it('voids the approval if the draft is changed after approving', () => {
      const tampered: ScenarioState = { ...STATES.approved, draft: { ...draft, offer: { ...draft.offer, valuePaise: 9_900 } } };
      expect(canExecute(tampered)).toBe(false);
      const result = transition(tampered, { type: 'START_EXECUTION', at: AT });
      expect(result).toEqual({ ok: false, error: 'The draft changed after approval; approve it again.' });
    });

    it('does not allow editing an approved draft', () => {
      expect(transition(STATES.approved, { type: 'UPDATE_DRAFT', draft }).ok).toBe(false);
    });

    it('requires a named approver', () => {
      expect(transition(STATES.awaiting_approval, { ...approve, approvedBy: '  ' }).ok).toBe(false);
    });

    it('drops a previous approval when the campaign is rejected and redrafted', () => {
      const s = run([{ type: 'REJECT', at: AT, reason: 'Too generous' }, { type: 'START_DRAFT', draft }], STATES.awaiting_approval);
      expect(s.status).toBe('drafting');
      expect(s.approval).toBeNull();
      expect(s.rejection).toBeNull();
    });
  });

  describe('invalid transitions', () => {
    const allowed: Record<ScenarioStatus, ScenarioEvent['type'][]> = {
      detected: ['REVIEW', 'RESET'],
      reviewing: ['START_DRAFT', 'REJECT', 'RESET'],
      drafting: ['UPDATE_DRAFT', 'SUBMIT_FOR_APPROVAL', 'REJECT', 'RESET'],
      awaiting_approval: ['APPROVE', 'REQUEST_CHANGES', 'REJECT', 'RESET'],
      approved: ['START_EXECUTION', 'RESET'],
      executing: ['COMPLETE', 'RESET'],
      measured: ['RESET'],
      rejected: ['START_DRAFT', 'RESET'],
    };
    const sample: ScenarioEvent[] = [
      { type: 'REVIEW' },
      { type: 'START_DRAFT', draft },
      { type: 'UPDATE_DRAFT', draft },
      { type: 'SUBMIT_FOR_APPROVAL' },
      { type: 'REQUEST_CHANGES' },
      approve,
      { type: 'REJECT', at: AT, reason: 'No' },
      { type: 'START_EXECUTION', at: AT },
      { type: 'COMPLETE', outcome },
      { type: 'RESET' },
    ];
    const cases = (Object.keys(allowed) as ScenarioStatus[]).flatMap((status) =>
      sample.map((event) => ({ status, event: event.type, expectOk: allowed[status].includes(event.type), e: event })),
    );

    it.each(cases)('$status + $event → allowed: $expectOk', ({ status, e, expectOk }) => {
      expect(transition(STATES[status], e).ok).toBe(expectOk);
    });
  });

  describe('draft validation on submit', () => {
    const submitWith = (overrides: Parameters<typeof makeDraft>[0]) => {
      const drafting = run([{ type: 'REVIEW' }, { type: 'START_DRAFT', draft: makeDraft(overrides) }]);
      return transition(drafting, { type: 'SUBMIT_FOR_APPROVAL' });
    };

    it('rejects a "do nothing" campaign', () => {
      const none = getIntervention('no-action');
      expect(submitWith({ interventionId: none.id, offer: none.offer }).ok).toBe(false);
    });

    it('rejects an empty message, a missing holdout, or overlapping groups', () => {
      expect(submitWith({ message: '   ' }).ok).toBe(false);
      expect(submitWith({ holdoutIds: [] }).ok).toBe(false);
      expect(submitWith({ treatmentIds: ['C-1', 'C-2'], holdoutIds: ['C-2'] }).ok).toBe(false);
    });

    it('rejects a message that misstates the offer, an unnamed draft, or an invalid discount', () => {
      expect(submitWith({ message: 'Hi! Get ₹50 off your next order of ₹200 or more at Sunrise Bakery.' }).ok).toBe(false);
      expect(submitWith({ name: '' }).ok).toBe(false);
      const offer = { kind: 'flat_discount' as const, valuePaise: 15_000, costPerRedemptionPaise: 15_000, minSpendPaise: 20_000 };
      expect(submitWith({ offer, message: 'Hi! Get ₹150 off your next order of ₹200 or more at Sunrise Bakery.' }).ok).toBe(false);
    });

    it('rejects a draft for a different opportunity', () => {
      expect(transition(STATES.reviewing, { type: 'START_DRAFT', draft: makeDraft({ opportunityId: 'other' }) }).ok).toBe(false);
    });
  });

  it('refuses non-simulated outcomes', () => {
    const real = { ...outcome, simulated: false } as unknown as SimulatedOutcome;
    expect(transition(STATES.executing, { type: 'COMPLETE', outcome: real }).ok).toBe(false);
  });

  it('resets from any state to a clean detected state', () => {
    for (const s of Object.values(STATES)) {
      expect(run([{ type: 'RESET' }], s)).toEqual(initialScenario('opp-1'));
    }
  });

  it('reducer keeps the state and records the reason when an event is refused', () => {
    const next = scenarioReducer(STATES.detected, { type: 'START_EXECUTION', at: AT });
    expect(next.status).toBe('detected');
    expect(next.lastError).toMatch(/approval/);
    expect(scenarioReducer(next, { type: 'REVIEW' }).lastError).toBeNull();
  });

  it('derives a stable simulation seed from the exact approved configuration', () => {
    expect(simulationSeed(1, draft)).toBe(simulationSeed(1, { ...draft }));
    expect(simulationSeed(1, draft)).not.toBe(simulationSeed(1, { ...draft, name: 'Other' }));
    expect(simulationSeed(1, draft)).not.toBe(simulationSeed(2, draft));
  });

  it('maps rejection to no active step', () => {
    expect(currentStepIndex(STATES.rejected)).toBe(-1);
    expect(STATES.rejected.rejection).toMatchObject({ reason: 'Not now', fromStatus: 'reviewing' });
  });
});
