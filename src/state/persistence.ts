/**
 * Restores saved workspace state, rejecting anything malformed or stale.
 * Pure: the caller does the actual storage access.
 */
import type { DecisionSettings, Objective } from '../domain/decision';
import type { ScenarioState, ScenarioStatus } from './scenario';

export const STORAGE_KEY = 'dukaanpulse.workspace.v1';

export interface ExplorerState {
  settings: DecisionSettings;
  objective: Objective;
  /** Option the merchant picked; null = follow the recommendation. */
  selectedId: string | null;
}

export interface Workspace {
  scenario: ScenarioState;
  explorer: ExplorerState;
}

const STATUSES: readonly ScenarioStatus[] = [
  'detected',
  'reviewing',
  'drafting',
  'awaiting_approval',
  'approved',
  'executing',
  'measured',
  'rejected',
];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validSettings(v: unknown, expected: DecisionSettings): v is DecisionSettings {
  if (!isObject(v) || !isObject(v.assumptions) || !isObject(v.options)) return false;
  const assumptionsOk = Object.keys(expected.assumptions).every((k) => Number.isFinite((v.assumptions as Record<string, unknown>)[k]));
  const optionsOk = Object.keys(expected.options).every((id) => {
    const o = (v.options as Record<string, unknown>)[id];
    return isObject(o) && ['valuePaise', 'costPerRedemptionPaise', 'minSpendPaise', 'uplift'].every((k) => Number.isFinite(o[k]));
  });
  return assumptionsOk && optionsOk;
}

function validDraft(d: unknown): boolean {
  if (!isObject(d) || !isObject(d.offer) || !isObject(d.assumptions)) return false;
  const strings = ['opportunityId', 'interventionId', 'name', 'message'].every((k) => typeof d[k] === 'string');
  const ids = [d.treatmentIds, d.holdoutIds].every((a) => Array.isArray(a) && a.every((x) => typeof x === 'string'));
  const offer = ['valuePaise', 'costPerRedemptionPaise', 'minSpendPaise'].every((k) => Number.isFinite((d.offer as Record<string, unknown>)[k]));
  return strings && ids && offer && Number.isFinite(d.assumedReturnRate);
}

/**
 * Returns the saved workspace if it belongs to the current opportunity and is well-formed,
 * otherwise null (the caller starts fresh).
 */
export function restoreWorkspace(raw: string | null, opportunityId: string, defaults: DecisionSettings): Workspace | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !isObject(parsed.scenario) || !isObject(parsed.explorer)) return null;
  const s = parsed.scenario;
  if (s.opportunityId !== opportunityId || !STATUSES.includes(s.status as ScenarioStatus)) return null;
  if (s.draft !== null && !validDraft(s.draft)) return null;
  if (s.approval !== null && !isObject(s.approval)) return null;
  const e = parsed.explorer;
  if (!validSettings(e.settings, defaults)) return null;
  if (e.objective !== 'profit' && e.objective !== 'customers') return null;
  if (e.selectedId !== null && (typeof e.selectedId !== 'string' || !(e.selectedId in defaults.options))) return null;
  return {
    scenario: { ...(s as unknown as ScenarioState), lastError: null },
    explorer: { settings: e.settings, objective: e.objective, selectedId: e.selectedId as string | null },
  };
}
