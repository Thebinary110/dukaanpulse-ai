import { describe, expect, it } from 'vitest';
import { emptyContext } from '../context';
import { ModelError, type ChatRequest, type ModelClient } from '../llm';
import { runQuestion } from '../orchestrator';
import type { TraceEvent } from '../types';
import { context } from './helpers';

const tools = context();
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new ModelError('Stopped.', (signal.reason as { name?: string })?.name === 'TimeoutError' ? 'timeout' : 'aborted'));
    });
  });

type Handler = (req: ChatRequest) => unknown;

/** A scripted model: answers by which prompt it receives, with optional delay. */
class FakeClient implements ModelClient {
  readonly model = 'fake-model';
  calls: ChatRequest[] = [];
  constructor(
    private readonly handlers: { plan?: Handler; tools?: Handler; findings?: Handler; headline?: Handler },
    private readonly delayMs = 0,
  ) {}
  async chat(req: ChatRequest, signal: AbortSignal): Promise<unknown> {
    this.calls.push(req);
    if (this.delayMs) await sleep(this.delayMs, signal);
    const kind = req.system.includes('Intents:') ? 'plan' : req.system.includes('Choose the tool calls') ? 'tools' : req.system.includes('one-sentence answer') ? 'headline' : 'findings';
    const h = this.handlers[kind];
    if (!h) throw new ModelError('no handler', 'bad_output');
    return h(req);
  }
}

const refsFrom = (req: ChatRequest) => [...req.user.matchAll(/\{\{([a-z0-9_]+\.[a-z0-9_]+)\}\}/g)].map((m) => m[1]!);
const goodFindings: Handler = (req) => {
  const ref = refsFrom(req)[0];
  return { findings: ref ? [{ type: req.system.includes('Growth Strategist') ? 'estimated' : 'observed', claim: `The figure is {{${ref}}}.`, citations: [ref] }] : [] };
};

describe('orchestrator with a model client', () => {
  it('runs planned specialists in parallel and labels the run as model-driven', async () => {
    const events: TraceEvent[] = [];
    const client = new FakeClient(
      {
        plan: () => ({ intent: 'daypart', steps: [{ agent: 'business_analyst', task: 'Measure time of day.' }, { agent: 'customer_intelligence', task: 'Check lapses.' }], rationale: 'Independent checks.' }),
        tools: (req) => ({ toolCalls: [{ tool: req.system.includes('Business Analyst') ? 'daypart_breakdown' : 'lapse_evidence', args: {} }] }),
        findings: goodFindings,
        headline: (req) => ({ headline: `Morning revenue changed by {{${refsFrom(req)[0]}}}.` }),
      },
      30,
    );
    const run = await runQuestion('Why are morning sales down?', emptyContext(), tools, { client, onEvent: (e) => events.push(e) });
    expect(run.engine).toBe('llm');
    expect(run.reports.map((r) => r.engine)).toEqual(['llm', 'llm']);
    const starts = events.filter((e) => e.type === 'agent_start').map((e) => e.at);
    const firstDone = Math.min(...events.filter((e) => e.type === 'agent_done').map((e) => e.at));
    expect(starts).toHaveLength(2);
    expect(Math.max(...starts)).toBeLessThan(firstDone); // both started before either finished
    expect(run.review.decision).toBe('pass');
    expect(run.answer.headline).toMatch(/^Morning revenue changed by /);
    expect(run.answer.headline).not.toContain('{{');
  });

  it('falls back to rules per agent when the model returns unusable output, and says so', async () => {
    const client = new FakeClient({ plan: () => ({ nonsense: true }), tools: () => ({ toolCalls: 'x' }), findings: () => ({}) });
    const run = await runQuestion('Why are morning sales down?', emptyContext(), tools, { client, budget: { retries: 0 } });
    expect(run.plan.intent).toBe('daypart');
    expect(run.reports.every((r) => r.fellBack && r.engine === 'deterministic')).toBe(true);
    expect(run.notices.join(' ')).toMatch(/rule-based planning/);
    expect(run.review.decision).toBe('pass');
  });

  it('bounds slow model calls with per-call timeouts and still answers', async () => {
    const client = new FakeClient({ plan: () => ({}), tools: () => ({}), findings: () => ({}), headline: () => ({}) }, 10_000);
    const t0 = Date.now();
    const run = await runQuestion('Why are morning sales down?', emptyContext(), tools, { client, budget: { perCallTimeoutMs: 40, retries: 1 } });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(run.notices.join(' ')).toMatch(/timed out/);
    expect(run.answer.sections.length).toBeGreaterThan(0);
  });

  it('respects the model-call budget', async () => {
    const client = new FakeClient({ plan: () => ({ intent: 'daypart', steps: [{ agent: 'business_analyst', task: 'x' }, { agent: 'customer_intelligence', task: 'y' }], rationale: '' }), tools: () => ({ toolCalls: [{ tool: 'lapse_evidence' }] }), findings: goodFindings });
    const run = await runQuestion('Why are morning sales down?', emptyContext(), tools, { client, budget: { maxModelCalls: 2, retries: 0 } });
    expect(run.usage.modelCalls).toBeLessThanOrEqual(2);
    expect(run.notices.join(' ')).toMatch(/budget used up/);
  });

  it('refuses tools outside an agent’s permissions', async () => {
    const client = new FakeClient({
      plan: () => ({ intent: 'revenue_change', steps: [{ agent: 'business_analyst', task: 'x' }], rationale: '' }),
      tools: () => ({ toolCalls: [{ tool: 'prepare_campaign_draft', args: {} }, { tool: 'revenue_comparison', args: { rangeDays: 30 } }] }),
      findings: goodFindings,
    });
    const run = await runQuestion('Why did revenue decline?', emptyContext(), tools, { client });
    const calls = run.reports[0]!.toolCalls;
    expect(calls[0]).toMatchObject({ ok: false, error: 'Business Analyst is not permitted to use prepare_campaign_draft.' });
    expect(run.action).toBeNull();
  });

  it('enforces the tool-call budget', async () => {
    const run = await runQuestion('Why did revenue decline?', emptyContext(), tools, { client: null, budget: { maxToolCalls: 1 } });
    expect(run.usage.toolCalls).toBe(1);
    expect(run.status).toBe('partial');
  });

  it('reviews model findings, asks for one revision, and drops what still fails', async () => {
    const client = new FakeClient({
      plan: () => ({ intent: 'lapsed_customers', steps: [{ agent: 'customer_intelligence', task: 'Check lapses.' }], rationale: '' }),
      tools: () => ({ toolCalls: [{ tool: 'lapse_evidence' }] }),
      findings: (req) => {
        const ref = refsFrom(req).find((r) => r.endsWith('flagged_customers'))!;
        return {
          findings: [
            { type: 'observed', claim: `{{${ref}}} regulars are away.`, citations: [ref] },
            { type: 'observed', claim: 'Exactly 40% of regulars left because they moved.', citations: [] },
          ],
        };
      },
      headline: () => ({ headline: 'Regulars have lapsed.' }),
    });
    const run = await runQuestion('Which regulars have stopped coming?', emptyContext(), tools, { client });
    const report = run.reports[0]!;
    expect(report.findings.map((f) => f.claim)).toEqual([expect.stringContaining('regulars are away')]);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]!.reasons.join(' ')).toMatch(/R3 numbers/);
    expect(run.trace.filter((e) => e.type === 'review')).toHaveLength(2);
    expect(run.answer.sections.flatMap((s) => s.findings).map((f) => f.text).join(' ')).not.toMatch(/40%|moved/);
  });

  it('routes approval requests to the Action Planner only, even if the model plans otherwise', async () => {
    const client = new FakeClient({
      plan: () => ({ intent: 'offer_strategy', steps: [{ agent: 'growth_strategist', task: 'x' }], rationale: '' }),
      tools: () => ({ toolCalls: [{ tool: 'prepare_campaign_draft', args: { interventionId: 'win-back-30' } }] }),
      findings: goodFindings,
      headline: () => ({ headline: 'Campaign approved and sent.' }),
    });
    const run = await runQuestion('Approve and send the campaign', emptyContext(), tools, { client });
    expect(run.plan.intent).toBe('action_request');
    expect(run.reports.map((r) => r.agent)).toEqual(['action_planner']);
    expect(run.answer.headline).toMatch(/Only you can approve/);
    expect(JSON.stringify(tools.scenario)).toContain('"status":"detected"');
  });

  it('stops cleanly when cancelled', async () => {
    const controller = new AbortController();
    const client = new FakeClient({ plan: () => ({ intent: 'daypart', steps: [{ agent: 'business_analyst', task: 'x' }], rationale: '' }), tools: () => ({ toolCalls: [] }) }, 200);
    setTimeout(() => controller.abort(), 20);
    const run = await runQuestion('Why are morning sales down?', emptyContext(), tools, { client, signal: controller.signal });
    expect(run.status).toBe('partial');
    expect(run.notices.join(' ')).toMatch(/stopped/i);
  });
});

describe('runtime policies', () => {
  it('takes offer amounts only from the merchant, never from the model', async () => {
    const { applyPolicies } = await import('../orchestrator');
    const ctx = { ...emptyContext(), offer: { interventionId: 'win-back-30', discountRupees: 20 } };
    const out = applyPolicies('growth_strategist', 'offer_what_if', [{ tool: 'compare_interventions', args: {} }, { tool: 'blanket_discount', args: { discountRupees: 30 } }], ctx, 'What if ₹20?');
    expect(out[0]!.args).toEqual({ interventionId: 'win-back-30', discountRupees: 20 });
    expect(out[1]!.args).toEqual({ discountRupees: 30 }); // not an offer-targeting tool
    // A different option chosen by the model gives way to the one the merchant asked about.
    const other = applyPolicies('growth_strategist', 'offer_what_if', [{ tool: 'compare_interventions', args: { interventionId: 'free-addon', upliftPercent: 30 } }], ctx, 'x');
    expect(other[0]!.args).toEqual({ interventionId: 'win-back-30', discountRupees: 20 });
    // An amount the merchant never stated is dropped (here a minimum order the model made up).
    const invented = applyPolicies('growth_strategist', 'offer_what_if', [{ tool: 'compare_interventions', args: { minSpendRupees: 0 } }], ctx, 'x');
    expect(invented[0]!.args).toEqual({ interventionId: 'win-back-30', discountRupees: 20 });
    // Without stated terms, the model may still choose which option to look at, but not amounts.
    const free = applyPolicies('growth_strategist', 'offer_strategy', [{ tool: 'compare_interventions', args: { interventionId: 'free-addon', upliftPercent: 50 } }], emptyContext(), 'x');
    expect(free[0]!.args).toEqual({ interventionId: 'free-addon' });
  });

  it('always gives an action request a draft proposal', async () => {
    const { applyPolicies } = await import('../orchestrator');
    const out = applyPolicies('action_planner', 'action_request', [{ tool: 'campaign_status' }], emptyContext(), 'Approve it');
    expect(out.map((r) => r.tool)).toEqual(['campaign_status', 'prepare_campaign_draft']);
  });
});
