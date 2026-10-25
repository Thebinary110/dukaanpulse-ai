/**
 * Fixed evaluation suite, deterministic engine. The same cases run against the local model
 * with `npm run eval:agents` (see scripts/eval-agents.ts).
 */
import { describe, expect, it } from 'vitest';
import { emptyContext } from '../context';
import { runQuestion } from '../orchestrator';
import { indexMetrics } from '../render';
import type { RunResult } from '../types';
import { EVAL_CASES, checkCase } from '../eval';
import { completedRecord, context } from './helpers';

const tools = context({ history: [completedRecord()] });

async function ask(q: string, ctx = emptyContext()): Promise<RunResult> {
  return runQuestion(q, ctx, tools, { client: null });
}

describe('evaluation cases (deterministic engine)', () => {
  it.each(EVAL_CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    let ctx = emptyContext();
    for (const setup of c.setup ?? []) ctx = (await ask(setup, ctx)).context;
    const run = await ask(c.question, ctx);
    const failures = checkCase(c, run);
    expect(failures).toEqual([]);
  });
});

describe('deterministic runs', () => {
  it('revenue question: analyst first, customer evidence requested in a second round', async () => {
    const run = await ask('Why did revenue decline?');
    expect(run.plan.steps.map((s) => s.agent)).toEqual(['business_analyst']);
    expect(run.reports.map((r) => [r.agent, r.round])).toEqual([
      ['business_analyst', 1],
      ['customer_intelligence', 2],
    ]);
    expect(run.trace.some((e) => e.type === 'follow_up')).toBe(true);
    expect(run.answer.sections.find((s) => s.type === 'hypothesis')?.findings.length).toBeGreaterThan(0);
    expect(run.engine).toBe('deterministic');
  });

  it('every rendered number traces back to a tool metric with provenance', async () => {
    const run = await ask('Why are morning sales down?');
    const outcomes = run.reports.flatMap((r) => r.toolCalls);
    const index = indexMetrics(outcomes);
    for (const s of run.answer.sections) for (const f of s.findings) for (const c of f.citations) expect(index.has(c)).toBe(true);
    for (const o of outcomes) if (o.ok) expect(o.provenance.datasetSeed).toBe(tools.dataset.seed);
    expect(run.review.decision).toBe('pass');
  });

  it('keeps offer context across follow-ups', async () => {
    const first = await ask('What if I change the offer to ₹20?');
    expect(first.context.offer).toMatchObject({ discountRupees: 20, interventionId: 'win-back-30' });
    const second = await ask('And with a minimum order of ₹300?', first.context);
    expect(second.plan.intent).toBe('offer_what_if');
    const call = second.reports[0]!.toolCalls[0]!;
    expect(call.ok && call.provenance.args).toMatchObject({ discountRupees: 20, minSpendRupees: 300 });
    expect(second.answer.sections.flatMap((s) => s.findings).map((f) => f.text).join(' ')).toContain('₹20 off on ₹300+');
  });

  it('is repeatable', async () => {
    const a = await ask('Should I give everyone a discount?');
    const b = await ask('Should I give everyone a discount?');
    expect(b.answer.sections.map((s) => s.findings.map((f) => f.text))).toEqual(a.answer.sections.map((s) => s.findings.map((f) => f.text)));
  });
});
