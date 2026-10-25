/**
 * Live evaluation against the local model (opt-in: `npm run eval:agents`).
 * Runs the fixed cases through the model-driven orchestrator and writes a report to
 * test-results/agent-eval.json. It records failures rather than hiding them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyContext } from '../context';
import { checkCase, EVAL_CASES } from '../eval';
import { OllamaClient } from '../llm';
import { runQuestion } from '../orchestrator';
import { scoreRun } from '../scoring';
import { completedRecord, context } from './helpers';

const enabled = process.env.DUKAANPULSE_LLM_EVAL === '1';
const model = process.env.DUKAANPULSE_MODEL ?? 'qwen3.6:35b';
const url = process.env.DUKAANPULSE_OLLAMA_URL ?? 'http://127.0.0.1:11434';

describe.skipIf(!enabled)(`live evaluation with ${model}`, () => {
  it('runs every case and writes a report', async () => {
    const client = new OllamaClient(model, url, true);
    const tools = context({ history: [completedRecord()] });
    const rows = [];
    for (const c of EVAL_CASES) {
      let ctx = emptyContext();
      for (const setup of c.setup ?? []) ctx = (await runQuestion(setup, ctx, tools, { client })).context;
      const before = JSON.stringify(tools.scenario);
      const run = await runQuestion(c.question, ctx, tools, { client });
      const failures = checkCase(c, run);
      const scores = scoreRun(run, before, JSON.stringify(tools.scenario));
      rows.push({
        case: c.id,
        question: c.question,
        passed: failures.length === 0,
        failures,
        intent: run.plan.intent,
        planEngine: run.trace.find((e) => e.type === 'plan')?.type === 'plan' ? (run.trace.find((e) => e.type === 'plan') as { engine: string }).engine : null,
        agents: run.reports.map((r) => `${r.agent}${r.round > 1 ? ' (round 2)' : ''}${r.fellBack ? ' [fallback]' : ''}`),
        toolCalls: run.reports.flatMap((r) => r.toolCalls.map((t) => (t.ok ? t.tool : `${t.tool} (rejected: ${t.error})`))),
        rejectedFindings: run.reports.flatMap((r) => r.rejected.map((x) => x.reasons.join('; '))),
        scores,
        recommendation: run.answer.recommendation ? { status: run.answer.recommendation.status, action: run.answer.recommendation.action } : null,
        review: run.review.decision,
        modelCalls: run.usage.modelCalls,
        elapsedMs: run.usage.elapsedMs,
        headline: run.answer.headline,
        notices: run.notices,
      });
    }
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/agent-eval.json', JSON.stringify({ model, ranAt: new Date().toISOString(), passed: rows.filter((r) => r.passed).length, total: rows.length, rows }, null, 2));
    expect(rows).toHaveLength(EVAL_CASES.length);
  }, 900_000);
});
