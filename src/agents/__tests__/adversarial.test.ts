/**
 * Adversarial evaluation: every case runs on the model-assisted path (a scripted model that writes
 * the injected claims) and on the rule-based path (the injected claims are reviewed against that
 * run's real evidence). Results are written to test-results/adversarial-report.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { ADVERSARIAL_CASES, bindRefs, type AdversarialCase } from '../adversarial';
import { AGENTS } from '../definitions';
import { emptyContext } from '../context';
import { ModelError, type ChatRequest, type ModelClient } from '../llm';
import { runQuestion } from '../orchestrator';
import { buildRecommendation } from '../recommendation';
import { indexMetrics } from '../render';
import { reviewFinding } from '../review';
import { scoreRun, type RunScores } from '../scoring';
import type { RunResult, SpecialistId, ToolResult } from '../types';
import { completedRecord, context } from './helpers';

const report: Record<string, unknown>[] = [];

function callIdsFromPrompt(user: string): Map<string, string> {
  return new Map([...user.matchAll(/^- ([a-z_]+) \((c\d+)\):/gm)].map((m) => [m[1]!, m[2]!]));
}

function callIdsFromRun(run: RunResult): Map<string, string> {
  const ids = new Map<string, string>();
  for (const r of run.reports) for (const o of r.toolCalls) if (o.ok) ids.set(o.tool, o.callId);
  return ids;
}

/** A model that plans the case's specialists and writes the case's injected claims. */
class ScriptedModel implements ModelClient {
  readonly model = 'scripted-adversary';
  constructor(private readonly c: AdversarialCase) {}
  async chat(req: ChatRequest): Promise<unknown> {
    const agents = Object.keys(this.c.tools) as SpecialistId[];
    if (req.system.includes('Intents:')) return { intent: this.c.intent, steps: agents.map((a) => ({ agent: a, task: 'Investigate.' })), rationale: 'Adversarial case.' };
    const agent = agents.find((a) => req.system.includes(`You are the ${AGENTS[a].name}`));
    if (req.system.includes('Choose the tool calls')) return { toolCalls: agent ? this.c.tools[agent] : [] };
    if (req.system.includes('one-sentence answer')) return { headline: 'Here is what the evidence shows.' };
    if (!agent) throw new ModelError('no agent', 'bad_output');
    const ids = callIdsFromPrompt(req.user);
    return { findings: this.c.injected.filter((i) => i.agent === agent).map((i) => ({ type: i.type, claim: bindRefs(i.claim, ids), citations: [] })) };
  }
}

function summarize(c: AdversarialCase, path: string, run: RunResult, before: string, after: string, rejectedExpected: number, survivedGood: number) {
  const scores: RunScores = scoreRun(run, before, after);
  report.push({ case: c.id, title: c.title, path, intent: run.plan.intent, injectedBad: c.injected.filter((i) => i.expectRule).length, rejectedExpected, goodInjected: c.injected.filter((i) => !i.expectRule).length, survivedGood, ...scores });
  return scores;
}

describe.each(ADVERSARIAL_CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
  it(`${c.title}: model-assisted path rejects the bad claim and keeps the good one`, async () => {
    const tools = context({ history: [completedRecord()] });
    const before = JSON.stringify(tools.scenario);
    const run = await runQuestion(c.question, emptyContext(), tools, { client: new ScriptedModel(c) });
    const after = JSON.stringify(tools.scenario);
    const rejected = run.reports.flatMap((r) => r.rejected);
    const shown = run.reports.flatMap((r) => r.findings).map((f) => f.claim);
    let rejectedExpected = 0;
    let survivedGood = 0;
    for (const inj of c.injected) {
      const bound = run.reports.flatMap((r) => [...r.findings, ...r.rejected.map((x) => x.finding)]).find((f) => f.claim === bindRefs(inj.claim, callIdsFromRun(run)));
      if (inj.expectRule) {
        const hit = rejected.find((x) => x.finding.claim === bound?.claim);
        expect(hit?.reasons.join(' '), `${inj.claim}`).toContain(inj.expectRule);
        expect(shown).not.toContain(bound?.claim);
        rejectedExpected += 1;
      } else {
        expect(shown, inj.claim).toContain(bound?.claim);
        survivedGood += 1;
      }
    }
    expect(run.plan.intent).toBe(c.intent);
    const s = summarize(c, 'model-assisted', run, before, after, rejectedExpected, survivedGood);
    expect(s.grounded).toBe(s.shown);
    expect(s.segmentPeriodOk).toBe(s.shown);
    expect(s.numericOk).toBe(s.shown);
    expect(s.uncertaintyOk).toBe(s.shown);
    expect(s.actionSafe).toBe(true);
    expect(run.review.decision).toBe('pass');
    if (c.intent === 'unanswerable') {
      expect(run.reports).toHaveLength(0);
      expect(run.answer.limitations.join(' ')).toMatch(/cannot see/);
    }
    if (c.intent === 'action_request') expect(run.action).not.toBeNull();
  });

  it(`${c.title}: rule-based path stays clean and the same claims are rejected against its evidence`, async () => {
    const tools = context({ history: [completedRecord()] });
    const before = JSON.stringify(tools.scenario);
    const run = await runQuestion(c.question, emptyContext(), tools, { client: null });
    const after = JSON.stringify(tools.scenario);
    const index = indexMetrics(run.reports.flatMap((r) => r.toolCalls));
    const ids = callIdsFromRun(run);
    let rejectedExpected = 0;
    let survivedGood = 0;
    for (const inj of c.injected) {
      const claim = bindRefs(inj.claim, ids);
      const f = { id: 'adv', agent: inj.agent, type: inj.type, claim, citations: [...claim.matchAll(/\{\{([a-z0-9_]+\.[a-z0-9_]+)\}\}/g)].map((m) => m[1]!) };
      const errs = reviewFinding(f, index).filter((i) => i.severity === 'error').map((i) => i.rule);
      if (inj.expectRule) {
        expect(errs, claim).toContain(inj.expectRule);
        rejectedExpected += 1;
      } else {
        expect(errs, claim).toEqual([]);
        survivedGood += 1;
      }
    }
    const s = summarize(c, 'rule-based', run, before, after, rejectedExpected, survivedGood);
    expect(s.rejected).toBe(0); // the rule-based engine writes nothing the reviewer must remove
    expect([s.grounded, s.segmentPeriodOk, s.numericOk, s.uncertaintyOk]).toEqual([s.shown, s.shown, s.shown, s.shown]);
    expect(s.actionSafe).toBe(true);
    expect(run.review.decision).toBe('pass');

    if (c.id === 'A7') {
      // Strip the cost assumptions from the comparison: the estimate is rejected and no recommendation is made.
      const stripped = run.reports.flatMap((r) => r.toolCalls).map((o) => (o.ok && o.tool === 'compare_interventions' ? { ...o, metrics: o.metrics.filter((m) => m.evidence !== 'assumed') } : o));
      const compareId = (stripped.find((o) => o.ok && o.tool === 'compare_interventions') as ToolResult).callId;
      const est = { id: 'x', agent: 'growth_strategist' as const, type: 'estimated' as const, claim: `The discount is expected to make {{${compareId}.discount_net}}.`, citations: [`${compareId}.discount_net`] };
      expect(reviewFinding(est, indexMetrics(stripped)).map((i) => i.rule)).toContain('S8 cost assumptions');
      expect(buildRecommendation('offer_strategy', stripped)?.status).toBe('insufficient');
    }
  });
});

afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/adversarial-report.json', JSON.stringify(report, null, 2));
});
