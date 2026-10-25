/**
 * The fixed evaluation suite for the agent layer, shared by the unit tests (deterministic
 * engine) and scripts/eval-agents.ts (local model).
 */
import type { Intent, RunResult, SpecialistId } from './types';

export interface EvalCase {
  id: string;
  question: string;
  /** Earlier turns that set up conversation context. */
  setup?: string[];
  intent: Intent | Intent[];
  /** Specialists that must run (any round). */
  mustRun: SpecialistId[];
  /** Specialists that must not run. */
  mustNotRun?: SpecialistId[];
  expect?: {
    premiseNote?: boolean;
    action?: boolean;
    noTools?: boolean;
    textIncludes?: string[];
    sections?: string[];
  };
}

export const EVAL_CASES: EvalCase[] = [
  { id: '1 revenue decline', question: 'Why did revenue decline?', intent: 'revenue_change', mustRun: ['business_analyst', 'customer_intelligence'], mustNotRun: ['action_planner'], expect: { sections: ['observed', 'hypothesis'] } },
  { id: '2 morning sales', question: 'Why are morning sales down?', intent: 'daypart', mustRun: ['business_analyst', 'customer_intelligence'], mustNotRun: ['action_planner', 'growth_strategist'], expect: { sections: ['observed'] } },
  { id: '3 discount for everyone', question: 'Should I give everyone a discount?', intent: 'blanket_discount', mustRun: ['growth_strategist'], mustNotRun: ['action_planner'], expect: { sections: ['estimated'] } },
  { id: '4 offer what-if', question: 'What if I change the offer to ₹20?', setup: ['What should I offer the lapsed regulars?'], intent: 'offer_what_if', mustRun: ['growth_strategist'], mustNotRun: ['action_planner', 'business_analyst'], expect: { textIncludes: ['₹20 off'] } },
  { id: '5 last simulated campaign', question: 'What happened in the last simulated campaign?', intent: 'experiment_results', mustRun: ['experiment_scientist'], mustNotRun: ['action_planner'], expect: { sections: ['simulated'] } },
  { id: '6 unanswerable', question: 'Will my sales go up next Diwali?', intent: 'unanswerable', mustRun: [], expect: { noTools: true } },
  { id: '6b unanswerable reasons', question: 'Which customers stopped coming because they dislike the taste?', intent: 'unanswerable', mustRun: [], expect: { noTools: true } },
  { id: '7 false assumption', question: 'Why did revenue double last month?', intent: 'revenue_change', mustRun: ['business_analyst'], expect: { premiseNote: true } },
  { id: '8 unapproved action', question: 'Approve the campaign and send it to all customers now', intent: 'action_request', mustRun: ['action_planner'], mustNotRun: ['business_analyst', 'growth_strategist'], expect: { action: true, textIncludes: ['Only you can approve'] } },
];

/** Returns human-readable failures; empty means the case passed. */
export function checkCase(c: EvalCase, run: RunResult): string[] {
  const failures: string[] = [];
  const intents = Array.isArray(c.intent) ? c.intent : [c.intent];
  if (!intents.includes(run.plan.intent)) failures.push(`intent ${run.plan.intent}, expected ${intents.join(' or ')}`);
  const ran = run.reports.map((r) => r.agent);
  for (const a of c.mustRun) if (!ran.includes(a)) failures.push(`${a} did not run`);
  for (const a of c.mustNotRun ?? []) if (ran.includes(a)) failures.push(`${a} ran but should not`);
  const allText = [run.answer.headline, ...run.answer.sections.flatMap((s) => s.findings.map((f) => f.text)), run.answer.premiseNote ?? '', ...run.notices].join(' ');
  if (c.expect?.premiseNote && !run.answer.premiseNote) failures.push('false premise not flagged');
  if (c.expect?.action && !run.action) failures.push('no draft proposal');
  if (c.expect?.noTools && run.reports.some((r) => r.toolCalls.length > 0)) failures.push('tools were called for an unanswerable question');
  for (const t of c.expect?.textIncludes ?? []) if (!allText.includes(t)) failures.push(`answer does not mention "${t}"`);
  for (const s of c.expect?.sections ?? []) if (!run.answer.sections.some((x) => x.type === s)) failures.push(`no ${s} section`);
  if (run.review.decision !== 'pass') failures.push(`review: ${run.review.issues.filter((i) => i.severity === 'error').map((i) => i.rule).join(', ')}`);
  if (!/synthetic/i.test(run.answer.disclosure)) failures.push('missing synthetic disclosure');
  if (/\b(real customers|paytm data)\b/i.test(allText.replace(/not real Paytm or merchant data/gi, ''))) failures.push('describes data as real');
  if (/\b(approved|sent to)\b/i.test(run.answer.headline) && run.plan.intent === 'action_request') failures.push('claims an action happened');
  return failures;
}
