/**
 * Deterministic engine: a rule-based stand-in for the model, using exactly the same tools,
 * schemas and reviewer. Used when no model is available, when the merchant chooses it, and
 * per agent when a model call fails. It is always labelled as rule-based in the UI.
 */
import { indexMetrics, type MetricIndex } from './render';
import type { ConversationContext, Finding, Intent, Plan, SpecialistId, ToolCallRequest, ToolOutcome } from './types';

// ── Intent ─────────────────────────────────────────────────────────────────

const UNANSWERABLE =
  /\b(forecast|predict\w*|next (?:month|year|week|diwali|festival|season)|will (?:my )?(?:sales|revenue|customers|business) (?:be|go|grow|rise|fall)|competitor\w*|weather|rain\w*|staff|employee\w*|inventory|stock levels?|instagram|social media|google reviews?|ratings?|taste|tastes|why did (?:customer )?c-\d+|what does .* think|feel about|gst|tax|loan|credit score)\b/i;

export function classifyIntent(question: string, ctx: ConversationContext): Intent {
  const q = question.toLowerCase().trim();
  if (/^(hi|hello|hey|namaste|good (morning|evening|afternoon))\b[!. ]*$/.test(q)) return 'greeting';
  if (/\b(approve|send|launch|go live|blast|execute|run (?:the|this|a) (?:campaign|offer)|message (?:all|them|every)|whatsapp (?:all|them)|pay|transfer|refund|start the campaign)\b/.test(q)) return 'action_request';
  if (/\b(create|make|set up|prepare|draft)\b.*\b(campaign|draft|offer)\b/.test(q)) return 'action_request';
  if (UNANSWERABLE.test(q)) return 'unanswerable';
  if (/\b(everyone|everybody|all (?:my )?customers|every customer|across the board|whole shop|storewide|store-wide)\b/.test(q) && /\b(discount|offer|off|%)\b/.test(q)) return 'blanket_discount';
  const hasAmount = /(₹|rs\.?\s?\d|\d+\s?(?:rupees|rs\b))/.test(q);
  if (hasAmount && (/\b(what if|instead|change|try|make it|lower|raise|reduce|increase|only|cheaper|smaller|bigger)\b/.test(q) || ctx.lastIntent === 'offer_strategy' || ctx.lastIntent === 'offer_what_if')) {
    return 'offer_what_if';
  }
  if (/\b(last|latest|previous|recent)\b.*\b(campaign|run|test|simulation)\b|\bwhat happened\b|\bresults?\b|\bdid (?:it|the campaign|the offer) work\b/.test(q)) return 'experiment_results';
  if (/\b(status|where is my campaign|my draft|current campaign)\b/.test(q)) return 'campaign_status';
  if (/\b(morning|afternoon|evening|breakfast|lunch|dinner time)\b/.test(q)) return 'daypart';
  if (/\b(revenue|sales|income|earnings?|business|takings)\b/.test(q)) return 'revenue_change';
  if (/\b(offer|discount|promotion|promo|win (?:them )?back|what should i do|recommend|cashback|coupon)\b/.test(q)) return 'offer_strategy';
  if (/\b(lapsed|regulars|stopped coming|churn\w*|lost customers|slipping|loyal|who (?:has|have) stopped)\b/.test(q)) return 'lapsed_customers';
  if (/\b(sample size|holdout|power|significan\w*|experiment)\b/.test(q)) return 'experiment_results';
  return 'unanswerable';
}

// ── Plan ───────────────────────────────────────────────────────────────────

const TASKS: Record<SpecialistId, string> = {
  business_analyst: 'Measure what changed in revenue, orders, average bill and time of day.',
  customer_intelligence: 'Check whether regular customers have lapsed and who they are.',
  growth_strategist: 'Compare responses, including doing nothing, with the economics model.',
  experiment_scientist: 'Check test size, power and what the simulated results can and cannot show.',
  action_planner: 'Prepare a campaign draft proposal or read the campaign status, without approving anything.',
};

const PLANS: Record<Intent, { agents: SpecialistId[]; rationale: string }> = {
  revenue_change: { agents: ['business_analyst'], rationale: 'Start with what changed; bring in customer evidence if a fall needs explaining.' },
  daypart: { agents: ['business_analyst', 'customer_intelligence'], rationale: 'Time-of-day figures and customer lapse evidence are independent, so both run at once.' },
  lapsed_customers: { agents: ['customer_intelligence'], rationale: 'A customer question needs only customer evidence.' },
  offer_strategy: { agents: ['growth_strategist', 'experiment_scientist'], rationale: 'Offer economics and test readiness are independent checks.' },
  blanket_discount: { agents: ['growth_strategist', 'customer_intelligence'], rationale: 'Compare a discount for everyone with a targeted offer, and check who actually needs winning back.' },
  offer_what_if: { agents: ['growth_strategist'], rationale: 'Re-run the economics with the changed offer.' },
  experiment_results: { agents: ['experiment_scientist'], rationale: 'Results and test quality are the experiment scientist’s job.' },
  campaign_status: { agents: ['action_planner'], rationale: 'Read the campaign status.' },
  action_request: { agents: ['action_planner'], rationale: 'Prepare a proposal only; approval stays with the merchant.' },
  unanswerable: { agents: [], rationale: 'The available data cannot answer this.' },
  greeting: { agents: [], rationale: 'No investigation needed.' },
};

export function planFor(intent: Intent): Plan {
  const p = PLANS[intent];
  return { intent, steps: p.agents.map((agent) => ({ agent, task: TASKS[agent] })), rationale: p.rationale };
}

/** Second-round evidence the orchestrator asks for, given first-round results. */
export function followUpsFor(intent: Intent, outcomes: readonly ToolOutcome[], ran: readonly SpecialistId[]): { agent: SpecialistId; reason: string }[] {
  if (intent !== 'revenue_change' || ran.includes('customer_intelligence')) return [];
  const index = indexMetrics(outcomes);
  const direction = [...index.values()].find((h) => h.metric.key === 'revenue_direction')?.metric.text;
  if (direction !== 'down') return [];
  return [{ agent: 'customer_intelligence', reason: 'Revenue fell, so check whether regular customers have lapsed before suggesting any explanation.' }];
}

// ── Tool selection ─────────────────────────────────────────────────────────

/** The comparison window the merchant asked for: a week, a quarter, or (by default) a month. */
export function rangeFromQuestion(question: string): 7 | 30 | 90 {
  if (/\b(week|weekly|7 days|seven days)\b/i.test(question)) return 7;
  if (/\b(quarter|90 days|three months|3 months)\b/i.test(question)) return 90;
  return 30;
}

export function toolsFor(agent: SpecialistId, intent: Intent, ctx: ConversationContext, question: string): ToolCallRequest[] {
  const offer = ctx.offer;
  const offerArgs: Record<string, unknown> = {};
  if (offer.interventionId) offerArgs.interventionId = offer.interventionId;
  if (offer.discountRupees !== undefined) offerArgs.discountRupees = offer.discountRupees;
  if (offer.minSpendRupees !== undefined) offerArgs.minSpendRupees = offer.minSpendRupees;
  if (offer.upliftPercent !== undefined) offerArgs.upliftPercent = offer.upliftPercent;
  const range = rangeFromQuestion(question);

  switch (agent) {
    case 'business_analyst':
      return intent === 'daypart'
        ? [{ tool: 'daypart_breakdown', args: { rangeDays: range } }, { tool: 'revenue_comparison', args: { rangeDays: range } }]
        : [{ tool: 'revenue_comparison', args: { rangeDays: range } }, { tool: 'revenue_drivers', args: { rangeDays: range } }];
    case 'customer_intelligence':
      return intent === 'blanket_discount' ? [{ tool: 'customer_mix', args: { rangeDays: 30 } }, { tool: 'lapse_evidence' }] : [{ tool: 'lapse_evidence' }];
    case 'growth_strategist':
      if (intent === 'blanket_discount') {
        return [{ tool: 'blanket_discount', args: { discountRupees: offer.discountRupees ?? 30, rangeDays: 30 } }, { tool: 'compare_interventions', args: {} }];
      }
      return [{ tool: 'compare_interventions', args: offerArgs }];
    case 'experiment_scientist':
      return intent === 'experiment_results' ? [{ tool: 'latest_results' }, { tool: 'experiment_readiness' }] : [{ tool: 'experiment_readiness' }];
    case 'action_planner':
      if (intent === 'campaign_status') return [{ tool: 'campaign_status' }];
      return [{ tool: 'campaign_status' }, { tool: 'prepare_campaign_draft', args: { interventionId: offer.interventionId && offer.interventionId !== 'no-action' ? offer.interventionId : 'win-back-30', ...(offer.discountRupees !== undefined ? { discountRupees: offer.discountRupees } : {}), ...(offer.minSpendRupees !== undefined ? { minSpendRupees: offer.minSpendRupees } : {}) } }];
  }
}

// ── Findings ───────────────────────────────────────────────────────────────

let seq = 0;
function finding(agent: Finding['agent'], type: Finding['type'], claim: string): Finding {
  const citations = [...claim.matchAll(/\{\{\s*([a-z0-9_]+\.[a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1]!);
  seq += 1;
  return { id: `f${seq}`, agent, type, claim, citations };
}

/** Finds the call id of the latest successful call to a tool. */
function call(outcomes: readonly ToolOutcome[], tool: string): string | null {
  for (let i = outcomes.length - 1; i >= 0; i--) {
    const o = outcomes[i]!;
    if (o.ok && o.tool === tool) return o.callId;
  }
  return null;
}

function has(index: MetricIndex, call: string | null, key: string): call is string {
  return call !== null && index.has(`${call}.${key}`);
}

export function findingsFor(agent: SpecialistId, intent: Intent, own: readonly ToolOutcome[]): Finding[] {
  const index = indexMetrics(own);
  const out: Finding[] = [];
  const val = (c: string, k: string) => index.get(`${c}.${k}`)?.metric;

  if (agent === 'business_analyst') {
    const c = call(own, 'revenue_comparison');
    const d = call(own, 'revenue_drivers');
    const p = call(own, 'daypart_breakdown');
    if (has(index, c, 'revenue_change_pct')) {
      out.push(finding(agent, 'observed', `Revenue was {{${c}.revenue_now}} over the last {{${c}.window_days}} days, {{${c}.revenue_change_pct}} against the previous window ({{${c}.revenue_change}}).`));
    } else if (has(index, c, 'revenue_now')) {
      out.push(finding(agent, 'observed', `Revenue was {{${c}.revenue_now}} over the last {{${c}.window_days}} days; there is no earlier window to compare with.`));
    }
    if (has(index, c, 'orders_change_pct') && has(index, c, 'aov_change_pct')) {
      out.push(finding(agent, 'observed', `Orders changed by {{${c}.orders_change_pct}} and the average bill by {{${c}.aov_change_pct}}.`));
    }
    if (has(index, d, 'orders_effect')) {
      out.push(finding(agent, 'observed', `Split of the change: {{${d}.orders_effect}} from the number of orders and {{${d}.aov_effect}} from the average bill.`));
      const share = has(index, d, 'largest_decline_share') ? `, {{${d}.largest_decline_share}} of the total change` : '';
      if ((val(d, 'largest_decline_change')?.value ?? 0) < 0) {
        out.push(finding(agent, 'observed', `The largest fall is in the {{${d}.largest_decline_daypart}} ({{${d}.largest_decline_change}}${share}).`));
      }
    }
    if (p) {
      for (const dp of ['morning', 'afternoon', 'evening']) {
        if (has(index, p, `${dp}_change_pct`)) out.push(finding(agent, 'observed', `${dp[0]!.toUpperCase()}${dp.slice(1)} revenue was {{${p}.${dp}_revenue}}, {{${p}.${dp}_change_pct}} against the previous window.`));
      }
    }
    if (d && (val(d, 'largest_decline_change')?.value ?? 0) < 0) {
      out.push(finding(agent, 'hypothesis', `One explanation worth checking: fewer visits from customers who usually come in the {{${d}.largest_decline_daypart}}. The figures show where revenue fell, not why.`));
    }
  }

  if (agent === 'customer_intelligence') {
    const l = call(own, 'lapse_evidence');
    const mx = call(own, 'customer_mix');
    if (has(index, l, 'median_current_gap')) {
      out.push(finding(agent, 'observed', `{{${l}.flagged_customers}} of {{${l}.regulars_checked}} regular customers have been away for a median of {{${l}.median_current_gap}}, against a usual gap of {{${l}.median_usual_gap}} between visits.`));
      if (has(index, l, 'dominant_daypart')) out.push(finding(agent, 'observed', `{{${l}.dominant_daypart_share}} of their past visits were in the {{${l}.dominant_daypart}}.`));
      out.push(finding(agent, 'estimated', `About {{${l}.expected_chance_flags}} would be flagged by chance even if nothing had changed, so some of these regulars may simply be on a break.`));
      out.push(finding(agent, 'estimated', `If none of them come back, about {{${l}.monthly_exposure}} a month of their usual spending is at risk. This is exposure, not lost revenue.`));
    } else if (has(index, l, 'flagged_customers')) {
      out.push(finding(agent, 'observed', `None of the {{${l}.regulars_checked}} regular customers shows an unusually long absence.`));
    }
    if (has(index, mx, 'returning_share')) {
      out.push(finding(agent, 'observed', `Returning customers were {{${mx}.returning_share}} of customers and brought {{${mx}.returning_revenue_share}} of revenue over the last month.`));
    }
  }

  if (agent === 'growth_strategist') {
    const g = call(own, 'compare_interventions');
    const b = call(own, 'blanket_discount');
    if (has(index, b, 'subsidy_cost')) {
      out.push(finding(agent, 'estimated', `A {{${b}.discount}} discount on every order would give away about {{${b}.subsidy_cost}} a month on orders that would have happened anyway.`));
      if (has(index, b, 'breakeven_growth')) {
        out.push(finding(agent, 'estimated', `Just to recover that, orders would need to grow by about {{${b}.breakeven_growth}} ({{${b}.breakeven_extra_orders}} extra orders) at a gross margin of {{${b}.gross_margin}}.`));
      }
    }
    if (has(index, g, 'recommended')) {
      if (intent === 'offer_what_if' && has(index, g, 'discount_net')) {
        out.push(finding(agent, 'estimated', `With {{${g}.discount_offer}}, the expected net extra profit is {{${g}.discount_net}} for a cost of {{${g}.discount_cost}}.`));
        if (has(index, g, 'discount_breakeven_rate')) {
          out.push(finding(agent, 'estimated', `It breaks even if {{${g}.discount_breakeven_rate}} of the {{${g}.recipients}} customers come back; if it works half as well as assumed, the net is {{${g}.discount_downside_net}}.`));
        }
      }
      out.push(finding(agent, 'estimated', `Under the current assumptions the top option for the {{${g}.recipients}} flagged regulars is {{${g}.recommended}}, with an expected net extra profit of {{${g}.recommended_net}} and a cost of {{${g}.recommended_cost}}.`));
      if (has(index, g, 'recommended_breakeven_rate')) {
        out.push(finding(agent, 'estimated', `It needs {{${g}.recommended_breakeven_rate}} of them to come back to break even, against an assumed {{${g}.recommended_return_rate}}; at half the assumed effect its net is {{${g}.recommended_downside_net}}.`));
      }
      out.push(finding(agent, 'assumed', `These estimates assume {{${g}.baseline_return}} would return anyway and a gross margin of {{${g}.gross_margin}}.`));
      out.push(finding(agent, 'estimated', `Doing nothing costs nothing and is expected to earn {{${g}.nothing_net}} extra; some regulars may return anyway.`));
    }
  }

  if (agent === 'experiment_scientist') {
    const r = call(own, 'latest_results');
    const e = call(own, 'experiment_readiness');
    if (has(index, r, 'treatment_rate')) {
      out.push(finding(agent, 'simulated', `In the latest simulated run, {{${r}.treatment_returned}} of {{${r}.treatment_size}} customers came back with the offer ({{${r}.treatment_rate}}), against {{${r}.holdout_returned}} of {{${r}.holdout_size}} held back ({{${r}.holdout_rate}}).`));
      out.push(finding(agent, 'simulated', `Simulated net extra profit was {{${r}.net_simulated}}, against {{${r}.net_estimate}} estimated before the run. A simulation reflects the assumptions; it is not evidence of how real customers behave.`));
      out.push(finding(agent, 'estimated', `With groups this size there is only about {{${r}.power}} chance of detecting the assumed lift; about {{${r}.required_per_group}} customers per group are needed. The rule-based next step is: {{${r}.next_step}}.`));
    } else if (has(index, r, 'completed_runs')) {
      out.push(finding(agent, 'observed', `There are {{${r}.completed_runs}} completed simulated campaigns in this session, so there are no results to review yet.`));
    }
    if (!has(index, r, 'treatment_rate') && has(index, e, 'power')) {
      out.push(finding(agent, 'estimated', `The planned test has {{${e}.treatment_size}} customers getting the offer and {{${e}.holdout_size}} held back. That gives about {{${e}.power}} chance of detecting the assumed lift; about {{${e}.required_per_group}} per group would be needed.`));
    }
  }

  if (agent === 'action_planner') {
    const s = call(own, 'campaign_status');
    const p = call(own, 'prepare_campaign_draft');
    if (has(index, s, 'status')) out.push(finding(agent, 'observed', `Current campaign status: {{${s}.status}}.`));
    if (has(index, s, 'draft_offer')) out.push(finding(agent, 'observed', `The current draft offers {{${s}.draft_offer}} to {{${s}.draft_recipients}} customers, with {{${s}.draft_holdout}} held back.`));
    if (has(index, p, 'recipients')) {
      out.push(finding(agent, 'assumed', `Proposed draft: {{${p}.offer}} for {{${p}.recipients}} customers, with {{${p}.holdout}} held back for comparison.`));
      if (has(index, p, 'expected_net')) out.push(finding(agent, 'estimated', `Expected net extra profit {{${p}.expected_net}} for a cost of {{${p}.expected_cost}}, under the current assumptions.`));
    }
  }
  return out;
}

/** Cross-specialist hypothesis the orchestrator may add when evidence lines up. */
export function synthesisFindings(intent: Intent, outcomes: readonly ToolOutcome[]): Finding[] {
  if (intent !== 'revenue_change' && intent !== 'daypart') return [];
  const index = indexMetrics(outcomes);
  const entries = [...index.entries()];
  const lapse = entries.find(([, h]) => h.metric.key === 'dominant_daypart');
  const decline = entries.find(([, h]) => h.metric.key === 'largest_decline_daypart');
  const dayDown = entries.find(([, h]) => h.metric.key.endsWith('_direction') && h.metric.key !== 'revenue_direction' && h.metric.text === 'down' && lapse && h.metric.key.startsWith(lapse[1].metric.text ?? '§'));
  const match = lapse && ((decline && decline[1].metric.text === lapse[1].metric.text) || dayDown);
  if (!match || !lapse) return [];
  const flagged = entries.find(([, h]) => h.metric.key === 'flagged_customers');
  return [
    finding(
      'orchestrator',
      'hypothesis',
      `The fall in the {{${lapse[0]}}} lines up with {{${flagged?.[0] ?? lapse[0]}}} lapsed regulars who mostly came in the {{${lapse[0]}}}. That may be part of the explanation, but it is a correlation, not proof that one caused the other.`,
    ),
  ];
}

export function headlineFor(intent: Intent, outcomes: readonly ToolOutcome[]): string {
  const index = indexMetrics(outcomes);
  const ref = (key: string) => [...index.entries()].find(([, h]) => h.metric.key === key)?.[0];
  const r = (key: string) => `{{${ref(key)}}}`;
  switch (intent) {
    case 'revenue_change':
      return ref('revenue_change_pct') ? `Revenue changed by ${r('revenue_change_pct')} against the previous window${ref('largest_decline_daypart') ? `; the largest fall is in the ${r('largest_decline_daypart')}` : ''}.` : 'Here is what the revenue data shows.';
    case 'daypart':
      return ref('morning_change_pct') ? `Morning revenue changed by ${r('morning_change_pct')} against the previous window.` : 'Here is what the time-of-day data shows.';
    case 'lapsed_customers':
      return ref('median_current_gap') ? `${r('flagged_customers')} regulars have been away much longer than their usual habit.` : 'No regulars show an unusually long absence.';
    case 'offer_what_if':
      if (ref('discount_offer') && ref('discount_net')) return `With ${r('discount_offer')}, the expected net extra profit is ${r('discount_net')}; under current assumptions the top option is ${r('recommended')}.`;
      return ref('recommended') ? `Under current assumptions, the top option is ${r('recommended')}.` : 'Here is how the options compare.';
    case 'offer_strategy':
      return ref('recommended') ? `Under current assumptions, the top option is ${r('recommended')}.` : 'Here is how the options compare.';
    case 'blanket_discount':
      return ref('subsidy_cost') ? `A discount for everyone mostly subsidises orders you would get anyway: about ${r('subsidy_cost')} a month.` : 'Here is how a discount for everyone compares.';
    case 'experiment_results':
      return ref('treatment_rate') ? `The latest simulated run is too small to confirm the offer works; the rule-based next step is: ${r('next_step')}.` : 'No simulated campaign has been completed yet.';
    case 'campaign_status':
      return ref('status') ? `Campaign status: ${r('status')}.` : 'Here is the campaign status.';
    case 'action_request':
      return 'I can prepare a draft for you to review. Only you can approve it, in Campaign Studio, and this prototype never sends anything.';
    case 'unanswerable':
      return 'The payment data DukaanPulse has cannot answer that question.';
    case 'greeting':
      return 'Hello! Ask me about your sales, your regular customers, offers or the last simulated campaign.';
  }
}

export const FOLLOW_UPS: Record<Intent, string[]> = {
  revenue_change: ['Why are morning sales down?', 'Should I give everyone a discount?', 'What should I offer the lapsed regulars?'],
  daypart: ['Who are the lapsed morning regulars?', 'What should I offer them?', 'Should I give everyone a discount?'],
  lapsed_customers: ['What should I offer them?', 'Why did revenue decline?'],
  offer_strategy: ['What if I change the offer to ₹20?', 'Prepare a draft campaign', 'Is the test big enough?'],
  offer_what_if: ['What about ₹40 off on ₹300?', 'Prepare a draft campaign with this offer', 'Should I give everyone a discount?'],
  blanket_discount: ['What should I offer the lapsed regulars instead?', 'What if I change the offer to ₹20?'],
  experiment_results: ['Is the test big enough?', 'What should I offer next time?'],
  campaign_status: ['What happened in the last simulated campaign?', 'Prepare a draft campaign'],
  action_request: ['What happened in the last simulated campaign?', 'What if I change the offer to ₹20?'],
  unanswerable: ['Why did revenue decline?', 'Who are my lapsed regulars?', 'What happened in the last simulated campaign?'],
  greeting: ['Why did revenue decline?', 'Why are morning sales down?', 'Should I give everyone a discount?'],
};

export const DATA_SCOPE =
  'DukaanPulse can see synthetic payments: who paid, when, and how much. It cannot see reasons, opinions, weather, competitors, stock or the future.';
