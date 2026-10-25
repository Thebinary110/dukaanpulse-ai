import { describe, expect, it } from 'vitest';
import { defaultDecisionSettings } from '../../domain/decision';
import { DEFAULT_ASSUMPTIONS } from '../../domain/interventions';
import { makeDraft } from '../../domain/__tests__/fixtures';
import { restoreWorkspace } from '../persistence';
import { initialScenario, transition } from '../scenario';

const defaults = defaultDecisionSettings(DEFAULT_ASSUMPTIONS);
const explorer = { settings: defaults, objective: 'profit' as const, selectedId: 'free-addon' };

function drafting() {
  const reviewing = transition(initialScenario('opp-1'), { type: 'REVIEW' });
  if (!reviewing.ok) throw new Error();
  const d = transition(reviewing.state, { type: 'START_DRAFT', draft: makeDraft() });
  if (!d.ok) throw new Error();
  return d.state;
}

describe('restoreWorkspace', () => {
  it('round-trips a saved workspace', () => {
    const saved = { scenario: drafting(), explorer };
    expect(restoreWorkspace(JSON.stringify(saved), 'opp-1', defaults)).toEqual(saved);
  });

  it.each([
    ['nothing saved', null],
    ['invalid JSON', '{nope'],
    ['wrong shape', JSON.stringify({ hello: 1 })],
    ['another opportunity', JSON.stringify({ scenario: { ...drafting(), opportunityId: 'other' }, explorer })],
    ['unknown status', JSON.stringify({ scenario: { ...drafting(), status: 'sent' }, explorer })],
    ['NaN assumption', JSON.stringify({ scenario: drafting(), explorer: { ...explorer, settings: { ...defaults, assumptions: { ...defaults.assumptions, grossMarginRate: 'x' } } } })],
    ['draft without a name (older format)', JSON.stringify({ scenario: { ...drafting(), draft: { ...makeDraft(), name: undefined } }, explorer })],
    ['draft with non-numeric offer', JSON.stringify({ scenario: { ...drafting(), draft: { ...makeDraft(), offer: { ...makeDraft().offer, valuePaise: 'lots' } } }, explorer })],
    ['unknown option', JSON.stringify({ scenario: drafting(), explorer: { ...explorer, selectedId: 'mystery' } })],
  ])('rejects %s', (_label, raw) => {
    expect(restoreWorkspace(raw as string | null, 'opp-1', defaults)).toBeNull();
  });

  it('clears any stale error message', () => {
    const saved = { scenario: { ...drafting(), lastError: 'old' }, explorer };
    expect(restoreWorkspace(JSON.stringify(saved), 'opp-1', defaults)?.scenario.lastError).toBeNull();
  });
});
