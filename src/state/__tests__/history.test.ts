import { describe, expect, it } from 'vitest';
import { buildLearningRecord } from '../../domain/results';
import { planAudience } from '../../domain/campaign';
import { simulateCampaign } from '../../domain/simulator';
import { cohort, makeDraft } from '../../domain/__tests__/fixtures';
import { appendRecord, MAX_HISTORY, restoreHistory } from '../history';

const { ids, baskets } = cohort(20);
const draft = makeDraft({ ...planAudience(ids, 1) });
const make = (i: number) =>
  buildLearningRecord({
    draft,
    outcome: simulateCampaign(draft, baskets, i),
    approval: { at: `2026-10-26T10:0${i % 10}:00.000Z`, approvedBy: 'Owner (demo)' },
    completedAt: '2026-10-26T11:00:00.000Z',
    averageBasketPaise: 25_000,
    basketByCustomer: baskets,
  });

describe('learning history', () => {
  it('round-trips through storage, newest first', () => {
    const h = appendRecord(appendRecord([], make(1)), make(2));
    expect(h.map((r) => r.seed)).toEqual([2, 1]);
    expect(restoreHistory(JSON.stringify(h))).toEqual(h);
  });

  it('ignores a record that is already present', () => {
    const r = make(3);
    expect(appendRecord([r], r)).toHaveLength(1);
  });

  it('keeps at most MAX_HISTORY records', () => {
    let h = appendRecord([], make(0));
    for (let i = 1; i < MAX_HISTORY + 5; i++) h = appendRecord(h, { ...make(i % 10), id: `run-${i}` });
    expect(h).toHaveLength(MAX_HISTORY);
  });

  it('drops malformed entries and rejects invalid storage', () => {
    const good = make(4);
    const broken = { ...good, outcome: { ...good.outcome, simulated: false } };
    const noNet = { ...good, id: 'other', estimate: { ...good.estimate, netIncrementalProfitPaise: 'lots' } };
    expect(restoreHistory(JSON.stringify([good, broken, noNet, 42, null]))).toEqual([good]);
    expect(restoreHistory(null)).toEqual([]);
    expect(restoreHistory('{oops')).toEqual([]);
    expect(restoreHistory('{"a":1}')).toEqual([]);
  });
});
