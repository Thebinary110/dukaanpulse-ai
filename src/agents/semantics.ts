/**
 * Semantic claim validation: deterministic checks that what a claim SAYS about each number matches
 * what the number IS, using the typed evidence behind every {{ref}} (population, time window,
 * evidence type, sign, source tool).
 *
 * The reviewer already guarantees numbers come from tools. These checks catch claims whose numbers
 * are right but whose meaning is wrong:
 *   S1 segment          a qualifier next to a number (e.g. "morning", "lapsed", "held back") must
 *                       describe the population that number measures
 *   S2 period           time words in a claim (week, month, quarter…) must match the evidence window
 *   S3 mixed windows    one claim must not mix numbers from different comparison windows
 *   S4 direction        "rose/fell" wording must match the sign of a change
 *   S5 estimate wording claims resting on estimates must be worded as estimates
 *   S6 simulation       claims resting on simulated outcomes must say they are simulated, never real
 *   S7 recommendation   a claim naming the best option must agree with the comparison tool
 *   S8 cost assumptions financial estimates need the cost assumptions they were computed with
 * When a relationship cannot be validated the claim is rejected (and later revised or omitted);
 * nothing is rewritten with new content.
 */
import type { Daypart } from '../domain/types';
import { formatMetric, REF_PATTERN, type MetricIndex } from './render';
import type { Finding, Metric, PopulationGroup, ResolvedReference, ToolResult } from './types';

export interface SemanticIssue {
  rule: string;
  message: string;
}

// ── Qualifiers ─────────────────────────────────────────────────────────────

type Qualifier = { kind: 'daypart'; value: Daypart; word: string } | { kind: 'group'; value: PopulationGroup; word: string };

const DAYPART_WORDS: [RegExp, Daypart][] = [
  [/\b(morning|mornings|breakfast)\b/, 'morning'],
  [/\b(afternoon|afternoons|lunch)\b/, 'afternoon'],
  [/\b(evening|evenings|night|dinner)\b/, 'evening'],
];

const GROUP_WORDS: [RegExp, PopulationGroup][] = [
  [/\b(held[- ]back|holdout|hold-out|control group)\b/, 'holdout'],
  [/\b(offer group|treatment group|(?:get|gets|getting|got|receive|receives|receiving|received) the offer)\b/, 'offer_group'],
  [/\b(lapsed|flagged|absent|slipping|(?:been|are|is|were|stayed|staying) away)\b/, 'flagged_regulars'],
  [/\b(new customers?)\b/, 'new_customers'],
  [/\b(returning customers?|repeat customers?)\b/, 'returning_customers'],
  [/\b(regulars?|regular customers?)\b/, 'regulars'],
  [/\b(all customers|every customer|everyone|everybody|all your customers)\b/, 'all_customers'],
];

export function qualifiersIn(text: string): Qualifier[] {
  const t = text.toLowerCase();
  const out: Qualifier[] = [];
  for (const [re, value] of DAYPART_WORDS) {
    const m = t.match(re);
    if (m) out.push({ kind: 'daypart', value, word: m[0] });
  }
  for (const [re, value] of GROUP_WORDS) {
    const m = t.match(re);
    if (m) out.push({ kind: 'group', value, word: m[0] });
  }
  return out;
}

/** Which population groups a qualifier may describe (subsets are fine: flagged regulars are regulars). */
const COMPATIBLE: Record<PopulationGroup, readonly PopulationGroup[]> = {
  regulars: ['regulars', 'flagged_regulars', 'offer_group', 'holdout'],
  flagged_regulars: ['flagged_regulars', 'offer_group', 'holdout'],
  offer_group: ['offer_group'],
  holdout: ['holdout'],
  new_customers: ['new_customers'],
  returning_customers: ['returning_customers', 'regulars', 'flagged_regulars', 'offer_group', 'holdout'],
  all_customers: ['all_customers', 'shop'],
  shop: ['shop'],
  campaign: ['campaign', 'offer_group', 'holdout'],
};

const GROUP_LABEL: Record<PopulationGroup, string> = {
  shop: 'all sales',
  all_customers: 'all customers',
  regulars: 'all regular customers',
  flagged_regulars: 'regulars flagged as away',
  new_customers: 'new customers',
  returning_customers: 'returning customers',
  offer_group: 'the customers who get the offer',
  holdout: 'the held-back customers',
  campaign: 'the whole campaign',
};

function describePopulation(m: Metric): string {
  const p = m.population!;
  return p.daypart ? `${GROUP_LABEL[p.group]} (${p.daypart})` : GROUP_LABEL[p.group];
}

function qualifierFits(q: Qualifier, m: Metric): boolean {
  const p = m.population;
  if (!p) return true;
  if (q.kind === 'daypart') return p.daypart === q.value;
  return COMPATIBLE[q.value].includes(p.group);
}

// ── Windows around each reference ──────────────────────────────────────────

const BOUNDARY = /[.;:!?(),—–]/;
const STOP = new Set(
  'is are was were be been being has have had show shows showed came come comes made make makes would could will can may might did do does need needs needed got gets returned visited paid spent fell rose increased decreased dropped declined changed grew than against compared versus vs and but while whereas over during in for from because since as so although though when after before if unless with'.split(
    ' ',
  ),
);
const RELATIVE = new Set(['who', 'whose', 'that', 'which', 'where']);

const CONJUNCTIONS = new Set(['and', 'or', 'but', 'while', 'whereas', 'against', 'versus', 'vs', 'compared', 'with', 'to']);

/** The words right after a number that describe it, up to a verb or conjunction (relative clauses included). */
function nounPhrase(words: readonly string[]): string[] {
  const out: string[] = [];
  let relative = false;
  for (const w of words) {
    const lw = w.toLowerCase();
    if (RELATIVE.has(lw)) relative = true;
    else if (STOP.has(lw) && !relative) break;
    out.push(w);
    if (out.length >= 8) break;
  }
  return out;
}

interface RefSite {
  ref: string;
  before: string;
  after: string;
}

/** For each reference: the clause words just before it and the noun phrase just after it. */
export function refSites(claim: string): RefSite[] {
  const sites: RefSite[] = [];
  const matches = [...claim.matchAll(new RegExp(REF_PATTERN.source, 'gi'))];
  matches.forEach((m, i) => {
    const start = m.index!;
    const end = start + m[0].length;
    const prevEnd = i === 0 ? 0 : matches[i - 1]!.index! + matches[i - 1]![0].length;
    const nextStart = i + 1 < matches.length ? matches[i + 1]!.index! : claim.length;
    const beforeText = claim.slice(prevEnd, start);
    const parts = beforeText.split(BOUNDARY);
    let clauseWords = (parts.at(-1) ?? '').trim().split(/\s+/).filter(Boolean);
    // When the previous number is in the same clause, its own noun phrase is not about this one.
    if (i > 0 && parts.length === 1) {
      clauseWords = clauseWords.slice(nounPhrase(clauseWords).length);
      while (clauseWords.length > 0 && CONJUNCTIONS.has(clauseWords[0]!.toLowerCase())) clauseWords = clauseWords.slice(1);
    }
    const before = clauseWords.slice(-6).join(' ');
    const afterClause = (claim.slice(end, nextStart).split(BOUNDARY)[0] ?? '').trim().split(/\s+/).filter(Boolean);
    sites.push({ ref: `${m[1]}.${m[2]}`, before, after: nounPhrase(afterClause).join(' ') });
  });
  return sites;
}

// ── Period words ───────────────────────────────────────────────────────────

/** Window length a text talks about, 'unsupported' for windows no tool provides, or null. */
export function periodIn(text: string): number | 'unsupported' | null {
  const t = text.toLowerCase();
  if (/\b(year|yearly|annual|annually|yesterday|today|tonight|this morning)\b/.test(t)) return 'unsupported';
  if (/\b(quarter|quarterly|three months|ninety days)\b/.test(t)) return 90;
  if (/\b(week|weekly|seven days|fortnight)\b/.test(t)) return /\bfortnight\b/.test(t) ? 'unsupported' : 7;
  if (/\b(month|monthly|thirty days)\b/.test(t)) return 30;
  return null;
}

// ── Direction words ────────────────────────────────────────────────────────

const UP = /\b(rose|rise|rises|risen|rising|increased?|increases|increasing|grew|grow|grows|growth|up|higher|gained?|improved?|added|boost(?:ed)?|jumped)\b/;
const DOWN = /\b(fell|fall|falls|fallen|falling|dropped|drop|drops|declined?|declines|declining|decreased?|decreases|down|lower|lost|loss|shrank|shrunk|slipped)\b/;

function isSignedChange(m: Metric): boolean {
  return m.unit !== 'text' && (m.key.includes('change') || m.key.endsWith('_effect') || m.key === 'lift');
}

// ── Evidence wording ───────────────────────────────────────────────────────

const ESTIMATE_MARKER = /\b(expected|expect|estimated?|estimates|would|could|about|roughly|around|approximately|if|assum\w*|projected|at risk|needs?|needed|break(?:s)? even|under the current|model|likely|potential)\b/i;
const SIMULATION_MARKER = /\bsimulat\w*/i;
const REAL_WORDS = /\b(?:real|actual|genuine|live)(?:-world)? (?:results?|customers?|performance|campaigns?|outcomes?|world|sales|data|people|paytm)\b|\bin practice\b|\breally (?:came|returned|responded|worked)\b|\bpaytm data\b|\bactual customers\b/gi;
const NEGATION = /\b(not|no|never|isn't|aren't|wasn't|rather than|instead of|unlike)\b[^.;]*$/i;

/** True when the text presents something as real, ignoring negated disclaimers ("not real customers"). */
export function claimsReal(text: string): boolean {
  for (const m of text.matchAll(REAL_WORDS)) {
    const before = text.slice(Math.max(0, m.index! - 40), m.index!);
    if (!NEGATION.test(before)) return true;
  }
  return false;
}
const RECOMMEND_WORDS = /\b(best|top|recommend\w*|should|most profitable|winner|go with|better)\b/i;
const OPTION_WORDS: [RegExp, string][] = [
  [/\b(discount|₹ ?off)\b/i, 'discount'],
  [/\b(add-?on|cookie|free item)\b/i, 'addon'],
  [/\b(loyalty|stamps?)\b/i, 'loyalty'],
  [/\b(do nothing|doing nothing|no offer|hold off)\b/i, 'nothing'],
];
const COST_KEYS = /(_net|_cost|subsidy_cost|net_estimate)$/;

export function optionKeyOf(text: string): string | null {
  const t = text.toLowerCase();
  if (t.startsWith('targeted discount')) return 'discount';
  if (t.startsWith('free add-on')) return 'addon';
  if (t.startsWith('loyalty bonus')) return 'loyalty';
  if (t.startsWith('do nothing')) return 'nothing';
  return null;
}

// ── Checks ─────────────────────────────────────────────────────────────────

function windowKey(r: ToolResult): string | null {
  return r.window ? `${r.window.days}|${r.window.current.label}|${r.window.baseline?.label ?? ''}` : null;
}

export function semanticIssues(f: Finding, index: MetricIndex): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const add = (rule: string, message: string) => {
    if (!issues.some((i) => i.rule === rule && i.message === message)) issues.push({ rule, message });
  };
  const text = f.claim;
  const plain = text.replace(new RegExp(REF_PATTERN.source, 'gi'), ' ');
  const cited = f.citations.map((c) => ({ ref: c, hit: index.get(c) })).filter((x): x is { ref: string; hit: NonNullable<typeof x.hit> } => x.hit !== undefined);

  // S1: qualifiers right next to each number must describe its population.
  for (const site of refSites(text)) {
    const hit = index.get(site.ref);
    if (!hit || !hit.metric.population) continue;
    for (const q of [...qualifiersIn(site.before), ...qualifiersIn(site.after)]) {
      if (!qualifierFits(q, hit.metric)) {
        add('S1 segment', `Calls ${site.ref} (${hit.metric.label}, which covers ${describePopulation(hit.metric)}) "${q.word}".`);
      }
    }
  }
  // S1 (declared): the declared segment must fit at least one cited population.
  if (f.segment) {
    const qs = qualifiersIn(f.segment);
    const withPop = cited.filter((c) => c.hit.metric.population);
    if (qs.length > 0 && withPop.length > 0 && !withPop.some((c) => qs.every((q) => qualifierFits(q, c.hit.metric)))) {
      add('S1 segment', `Declared segment "${f.segment}" does not match the population of any cited number.`);
    }
  }

  // S2: time words must match the evidence window.
  const windows = cited.map((c) => c.hit.result.window).filter((w): w is NonNullable<ToolResult['window']> => w !== undefined);
  for (const source of [plain, f.period ?? '']) {
    const said = periodIn(source);
    if (said === null || windows.length === 0) continue;
    if (said === 'unsupported') add('S2 period', 'Refers to a time window no tool measured.');
    else if (windows.some((w) => w.days !== said)) add('S2 period', `Talks about ${said} days, but the cited numbers cover ${[...new Set(windows.map((w) => w.days))].join(' and ')} days.`);
  }

  // S3: one claim, one comparison window.
  const keys = new Set(cited.map((c) => windowKey(c.hit.result)).filter((k): k is string => k !== null));
  if (keys.size > 1) add('S3 mixed windows', 'Mixes numbers from different comparison windows in one claim.');

  // S4: direction wording must match the sign.
  for (const site of refSites(text)) {
    const hit = index.get(site.ref);
    if (!hit || !isSignedChange(hit.metric) || hit.metric.value === 0) continue;
    const near = `${site.before} ${site.after}`.toLowerCase();
    const up = UP.test(near);
    const down = DOWN.test(near);
    if (hit.metric.value < 0 && up && !down) add('S4 direction', `Describes ${site.ref} (${formatMetric(hit.metric)}) as a rise.`);
    if (hit.metric.value > 0 && down && !up) add('S4 direction', `Describes ${site.ref} (${formatMetric(hit.metric)}) as a fall.`);
  }

  // S5 / S6: wording must match the evidence type.
  const kinds = new Set(cited.map((c) => c.hit.metric.evidence));
  if (f.type !== 'hypothesis') {
    if ((kinds.has('estimated') || f.type === 'estimated') && !ESTIMATE_MARKER.test(plain)) add('S5 estimate wording', 'Rests on estimates but is worded as an established fact.');
    if (kinds.has('simulated') && !SIMULATION_MARKER.test(plain)) add('S6 simulation', 'Rests on simulated outcomes but does not say they are simulated.');
  }
  if (kinds.has('simulated') && claimsReal(plain)) add('S6 simulation', 'Presents simulated outcomes as real-world performance.');

  // S7: a named "best" option must agree with the comparison tool.
  if (RECOMMEND_WORDS.test(plain)) {
    const named = OPTION_WORDS.filter(([re]) => re.test(plain)).map(([, k]) => k);
    const recommended = [...index.values()].find((h) => h.result.tool === 'compare_interventions' && h.metric.key === 'recommended')?.metric.text;
    const recKey = recommended ? optionKeyOf(recommended) : null;
    if (named.length === 1 && recKey && named[0] !== recKey) add('S7 recommendation', `Names ${named[0]} as the best option, but the comparison tool ranks ${recommended} first.`);
  }

  // S8: financial estimates need their cost assumptions.
  for (const c of cited) {
    if (c.hit.metric.evidence !== 'estimated' || !COST_KEYS.test(c.hit.metric.key)) continue;
    if (!c.hit.result.metrics.some((m) => m.evidence === 'assumed' && /gross_margin|baseline_return/.test(m.key))) {
      add('S8 cost assumptions', `${c.ref} is a financial estimate whose cost assumptions are missing from its evidence.`);
    }
  }
  return issues;
}

/** The typed evidence behind each reference of a claim, for display and audit. */
export function resolveClaim(f: Finding, index: MetricIndex): ResolvedReference[] {
  return f.citations.flatMap((ref) => {
    const hit = index.get(ref);
    if (!hit) return [];
    const period = hit.metric.period ? `${hit.metric.period.label}${hit.metric.baseline ? ` vs ${hit.metric.baseline.label}` : ''}` : undefined;
    return [
      {
        ref,
        callId: hit.result.callId,
        tool: hit.result.tool,
        metricKey: hit.metric.key,
        label: hit.metric.label,
        value: formatMetric(hit.metric),
        evidence: hit.metric.evidence,
        ...(hit.metric.population ? { population: hit.metric.population } : {}),
        ...(period ? { period } : {}),
      },
    ];
  });
}

export function populationText(p: { group: PopulationGroup; daypart?: Daypart }): string {
  if (!p.daypart) return GROUP_LABEL[p.group];
  // For customer cohorts the daypart is where most of their visits fell; for sales it is a restriction.
  const cohort = p.group === 'flagged_regulars' || p.group === 'offer_group' || p.group === 'holdout';
  return cohort ? `${GROUP_LABEL[p.group]} (mostly ${p.daypart})` : `${GROUP_LABEL[p.group]} (${p.daypart})`;
}
