/**
 * The merchant-facing recommendation card, built deterministically from tool results.
 *
 * It recommends only when the evidence supports it: an offer comparison computed with its cost
 * assumptions (or, for results questions, the rule-based next step of a completed run). Otherwise
 * it says what is known, what is uncertain, and which evidence would help. Every figure is a
 * formatted tool metric; nothing here invents amounts, rates or effects.
 */
import { formatMetric } from './render';
import { optionKeyOf, populationText } from './semantics';
import type { Intent, Metric, RecommendationCard, ToolOutcome, ToolResult } from './types';

const OPTION_KEYS = ['discount', 'addon', 'loyalty', 'nothing'] as const;
const SYNTHETIC_PREFIX = /^Synthetic demo data/;

function latest(outcomes: readonly ToolOutcome[], tool: ToolResult['tool']): ToolResult | null {
  for (let i = outcomes.length - 1; i >= 0; i--) {
    const o = outcomes[i]!;
    if (o.ok && o.tool === tool) return o;
  }
  return null;
}

function metric(r: ToolResult | null, key: string): Metric | undefined {
  return r?.metrics.find((m) => m.key === key);
}

const v = (r: ToolResult | null, key: string): string | null => {
  const m = metric(r, key);
  return m ? formatMetric(m) : null;
};

function card(partial: Partial<RecommendationCard> & Pick<RecommendationCard, 'status'>): RecommendationCard {
  return {
    action: null,
    target: null,
    evidence: [],
    economics: [],
    assumptions: [],
    alternatives: [],
    limitations: [],
    known: [],
    uncertain: [],
    wouldHelp: [],
    nextStep: null,
    sources: [],
    ...partial,
  };
}

function lapseEvidence(lapse: ToolResult | null): { text: string; refs: string[] }[] {
  if (!lapse || !metric(lapse, 'median_current_gap')) return [];
  const dp = metric(lapse, 'dominant_daypart')?.text;
  return [
    {
      text: `${v(lapse, 'flagged_customers')} of ${v(lapse, 'regulars_checked')} regular customers have been away for a median of ${v(lapse, 'median_current_gap')}, against a usual gap of ${v(lapse, 'median_usual_gap')}${dp ? `; ${v(lapse, 'dominant_daypart_share')} of their past visits were in the ${dp}` : ''}.`,
      refs: [`${lapse.callId}.flagged_customers`, `${lapse.callId}.regulars_checked`, `${lapse.callId}.median_current_gap`],
    },
  ];
}

function revenueEvidence(outcomes: readonly ToolOutcome[]): { text: string; refs: string[] }[] {
  const rc = latest(outcomes, 'revenue_comparison');
  const dr = latest(outcomes, 'revenue_drivers');
  const dp = latest(outcomes, 'daypart_breakdown');
  const out: { text: string; refs: string[] }[] = [];
  if (rc && metric(rc, 'revenue_change_pct') && rc.window) {
    out.push({ text: `Revenue changed by ${v(rc, 'revenue_change_pct')} (${rc.window.current.label} vs ${rc.window.baseline?.label}).`, refs: [`${rc.callId}.revenue_change_pct`] });
  }
  if (dr && metric(dr, 'largest_decline_change') && (metric(dr, 'largest_decline_change')?.value ?? 0) < 0 && dr.window) {
    out.push({ text: `The largest fall was in the ${metric(dr, 'largest_decline_daypart')?.text} (${v(dr, 'largest_decline_change')}, ${dr.window.current.label}).`, refs: [`${dr.callId}.largest_decline_change`] });
  } else if (dp && metric(dp, 'morning_change_pct') && dp.window) {
    out.push({ text: `Morning revenue changed by ${v(dp, 'morning_change_pct')} (${dp.window.current.label}).`, refs: [`${dp.callId}.morning_change_pct`] });
  }
  return out;
}

export function buildRecommendation(intent: Intent, outcomes: readonly ToolOutcome[]): RecommendationCard | null {
  const compare = latest(outcomes, 'compare_interventions');
  const lapse = latest(outcomes, 'lapse_evidence');
  const blanket = latest(outcomes, 'blanket_discount');
  const results = latest(outcomes, 'latest_results');

  // Offer recommendation: needs the comparison and the cost assumptions it was computed with.
  if (compare && metric(compare, 'recommended')) {
    const sources = [compare, lapse, blanket].filter((r): r is ToolResult => r !== null).map((r) => r.callId);
    if (!metric(compare, 'gross_margin') || !metric(compare, 'baseline_return')) {
      return card({
        status: 'insufficient',
        known: ['An offer comparison was run.'],
        uncertain: ['The cost assumptions behind its figures are missing, so its profit estimates cannot be checked.'],
        wouldHelp: ['Re-run the comparison with gross margin and the "would return anyway" rate set.'],
        nextStep: { label: 'Check the assumptions', to: '/opportunities' },
        sources,
      });
    }
    const rec = metric(compare, 'recommended')!.text!;
    const recKey = optionKeyOf(rec);
    const reliability = metric(compare, 'reliability')?.text;
    const recipients = metric(compare, 'recipients');
    const flagged = metric(lapse, 'flagged_customers');
    const readinessHoldout = metric(latest(outcomes, 'experiment_readiness'), 'holdout_size');
    const holdout = readinessHoldout ? readinessHoldout.value : recipients && flagged ? flagged.value - recipients.value : null;
    const isAction = recKey !== 'nothing';
    const economics: RecommendationCard['economics'] = [];
    if (v(compare, 'recommended_net')) economics.push({ label: 'Expected net extra profit', value: v(compare, 'recommended_net')!, kind: 'estimated' });
    if (isAction && v(compare, 'recommended_cost')) economics.push({ label: 'Expected cost (offers + messages)', value: v(compare, 'recommended_cost')!, kind: 'estimated' });
    if (isAction && v(compare, 'recommended_breakeven_rate')) {
      economics.push({ label: 'Return rate needed to break even', value: `${v(compare, 'recommended_breakeven_rate')} (assumed ${v(compare, 'recommended_return_rate')})`, kind: 'estimated' });
    }
    if (isAction && v(compare, 'recommended_downside_net')) economics.push({ label: 'If it works half as well', value: v(compare, 'recommended_downside_net')!, kind: 'estimated' });

    const assumptions = [
      { label: 'Would return anyway', value: v(compare, 'baseline_return')! },
      { label: 'Gross margin', value: v(compare, 'gross_margin')! },
      ...(recKey && recKey !== 'nothing' && v(compare, `${recKey}_uplift`) ? [{ label: 'Extra return rate from the offer', value: v(compare, `${recKey}_uplift`)! }] : []),
    ];

    const alternatives: RecommendationCard['alternatives'] = OPTION_KEYS.filter((k) => k !== recKey && metric(compare, `${k}_offer`)).map((k) => ({
      option: metric(compare, `${k}_offer`)!.text!,
      net: v(compare, `${k}_net`) ?? '—',
      note: k === 'nothing' ? 'No cost; some regulars may return anyway' : v(compare, `${k}_downside_net`) ? `${v(compare, `${k}_downside_net`)} if it works half as well` : '',
    }));
    if (blanket && v(blanket, 'subsidy_cost')) {
      alternatives.push({
        option: `Discount of ${v(blanket, 'discount')} for every customer`,
        net: '—',
        note: `Gives away about ${v(blanket, 'subsidy_cost')} on orders that would happen anyway${v(blanket, 'breakeven_growth') ? `; orders must grow ${v(blanket, 'breakeven_growth')} to break even` : ''}`,
      });
    }

    const uncertain: string[] = [];
    if (reliability === 'close call') uncertain.push('Close call: small changes in the assumptions could change the ranking.');
    if (reliability === 'no option pays back') uncertain.push('No offer is expected to pay back under these assumptions.');
    return card({
      status: 'recommend',
      action: isAction ? rec : 'Hold off: do nothing for now',
      target: recipients
        ? `${formatMetric(recipients)} ${populationText({ group: 'flagged_regulars', ...(recipients.population?.daypart ? { daypart: recipients.population.daypart } : {}) })}${holdout !== null && holdout > 0 ? `, with ${holdout} more held back to measure the result` : ''}`
        : null,
      evidence: [...lapseEvidence(lapse), ...revenueEvidence(outcomes)],
      economics,
      assumptions,
      alternatives,
      uncertain,
      limitations: compare.limitations.filter((l) => !SYNTHETIC_PREFIX.test(l)),
      nextStep: isAction ? { label: 'Prepare this as a draft', ask: 'Prepare a draft campaign with this offer', to: '/opportunities' } : { label: 'Review the comparison', to: '/opportunities' },
      sources,
    });
  }

  // Results question: the rule-based next step of the latest completed run.
  if (intent === 'experiment_results') {
    if (!results || !metric(results, 'next_step')) {
      return card({
        status: 'insufficient',
        known: ['No simulated campaign has been completed in this session.'],
        wouldHelp: ['Draft, approve and simulate a campaign in Campaign Studio.'],
        nextStep: { label: 'Go to Campaign Studio', to: '/campaigns' },
        sources: results ? [results.callId] : [],
      });
    }
    return card({
      status: 'recommend',
      action: metric(results, 'next_step')!.text!,
      target: `${metric(results, 'campaign')?.text ?? 'Latest campaign'} (${metric(results, 'offer')?.text ?? ''})`,
      evidence: [
        {
          text: `Simulated: ${v(results, 'treatment_returned')} of ${v(results, 'treatment_size')} came back with the offer (${v(results, 'treatment_rate')}) vs ${v(results, 'holdout_returned')} of ${v(results, 'holdout_size')} held back (${v(results, 'holdout_rate')}).`,
          refs: [`${results.callId}.treatment_returned`, `${results.callId}.holdout_returned`],
        },
      ],
      economics: [
        { label: 'Simulated net extra profit', value: v(results, 'net_simulated')!, kind: 'simulated' },
        { label: 'Estimated before the run', value: v(results, 'net_estimate')!, kind: 'estimated' },
        { label: 'Chance this test size detects the assumed lift', value: v(results, 'power')!, kind: 'estimated' },
      ],
      assumptions: [{ label: 'Gross margin', value: v(results, 'gross_margin') ?? '—' }],
      uncertain: [`With groups this small the comparison is noisy; about ${v(results, 'required_per_group')} customers per group would be needed.`],
      limitations: results.limitations.filter((l) => !SYNTHETIC_PREFIX.test(l)),
      nextStep: { label: 'Open Results', to: '/results' },
      sources: [results.callId],
    });
  }

  // Diagnostic questions: say what is known, what is not, and what would help.
  if (intent === 'revenue_change' || intent === 'daypart' || intent === 'lapsed_customers') {
    const known = [...revenueEvidence(outcomes), ...lapseEvidence(lapse)].map((e) => e.text);
    if (known.length === 0) return null;
    return card({
      status: 'insufficient',
      known,
      uncertain: ['Why these customers are away: payment data cannot show reasons.', 'Whether an offer would bring them back, and at what cost.'],
      wouldHelp: lapse
        ? ['Compare offers for the flagged regulars, including doing nothing.', 'Run a campaign with a holdout group to measure any effect.']
        : ['Check whether regular customers have lapsed.', 'Compare offers before spending anything.'],
      nextStep: lapse ? { label: 'Compare offers for them', ask: 'What should I offer the lapsed regulars?', to: '/opportunities' } : { label: 'Check lapsed regulars', ask: 'Who are my lapsed regulars?' },
      sources: outcomes.filter((o): o is ToolResult => o.ok).map((o) => o.callId),
    });
  }
  return null;
}
