/**
 * Orchestration runtime: plan → specialists in parallel → optional second evidence round →
 * synthesis → independent review (one revision at most) → answer.
 *
 * Bounded by a budget (rounds, tool calls, model calls, elapsed time, per-call timeout,
 * retries). Every tool call is permission-checked against the calling agent and argument-
 * validated. With a model client, the Orchestrator and specialists use the model for planning,
 * tool choice, findings and the headline; any model failure falls back to the deterministic
 * engine for that step and is labelled. Without a client, the whole run is deterministic.
 */
import { AGENTS, canUseTool, SPECIALISTS } from './definitions';
import { describeContext, parseOffer, updateContext } from './context';
import {
  classifyIntent,
  DATA_SCOPE,
  findingsFor,
  FOLLOW_UPS,
  followUpsFor,
  headlineFor,
  planFor,
  synthesisFindings,
  rangeFromQuestion,
  toolsFor,
} from './deterministic';
import { ModelError, type ModelClient } from './llm';
import { formatMetric, indexMetrics, refsIn, renderClaim, strayNumbers } from './render';
import { contradictedPremise, review, reviewFinding } from './review';
import { runTool, toolSchemaText, type ToolContext } from './tools/registry';
import type {
  ActionProposal,
  AgentReport,
  Answer,
  Budget,
  ConversationContext,
  Engine,
  EvidenceType,
  Finding,
  Intent,
  Plan,
  ReviewResult,
  RunResult,
  SpecialistId,
  ToolCallRequest,
  ToolOutcome,
  TraceEvent,
} from './types';

export const DEFAULT_BUDGET: Budget = {
  maxRounds: 2,
  maxToolCalls: 14,
  maxModelCalls: 12,
  maxElapsedMs: 120_000,
  perCallTimeoutMs: 45_000,
  retries: 1,
};

export const DISCLOSURE = 'Synthetic demo data for a fictional bakery. Simulated campaigns only; nothing is sent and no money moves. Not real Paytm or merchant data.';

const INTENTS: readonly Intent[] = [
  'revenue_change',
  'daypart',
  'lapsed_customers',
  'offer_strategy',
  'blanket_discount',
  'offer_what_if',
  'experiment_results',
  'campaign_status',
  'action_request',
  'unanswerable',
  'greeting',
];
const SECTION_ORDER: readonly EvidenceType[] = ['observed', 'estimated', 'assumed', 'simulated', 'hypothesis'];
const APPROVAL_REQUEST = /\b(approve|send|launch|go live|blast|execute|pay|transfer|refund|message (?:all|them|every)|whatsapp (?:all|them))\b/i;

export interface RunOptions {
  /** null = deterministic run. */
  client: ModelClient | null;
  budget?: Partial<Budget>;
  signal?: AbortSignal;
  onEvent?: (e: TraceEvent) => void;
  now?: () => number;
}

class BudgetExceeded extends Error {}

export async function runQuestion(question: string, context: ConversationContext, tools: ToolContext, options: RunOptions): Promise<RunResult> {
  const budget = { ...DEFAULT_BUDGET, ...options.budget };
  const now = options.now ?? (() => Date.now());
  const started = now();
  const trace: TraceEvent[] = [];
  const notices: string[] = [];
  const usage = { toolCalls: 0, modelCalls: 0, elapsedMs: 0, rounds: 0 };
  let partial = false;
  let callSeq = 0;
  const outcomes: ToolOutcome[] = [];
  const client = options.client;
  const engine: Engine = client ? 'llm' : 'deterministic';

  const emit = (e: TraceEvent) => {
    trace.push(e);
    options.onEvent?.(e);
  };
  const elapsed = () => now() - started;
  const timeLeft = () => budget.maxElapsedMs - elapsed();
  const notice = (message: string) => {
    if (!notices.includes(message)) notices.push(message);
    emit({ type: 'notice', at: elapsed(), message });
  };

  // ── Model calls with budget, timeout and retry ──
  async function ask<T>(system: string, user: string, schema: { schema: Record<string, unknown>; example: unknown }, validate: (v: unknown) => T | null): Promise<T> {
    if (!client) throw new ModelError('No model.', 'unavailable');
    let lastError: ModelError | null = null;
    for (let attempt = 0; attempt <= budget.retries; attempt++) {
      if (usage.modelCalls >= budget.maxModelCalls) throw new BudgetExceeded('Model-call budget used up.');
      if (timeLeft() <= 0) throw new BudgetExceeded('Time budget used up.');
      if (options.signal?.aborted) throw new ModelError('Stopped.', 'aborted');
      usage.modelCalls += 1;
      const timeout = AbortSignal.timeout(Math.max(1, Math.min(budget.perCallTimeoutMs, timeLeft())));
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      try {
        const raw = await client.chat({ system, user, schema: schema.schema, example: schema.example }, signal);
        const ok = validate(raw);
        if (ok !== null) return ok;
        lastError = new ModelError('Model reply did not match the expected structure.', 'bad_output');
      } catch (e) {
        lastError = e instanceof ModelError ? e : new ModelError(e instanceof Error ? e.message : 'Model failed.', 'unavailable');
        if (lastError.kind === 'aborted') throw lastError;
      }
    }
    throw lastError ?? new ModelError('Model failed.', 'unavailable');
  }

  function describeFailure(e: unknown): string {
    if (e instanceof BudgetExceeded) return e.message;
    if (e instanceof ModelError) return e.kind === 'timeout' ? 'model timed out' : e.kind === 'bad_output' ? 'model returned an unusable answer' : e.kind === 'aborted' ? 'stopped' : 'model unavailable';
    return 'model failed';
  }

  // ── Tools with permissions and budget ──
  function callTool(agent: SpecialistId, request: ToolCallRequest): ToolOutcome {
    callSeq += 1;
    const callId = `c${callSeq}`;
    let outcome: ToolOutcome;
    if (!canUseTool(agent, request.tool)) {
      outcome = { callId, tool: request.tool, ok: false, error: `${AGENTS[agent].name} is not permitted to use ${request.tool}.` };
    } else if (usage.toolCalls >= budget.maxToolCalls) {
      partial = true;
      outcome = { callId, tool: request.tool, ok: false, error: 'Tool-call budget used up.' };
    } else {
      usage.toolCalls += 1;
      outcome = runTool(request, tools, callId);
    }
    outcomes.push(outcome);
    emit({ type: 'tool', at: elapsed(), agent, outcome });
    return outcome;
  }

  // ── Intent and plan ──
  const parsedOffer = parseOffer(question);
  const ruleIntent = classifyIntent(question, context);
  const runContext: ConversationContext = { ...context, offer: { ...context.offer, ...parsedOffer } };
  let plan: Plan = planFor(ruleIntent);
  let planEngine: Engine = 'deterministic';
  if (client && ruleIntent !== 'unanswerable' && ruleIntent !== 'greeting') {
    try {
      plan = await ask(planSystem(), `Question: ${question}\nContext: ${describeContext(runContext)}`, PLAN_SCHEMA, validatePlan);
      planEngine = 'llm';
      // Guardrail: an explicit approve/send request is always handled by the Action Planner alone.
      if (APPROVAL_REQUEST.test(question) && (plan.intent !== 'action_request' || plan.steps.some((s) => s.agent !== 'action_planner'))) {
        plan = planFor('action_request');
        planEngine = 'deterministic';
        notice('Approval and sending requests are always routed to the Action Planner only.');
      }
    } catch (e) {
      notice(`Orchestrator used rule-based planning (${describeFailure(e)}).`);
    }
  } else if (client && (ruleIntent === 'unanswerable' || ruleIntent === 'greeting')) {
    notice(ruleIntent === 'unanswerable' ? 'Out-of-scope question detected by rule; no specialists were run.' : 'Greeting; no investigation needed.');
  }
  emit({ type: 'plan', at: elapsed(), plan, engine: planEngine });
  const intent = plan.intent;

  // ── Specialists ──
  const reports: AgentReport[] = [];
  async function runSpecialist(agent: SpecialistId, task: string, round: number): Promise<AgentReport> {
    emit({ type: 'agent_start', at: elapsed(), agent, task, round });
    let usedEngine: Engine = client ? 'llm' : 'deterministic';
    let fellBack = false;
    const def = AGENTS[agent];

    let requests: ToolCallRequest[];
    if (client) {
      try {
        requests = await ask(toolSystem(agent), `Task: ${task}\nQuestion: ${question}\nContext: ${describeContext(runContext)}`, toolSchema(agent), (v) => validateToolChoice(v, def.maxToolCalls));
        if (requests.length === 0) throw new ModelError('No tools chosen.', 'bad_output');
      } catch (e) {
        if (e instanceof ModelError && e.kind === 'aborted') throw e;
        requests = toolsFor(agent, intent, runContext, question);
        fellBack = true;
        usedEngine = 'deterministic';
        notice(`${def.name} chose tools by rule (${describeFailure(e)}).`);
      }
    } else {
      requests = toolsFor(agent, intent, runContext, question);
    }
    requests = applyPolicies(agent, intent, requests.slice(0, def.maxToolCalls), runContext, question);
    const own = requests.map((r) => callTool(agent, r));

    let findings: Finding[];
    if (client && !fellBack) {
      try {
        findings = (await ask(findingsSystem(agent), findingsUser(task, question, own), findingsSchema(agent), validateFindings)).map((f) => toFinding(agent, f));
      } catch (e) {
        if (e instanceof ModelError && e.kind === 'aborted') throw e;
        findings = findingsFor(agent, intent, own);
        fellBack = true;
        usedEngine = 'deterministic';
        notice(`${def.name} wrote findings by rule (${describeFailure(e)}).`);
      }
    } else {
      findings = findingsFor(agent, intent, own);
    }
    const report: AgentReport = { agent, task, engine: usedEngine, fellBack, toolCalls: own, findings, rejected: [], round };
    emit({ type: 'agent_done', at: elapsed(), agent, findings: findings.length, engine: usedEngine, fellBack });
    return report;
  }

  try {
    usage.rounds = 1;
    reports.push(...(await Promise.all(plan.steps.map((s) => runSpecialist(s.agent, s.task, 1)))));
    if (budget.maxRounds > 1 && timeLeft() > 0) {
      const more = followUpsFor(intent, outcomes, reports.map((r) => r.agent));
      if (more.length > 0) {
        usage.rounds = 2;
        for (const m of more) emit({ type: 'follow_up', at: elapsed(), agent: m.agent, reason: m.reason });
        reports.push(...(await Promise.all(more.map((m) => runSpecialist(m.agent, m.reason, 2)))));
      }
    }
  } catch (e) {
    partial = true;
    notice(e instanceof ModelError && e.kind === 'aborted' ? 'The investigation was stopped before it finished.' : `The investigation stopped early (${describeFailure(e)}).`);
  }

  // ── Synthesis ──
  const synthesis = synthesisFindings(intent, outcomes);
  let headline = headlineFor(intent, outcomes);
  if (client && reports.length > 0 && !partial) {
    try {
      const all = [...reports.flatMap((r) => r.findings), ...synthesis];
      const proposed = await ask(headlineSystem(), headlineUser(question, all, outcomes), HEADLINE_SCHEMA, (v) => {
        const h = (v as { headline?: unknown }).headline;
        return typeof h === 'string' && h.trim().length > 0 ? h.trim() : null;
      });
      const index = indexMetrics(outcomes);
      if (strayNumbers(proposed).length === 0 && refsIn(proposed).every((r) => index.has(r))) headline = proposed;
      else notice('Orchestrator headline used numbers not taken from tools, so the rule-based headline was used.');
    } catch (e) {
      notice(`Orchestrator used a rule-based headline (${describeFailure(e)}).`);
    }
  }
  if (APPROVAL_REQUEST.test(question)) {
    headline = headlineFor('action_request', outcomes);
    notice('DukaanPulse cannot approve, send or pay. You approve campaigns yourself in Campaign Studio, and this prototype never sends anything.');
  }

  // ── Review, with one revision ──
  const limitationsFor = (fs: readonly Finding[]) => {
    const cited = new Set(fs.flatMap((f) => f.citations.map((c) => c.split('.')[0])));
    const lim = outcomes.filter((o): o is Extract<ToolOutcome, { ok: true }> => o.ok && cited.has(o.callId)).flatMap((o) => o.limitations);
    return [...new Set(lim)].slice(0, 6);
  };
  const reviewAll = (): ReviewResult => {
    const fs = [...reports.flatMap((r) => r.findings), ...synthesis];
    return review({ findings: fs, outcomes, disclosure: DISCLOSURE, limitations: limitationsFor(fs), headline });
  };

  let result = reviewAll();
  emit({ type: 'review', at: elapsed(), result, attempt: 1 });
  if (result.decision === 'revise') {
    if (result.issues.some((i) => i.findingId === null && /Headline/.test(i.message))) headline = headlineFor(intent, outcomes);
    const index = indexMetrics(outcomes);
    for (const report of reports) {
      const bad = report.findings.filter((f) => reviewFinding(f, index).some((i) => i.severity === 'error'));
      if (bad.length === 0) continue;
      if (client && report.engine === 'llm') {
        try {
          const reasons = bad.map((f) => `- "${f.claim}": ${reviewFinding(f, index).filter((i) => i.severity === 'error').map((i) => i.message).join(' ')}`).join('\n');
          const fixed = (await ask(findingsSystem(report.agent), `${findingsUser(report.task, question, report.toolCalls)}\n\nThe Risk Reviewer rejected these findings:\n${reasons}\nReturn corrected versions of them, or leave them out.`, findingsSchema(report.agent), validateFindings)).map((f) => toFinding(report.agent, f));
          const kept = report.findings.filter((f) => !bad.includes(f));
          const keptClaims = new Set(kept.map((f) => f.claim));
          report.findings = [...kept, ...fixed.filter((f) => !keptClaims.has(f.claim))];
        } catch (e) {
          notice(`${AGENTS[report.agent].name} could not revise its findings (${describeFailure(e)}).`);
        }
      }
      const stillBad = report.findings.filter((f) => reviewFinding(f, index).some((i) => i.severity === 'error'));
      report.rejected.push(...stillBad.map((f) => ({ finding: f, reasons: reviewFinding(f, index).filter((i) => i.severity === 'error').map((i) => `${i.rule}: ${i.message}`) })));
      report.findings = report.findings.filter((f) => !stillBad.includes(f));
    }
    result = reviewAll();
    emit({ type: 'review', at: elapsed(), result, attempt: 2 });
  }

  // ── Answer ──
  const index = indexMetrics(outcomes);
  const finalFindings = dedupeFindings([...reports.flatMap((r) => r.findings), ...synthesis.filter((f) => !reviewFinding(f, index).some((i) => i.severity === 'error'))]);
  const premise = intent === 'revenue_change' || intent === 'daypart' ? contradictedPremise(question, outcomes) : null;
  const answer: Answer = {
    headline: renderClaim(headline, index),
    sections: SECTION_ORDER.map((type) => ({
      type,
      findings: finalFindings.filter((f) => f.type === type).map((f) => ({ id: f.id, agent: f.agent, text: renderClaim(f.claim, index), citations: f.citations })),
    })).filter((s) => s.findings.length > 0),
    limitations: intent === 'unanswerable' ? [DATA_SCOPE] : limitationsFor(finalFindings),
    disclosure: DISCLOSURE,
    premiseNote: premise
      ? `Your question assumes it went ${premise.claimed === 'doubled' ? 'up sharply' : premise.claimed}, but the data shows a change of ${formatMetric(index.get(premise.ref)!.metric)} against the previous window.`
      : null,
    followUps: FOLLOW_UPS[intent],
  };
  const proposalOutcome = outcomes.find((o) => o.ok && o.tool === 'prepare_campaign_draft');
  const action: ActionProposal | null = proposalOutcome && proposalOutcome.ok ? (proposalOutcome.proposal ?? null) : null;

  usage.elapsedMs = elapsed();
  return {
    question,
    engine,
    model: client?.model ?? null,
    plan,
    reports,
    review: result,
    answer,
    action,
    trace,
    usage,
    context: updateContext(context, intent, parsedOffer),
    status: partial ? 'partial' : 'complete',
    notices,
  };
}

// ── Runtime policies on tool calls ─────────────────────────────────────────

const OFFER_TOOLS = new Set(['compare_interventions', 'prepare_campaign_draft']);
const RANGE_TOOLS = new Set(['revenue_comparison', 'revenue_drivers', 'daypart_breakdown', 'customer_mix', 'blanket_discount']);

/** Drops findings that repeat an earlier one (same wording, or nearly the same words). */
export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const words = (s: string) => new Set(s.toLowerCase().replace(/\{\{[^}]+\}\}/g, ' n ').split(/[^a-z]+/).filter((w) => w.length > 2));
  const kept: { f: Finding; w: Set<string> }[] = [];
  for (const f of findings) {
    const w = words(f.claim);
    const similar = kept.some((k) => {
      if (k.f.type !== f.type) return false;
      const shared = [...w].filter((x) => k.w.has(x)).length;
      return shared / Math.max(1, Math.min(w.size, k.w.size)) >= 0.8;
    });
    if (!similar) kept.push({ f, w });
  }
  return kept.map((k) => k.f);
}

/**
 * Policies the runtime applies to any engine's tool choice:
 * - Offer amounts come only from the merchant: amounts a model puts in offer-tool arguments are
 *   discarded, and the terms the merchant stated (this turn or earlier) are filled in. A model
 *   can neither invent an amount nor silently drop one.
 * - The comparison window comes from the merchant's question (a month unless they say a week or
 *   a quarter); a model cannot quietly switch to a window that tells a different story.
 * - An action request always yields a draft proposal for the merchant to review, so the
 *   Action Planner's tool list always includes prepare_campaign_draft.
 */
export function applyPolicies(agent: SpecialistId, intent: Intent, requests: ToolCallRequest[], ctx: ConversationContext, question: string): ToolCallRequest[] {
  const offer = ctx.offer;
  const range = rangeFromQuestion(question);
  let out = requests.map((r) => {
    if (RANGE_TOOLS.has(r.tool)) return { ...r, args: { ...(r.args ?? {}), rangeDays: range } };
    if (!OFFER_TOOLS.has(r.tool)) return r;
    const { discountRupees: _d, minSpendRupees: _m, upliftPercent: _u, ...rest } = r.args ?? {};
    const args: Record<string, unknown> = { ...rest };
    // The merchant's stated option wins over a different option the model picked.
    if (offer.interventionId) args.interventionId = offer.interventionId;
    if (offer.discountRupees !== undefined) args.discountRupees = offer.discountRupees;
    if (offer.minSpendRupees !== undefined) args.minSpendRupees = offer.minSpendRupees;
    if (r.tool === 'compare_interventions' && offer.upliftPercent !== undefined) args.upliftPercent = offer.upliftPercent;
    if (args.interventionId === 'no-action' && r.tool === 'prepare_campaign_draft') args.interventionId = 'win-back-30';
    return { ...r, args };
  });
  if (isActionStep(agent, intent) && !out.some((r) => r.tool === 'prepare_campaign_draft')) {
    const fallback = toolsFor('action_planner', 'action_request', ctx, question).find((r) => r.tool === 'prepare_campaign_draft')!;
    out = [...out.slice(0, AGENTS.action_planner.maxToolCalls - 1), fallback];
  }
  return out;
}

function isActionStep(agent: SpecialistId, intent: Intent): boolean {
  return agent === 'action_planner' && intent === 'action_request';
}

// ── Prompts and schemas ────────────────────────────────────────────────────

function planSystem(): string {
  const specialists = SPECIALISTS.map((id) => `- ${id}: ${AGENTS[id].role}`).join('\n');
  return [
    `You are the ${AGENTS.orchestrator.name} of DukaanPulse, a growth assistant for a fictional bakery. All data is synthetic.`,
    AGENTS.orchestrator.role,
    `Specialists:\n${specialists}`,
    `Intents: ${INTENTS.join(', ')}.`,
    ...AGENTS.orchestrator.instructions,
    '"Why did X change?" questions ARE answerable: the specialists measure what changed and offer clearly labelled possible explanations. Only questions that need data DukaanPulse does not have are unanswerable.',
    'Revenue or sales questions: business_analyst. Time-of-day questions: business_analyst and customer_intelligence. Customer/lapse questions: customer_intelligence. Offer questions: growth_strategist (plus experiment_scientist for test size). Discount for everyone: growth_strategist and customer_intelligence. Last campaign / results: experiment_scientist. Drafting or approving/sending: action_planner only.',
    'Return JSON only. Each task is one short sentence with no numbers. Use 0 to 3 steps.',
  ].join('\n');
}

const PLAN_SCHEMA = {
  example: { intent: 'daypart', steps: [{ agent: 'business_analyst', task: 'Measure what changed by time of day.' }, { agent: 'customer_intelligence', task: 'Check whether regulars who come at that time have lapsed.' }], rationale: 'Two independent checks.' },
  schema: {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS },
    steps: { type: 'array', items: { type: 'object', properties: { agent: { type: 'string', enum: SPECIALISTS }, task: { type: 'string' } }, required: ['agent', 'task'] } },
    rationale: { type: 'string' },
  },
  required: ['intent', 'steps', 'rationale'],
  },
};

function validatePlan(v: unknown): Plan | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as { intent?: unknown; steps?: unknown; rationale?: unknown };
  if (typeof o.intent !== 'string' || !INTENTS.includes(o.intent as Intent) || !Array.isArray(o.steps)) return null;
  const seen = new Set<string>();
  const steps = [];
  for (const s of o.steps.slice(0, 3)) {
    const agent = (s as { agent?: unknown }).agent;
    const task = (s as { task?: unknown }).task;
    if (typeof agent !== 'string' || !SPECIALISTS.includes(agent as SpecialistId) || seen.has(agent)) continue;
    seen.add(agent);
    steps.push({ agent: agent as SpecialistId, task: typeof task === 'string' ? task.replace(/\d/g, '').slice(0, 160) : 'Investigate.' });
  }
  const intent = o.intent as Intent;
  if (steps.length === 0 && intent !== 'unanswerable' && intent !== 'greeting') return null;
  return { intent, steps, rationale: typeof o.rationale === 'string' ? o.rationale.replace(/\d/g, '').slice(0, 240) : '' };
}

function toolSystem(agent: SpecialistId): string {
  const def = AGENTS[agent];
  return [
    `You are the ${def.name} of DukaanPulse. ${def.role}`,
    ...def.instructions,
    'Choose the tool calls you need for the task. You may only use these tools:',
    ...def.allowedTools.map((t) => `- ${toolSchemaText(t)}`),
    `Use at most ${def.maxToolCalls} calls. If the context has offer settings, pass them as arguments. Return JSON only.`,
  ].join('\n');
}

function toolSchema(agent: SpecialistId) {
  const tools = AGENTS[agent].allowedTools;
  return {
    example: { toolCalls: [{ tool: tools[0], args: {} }] },
    schema: {
      type: 'object',
      properties: { toolCalls: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string', enum: tools }, args: { type: 'object' } }, required: ['tool'] } } },
      required: ['toolCalls'],
    },
  };
}

function validateToolChoice(v: unknown, max: number): ToolCallRequest[] | null {
  const calls = (v as { toolCalls?: unknown })?.toolCalls;
  if (!Array.isArray(calls)) return null;
  return calls.slice(0, max).flatMap((c) => {
    const tool = (c as { tool?: unknown }).tool;
    const args = (c as { args?: unknown }).args;
    return typeof tool === 'string' ? [{ tool, args: typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {} }] : [];
  });
}

function findingsSystem(agent: SpecialistId): string {
  const def = AGENTS[agent];
  return [
    `You are the ${def.name} of DukaanPulse. ${def.role}`,
    ...def.instructions,
    `Write up to five findings. Allowed types: ${def.findingTypes.join(', ')}.`,
    'observed = what the data shows; estimated = model outputs; assumed = inputs; simulated = simulated campaign outcomes; hypothesis = a possible explanation, worded tentatively ("may", "worth checking").',
    'Put every number as a reference exactly like {{c1.revenue_change_pct}} using the references listed. Do not write any digit yourself, not even in dates or day counts.',
    'Do not say anything caused anything unless the finding is a hypothesis. Do not claim predictions, proof, certainty or significance. Do not guess personal reasons.',
    'citations: list every reference you used. Return JSON only.',
  ].join('\n');
}

function findingsUser(task: string, question: string, own: readonly ToolOutcome[]): string {
  const lines: string[] = [`Task: ${task}`, `Question: ${question}`, 'Tool results:'];
  for (const o of own) {
    if (!o.ok) {
      lines.push(`- ${o.tool}: failed (${o.error})`);
      continue;
    }
    lines.push(`- ${o.tool} (${o.callId}): ${o.summary}`);
    for (const m of o.metrics) {
      const when = m.period ? `; ${m.period.label}${m.baseline ? ` vs ${m.baseline.label}` : ''}` : '';
      lines.push(`  {{${o.callId}.${m.key}}} = ${formatMetric(m)} — ${m.label} (${m.evidence}${when})`);
    }
    for (const l of o.limitations) lines.push(`  limitation: ${l}`);
  }
  return lines.join('\n');
}

function findingsSchema(agent: SpecialistId) {
  const type = AGENTS[agent].findingTypes[0];
  return {
    example: { findings: [{ type, claim: 'Revenue changed by {{c1.revenue_change_pct}} against the previous window.', citations: ['c1.revenue_change_pct'] }] },
    schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: { type: { type: 'string', enum: AGENTS[agent].findingTypes }, claim: { type: 'string' }, citations: { type: 'array', items: { type: 'string' } } },
          required: ['type', 'claim', 'citations'],
        },
      },
    },
    required: ['findings'],
    },
  };
}

interface RawFinding {
  type: EvidenceType;
  claim: string;
  citations: string[];
}

function validateFindings(v: unknown): RawFinding[] | null {
  const fs = (v as { findings?: unknown })?.findings;
  if (!Array.isArray(fs)) return null;
  return fs.slice(0, 5).flatMap((f) => {
    const o = f as { type?: unknown; claim?: unknown; citations?: unknown };
    if (typeof o.type !== 'string' || typeof o.claim !== 'string' || !SECTION_ORDER.includes(o.type as EvidenceType)) return [];
    const citations = Array.isArray(o.citations) ? o.citations.filter((c): c is string => typeof c === 'string').map((c) => c.replace(/[{}\s]/g, '')) : [];
    return [{ type: o.type as EvidenceType, claim: o.claim.slice(0, 400), citations }];
  });
}

let llmSeq = 0;
function toFinding(agent: SpecialistId, f: RawFinding): Finding {
  llmSeq += 1;
  return { id: `m${llmSeq}`, agent, type: f.type, claim: f.claim, citations: [...new Set([...f.citations, ...refsIn(f.claim)])] };
}

function headlineSystem(): string {
  return [
    `You are the ${AGENTS.orchestrator.name} of DukaanPulse. Write a one-sentence answer to the merchant's question from the findings.`,
    'Use numbers only as the {{ref}} references that appear in the findings; never type a digit. Do not state causes as facts. Do not claim predictions or certainty. Return JSON only.',
  ].join('\n');
}

function headlineUser(question: string, findings: readonly Finding[], outcomes: readonly ToolOutcome[]): string {
  const index = indexMetrics(outcomes);
  const refs = [...new Set(findings.flatMap((f) => f.citations))].filter((r) => index.has(r));
  return [
    `Question: ${question}`,
    'Findings:',
    ...findings.map((f) => `- (${f.type}) ${f.claim}`),
    'References:',
    ...refs.map((r) => `  {{${r}}} = ${formatMetric(index.get(r)!.metric)} — ${index.get(r)!.metric.label}`),
  ].join('\n');
}

const HEADLINE_SCHEMA = {
  example: { headline: 'Revenue changed by {{c1.revenue_change_pct}} against the previous window, with the largest fall in the {{c2.largest_decline_daypart}}.' },
  schema: { type: 'object', properties: { headline: { type: 'string' } }, required: ['headline'] },
};
