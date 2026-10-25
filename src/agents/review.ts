/**
 * Risk Reviewer: an independent, rule-based verifier.
 *
 * It does not use a model and cannot call tools. It reads only the findings and the tool
 * results they cite, so it cannot be talked out of a rule by the agents it checks.
 *
 * Rules (error = finding is removed or revised; warning = shown, not blocking):
 *  R1 citation      every finding cites at least one metric that exists in this run's tool results
 *  R2 references    every {{ref}} in the claim exists and is cited
 *  R3 numbers       no digits outside {{ref}}s (numbers must come from tools)
 *  R4 evidence      the finding's type is allowed for its agent and consistent with what it cites
 *  R5 causation     causal wording only in hypotheses
 *  R6 capability    no claims of prediction, proof, guarantees, model accuracy or AI certainty
 *  R7 reasons       no personal reasons for a customer's absence
 *  R8 real-vs-synthetic  never describes data or simulated outcomes as real
 *  R9 disclosure    the answer discloses synthetic data, and estimates come with limitations
 *  R10 actions      never claims a campaign was approved, sent, launched or paid (agents cannot act)
 *  S1–S8 semantics   what the claim says about each number matches what it is (see semantics.ts)
 */
import { AGENTS } from './definitions';
import { indexMetrics, refsIn, strayNumbers, type MetricIndex } from './render';
import { claimsReal, semanticIssues } from './semantics';
import type { EvidenceType, Finding, ReviewIssue, ReviewResult, ToolOutcome } from './types';

const CAUSAL = /\b(because|caused|causes|causing|due to|led to|leads to|drove|driven by|drives|resulted in|results in|the reason|is why|explains why|thanks to)\b/i;
const CAPABILITY = /\b(predicts?|predicted|prediction|forecasts?|guarantee[sd]?|proves?|proven|definitely|certainly|for sure|will (?:increase|grow|bring|recover|boost|win)|accura(?:te|cy)|ai (?:knows|is sure|is certain)|machine learning|trained model)\b/i;
const PERSONAL = /\b(sick|ill|illness|moved|moving|relocat\w*|unhappy|angry|upset|dislik\w*|bored|switched to|went to a competitor|competitor|lost interest|holiday|vacation|pregnan\w*|died|divorce|job)\b/i;
const ACTION_DONE = /\b(approved|sent|launched|paid|went live|gone live|messaged|delivered|executed|activated|transferred)\b/gi;
const NEGATED = /\b(not|no|never|cannot|can't|won't|nothing|only you|before it is|until)\b[^.;]*$/i;

function claimsActionDone(text: string): boolean {
  for (const m of text.matchAll(ACTION_DONE)) {
    if (/simulat\w*/i.test(text.slice(Math.max(0, m.index! - 40), m.index!))) continue;
    if (!NEGATED.test(text.slice(Math.max(0, m.index! - 50), m.index!))) return true;
  }
  return false;
}

const SIGNIFICANCE = /\b(statistically significant|significant (?:lift|result|effect|increase)|p-value)\b/i;

/** Which metric evidence types each finding type may rest on. */
const COMPATIBLE: Record<EvidenceType, readonly string[]> = {
  observed: ['observed'],
  estimated: ['estimated', 'assumed', 'observed'],
  assumed: ['assumed', 'observed'],
  simulated: ['simulated', 'observed', 'estimated'],
  hypothesis: ['observed', 'estimated', 'assumed', 'simulated'],
};

export function reviewFinding(f: Finding, index: MetricIndex): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const err = (rule: string, message: string) => issues.push({ rule, severity: 'error', findingId: f.id, message });

  const cited = f.citations.filter((c) => index.has(c));
  if (cited.length === 0) err('R1 citation', 'Cites no metric from this run’s tool results.');
  const refs = refsIn(f.claim);
  for (const r of refs) {
    if (!index.has(r)) err('R2 references', `References ${r}, which no tool returned.`);
    else if (!f.citations.includes(r)) err('R2 references', `Uses ${r} without citing it.`);
  }
  const stray = strayNumbers(f.claim);
  if (stray.length > 0) err('R3 numbers', `Contains numbers not taken from a tool: ${stray.join(', ')}.`);

  const allowed = f.agent === 'orchestrator' ? AGENTS.orchestrator.findingTypes : AGENTS[f.agent].findingTypes;
  if (!allowed.includes(f.type)) err('R4 evidence', `${f.agent} may not assert ${f.type} findings.`);
  for (const c of cited) {
    const kind = index.get(c)!.metric.evidence;
    if (!COMPATIBLE[f.type].includes(kind)) err('R4 evidence', `A ${f.type} finding cannot rest on ${kind} metric ${c}.`);
  }

  if (f.type !== 'hypothesis' && CAUSAL.test(f.claim)) err('R5 causation', 'States a cause; causes may only be offered as hypotheses.');
  if (CAPABILITY.test(f.claim)) err('R6 capability', 'Claims prediction, proof, certainty or model accuracy.');
  if (SIGNIFICANCE.test(f.claim)) err('R6 capability', 'Claims statistical significance.');
  if (PERSONAL.test(f.claim)) err('R7 reasons', 'Suggests personal reasons for customer behaviour, which payment data cannot show.');
  if (claimsReal(f.claim)) err('R8 real-vs-synthetic', 'Describes synthetic or simulated data as real.');
  if (claimsActionDone(f.claim)) err('R10 actions', 'Claims an action was carried out; agents can only propose, and nothing is ever sent.');
  for (const s of semanticIssues(f, index)) err(s.rule, s.message);
  if (f.type === 'hypothesis' && !/\b(may|might|could|possible|possibly|one explanation|worth checking|to check|not proof|not that)\b/i.test(f.claim)) {
    issues.push({ rule: 'R5 causation', severity: 'warning', findingId: f.id, message: 'Hypothesis is not worded tentatively.' });
  }
  return issues;
}

export interface ReviewInput {
  findings: readonly Finding[];
  outcomes: readonly ToolOutcome[];
  disclosure: string;
  limitations: readonly string[];
  headline: string;
}

export function review(input: ReviewInput): ReviewResult {
  const index = indexMetrics(input.outcomes);
  const issues: ReviewIssue[] = input.findings.flatMap((f) => reviewFinding(f, index));

  const headlineStray = strayNumbers(input.headline);
  if (headlineStray.length > 0) issues.push({ rule: 'R3 numbers', severity: 'error', findingId: null, message: `Headline contains numbers not taken from a tool: ${headlineStray.join(', ')}.` });
  for (const r of refsIn(input.headline)) if (!index.has(r)) issues.push({ rule: 'R2 references', severity: 'error', findingId: null, message: `Headline references ${r}, which no tool returned.` });
  if (claimsReal(input.headline)) issues.push({ rule: 'R8 real-vs-synthetic', severity: 'error', findingId: null, message: 'Headline describes synthetic data as real.' });
  for (const [rule, re] of [['R5 causation', CAUSAL], ['R6 capability', CAPABILITY]] as const) {
    if (re.test(input.headline)) issues.push({ rule, severity: 'error', findingId: null, message: 'Headline breaks this rule.' });
  }
  if (claimsActionDone(input.headline)) issues.push({ rule: 'R10 actions', severity: 'error', findingId: null, message: 'Headline claims an action was carried out.' });

  if (!/synthetic/i.test(input.disclosure)) issues.push({ rule: 'R9 disclosure', severity: 'error', findingId: null, message: 'The answer does not disclose that the data is synthetic.' });
  const usesEstimates = input.findings.some((f) => f.type === 'estimated' || f.type === 'assumed' || f.type === 'simulated');
  if (usesEstimates && input.limitations.length === 0) {
    issues.push({ rule: 'R9 disclosure', severity: 'error', findingId: null, message: 'Estimates are shown without their limitations.' });
  }
  return { decision: issues.some((i) => i.severity === 'error') ? 'revise' : 'pass', issues };
}

/**
 * Compares what a question asserts about a direction of change with what the tools observed.
 * Returns the metric ref that contradicts the premise, or null.
 */
export function contradictedPremise(question: string, outcomes: readonly ToolOutcome[]): { claimed: 'up' | 'down' | 'doubled'; ref: string; observed: string } | null {
  const q = question.toLowerCase();
  const index = indexMetrics(outcomes);
  const claimed: 'up' | 'down' | 'doubled' | null = /\b(doubl|tripl)\w*/.test(q)
    ? 'doubled'
    : /\b(up|increas\w*|grow\w*|grew|rise|rising|rose|higher|improv\w*|boom\w*)\b/.test(q)
      ? 'up'
      : /\b(down|declin\w*|drop\w*|fall\w*|fell|lower|decreas\w*|worse)\b/.test(q)
        ? 'down'
        : null;
  if (!claimed) return null;
  const daypart = (['morning', 'afternoon', 'evening'] as const).find((d) => q.includes(d));
  for (const [ref, hit] of index) {
    const key = hit.metric.key;
    const isTarget = daypart ? key === `${daypart}_direction` : key === 'revenue_direction';
    if (!isTarget || hit.metric.unit !== 'text') continue;
    const dir = hit.metric.text;
    if (claimed === 'doubled') {
      const pctRef = daypart ? ref.replace(`${daypart}_direction`, `${daypart}_change_pct`) : ref.replace('revenue_direction', 'revenue_change_pct');
      const pct = index.get(pctRef)?.metric.value;
      if (pct !== undefined && pct < 0.9) return { claimed, ref: pctRef, observed: dir ?? '' };
    } else if (dir !== claimed && dir !== undefined) {
      const pctRef = daypart ? ref.replace(`${daypart}_direction`, `${daypart}_change_pct`) : ref.replace('revenue_direction', 'revenue_change_pct');
      return { claimed, ref: index.has(pctRef) ? pctRef : ref, observed: dir };
    }
  }
  return null;
}
