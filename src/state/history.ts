/**
 * Learning history: completed simulated runs, kept in this browser session under their own
 * storage key so that restarting the demo (which clears the workspace key) keeps them.
 * Pure: the caller does the storage access.
 */
import type { LearningRecord } from '../domain/results';

export const HISTORY_KEY = 'dukaanpulse.history.v1';
export const MAX_HISTORY = 10;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function validRecord(r: unknown): r is LearningRecord {
  if (!isObject(r) || r.version !== 1) return false;
  const strings = ['id', 'opportunityId', 'campaignName', 'interventionId', 'interventionLabel', 'offerLabel', 'message', 'approvedAt', 'approvedBy', 'completedAt'].every(
    (k) => typeof r[k] === 'string',
  );
  const numbers = ['assumedReturnRate', 'treatmentSize', 'holdoutSize', 'seed', 'runPercentile'].every((k) => finite(r[k]));
  const o = r.outcome;
  const outcomeOk =
    isObject(o) &&
    o.simulated === true &&
    isObject(o.treatment) &&
    isObject(o.holdout) &&
    ['returned', 'customers'].every((k) => finite((o.treatment as Record<string, unknown>)[k]) && finite((o.holdout as Record<string, unknown>)[k])) &&
    ['netIncrementalProfitPaise', 'offerCostPaise', 'messageCostPaise'].every((k) => finite(o[k]));
  const e = r.estimate;
  const estimateOk =
    isObject(e) &&
    ['expectedReturners', 'expectedHoldoutReturners', 'expectedIncrementalReturners', 'totalCostPaise', 'netIncrementalProfitPaise', 'downsideNetProfitPaise'].every((k) =>
      finite(e[k]),
    );
  const g = r.range;
  const rangeOk = isObject(g) && ['runs', 'p10Paise', 'p50Paise', 'p90Paise', 'probabilityProfitable'].every((k) => finite(g[k]));
  const binsOk = Array.isArray(r.bins) && r.bins.every((b) => isObject(b) && finite(b.from) && finite(b.to) && finite(b.count));
  return strings && numbers && outcomeOk && estimateOk && rangeOk && binsOk && isObject(r.offer) && isObject(r.assumptions);
}

/** Valid records from storage, newest first; malformed entries are dropped. */
export function restoreHistory(raw: string | null): LearningRecord[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(validRecord).slice(0, MAX_HISTORY);
}

/** Adds a record (newest first), ignoring one already present, keeping at most MAX_HISTORY. */
export function appendRecord(history: readonly LearningRecord[], record: LearningRecord): LearningRecord[] {
  if (history.some((r) => r.id === record.id)) return [...history];
  return [record, ...history].slice(0, MAX_HISTORY);
}
