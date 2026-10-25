import { describe, expect, it } from 'vitest';
import { emptyContext } from '../context';
import { findingsFor, planFor, toolsFor } from '../deterministic';
import { runQuestion } from '../orchestrator';
import { indexMetrics } from '../render';
import { reviewFinding } from '../review';
import { periodIn, qualifiersIn, refSites, resolveClaim, semanticIssues } from '../semantics';
import { runTool } from '../tools/registry';
import type { Finding, Intent, SpecialistId, ToolOutcome } from '../types';
import { completedRecord, context } from './helpers';

const ctx = context({ history: [completedRecord()] });
const outcomes: ToolOutcome[] = [
  runTool({ tool: 'lapse_evidence' }, ctx, 'c3'),
  runTool({ tool: 'revenue_comparison', args: { rangeDays: 30 } }, ctx, 'c1'),
  runTool({ tool: 'revenue_comparison', args: { rangeDays: 7 } }, ctx, 'c7'),
  runTool({ tool: 'daypart_breakdown', args: { rangeDays: 30 } }, ctx, 'c4'),
  runTool({ tool: 'compare_interventions' }, ctx, 'c5'),
  runTool({ tool: 'latest_results' }, ctx, 'c6'),
  runTool({ tool: 'revenue_drivers', args: { rangeDays: 30 } }, ctx, 'c2'),
];
const index = indexMetrics(outcomes);
const claim = (agent: Finding['agent'], type: Finding['type'], text: string, extra: Partial<Finding> = {}): Finding => ({
  id: 'x',
  agent,
  type,
  claim: text,
  citations: [...text.matchAll(/\{\{([a-z0-9_.]+)\}\}/g)].map((m) => m[1]!),
  ...extra,
});
const rules = (f: Finding) => semanticIssues(f, index).map((i) => i.rule);
const errors = (f: Finding) => reviewFinding(f, index).filter((i) => i.severity === 'error').map((i) => i.rule);

describe('known failure: correct number, wrong customer segment', () => {
  it('rejects describing all checked regulars as morning customers', () => {
    const bad = claim('customer_intelligence', 'observed', 'Among {{c3.regulars_checked}} regular morning customers, {{c3.flagged_customers}} showed an unusually long absence.');
    expect(rules(bad)).toEqual(['S1 segment']);
    expect(semanticIssues(bad, index)[0]!.message).toMatch(/covers all regular customers\)/);
    expect(errors(bad)).toContain('S1 segment');
  });

  it('rejects the same mistake in other phrasings and in a declared segment', () => {
    expect(rules(claim('customer_intelligence', 'observed', '{{c3.regulars_checked}} morning regulars were checked.'))).toContain('S1 segment');
    expect(rules(claim('customer_intelligence', 'observed', 'Among {{c3.regulars_checked}} regulars whose usual time is morning, {{c3.flagged_customers}} are away.'))).toContain('S1 segment');
    expect(rules(claim('customer_intelligence', 'observed', '{{c3.regulars_checked}} regulars were checked.', { segment: 'morning customers' }))).toContain('S1 segment');
  });

  it('accepts the correct statements', () => {
    expect(rules(claim('customer_intelligence', 'observed', '{{c3.flagged_customers}} of {{c3.regulars_checked}} regular customers have been away for a median of {{c3.median_current_gap}}.'))).toEqual([]);
    // The flagged cohort mostly came in the morning, so "lapsed morning regulars" describes it correctly.
    expect(rules(claim('customer_intelligence', 'observed', '{{c3.flagged_customers}} lapsed morning regulars have been away for a median of {{c3.median_current_gap}}.'))).toEqual([]);
  });
});

describe('segment, period, window and direction checks', () => {
  it('S1: a total presented as a time-of-day figure, or a group mismatch', () => {
    expect(rules(claim('business_analyst', 'observed', 'Morning revenue changed by {{c1.revenue_change_pct}}.'))).toContain('S1 segment');
    expect(rules(claim('business_analyst', 'observed', 'Morning revenue changed by {{c4.morning_change_pct}}.'))).toEqual([]);
    expect(rules(claim('customer_intelligence', 'observed', '{{c3.regulars_checked}} lapsed regulars.'))).toContain('S1 segment');
    expect(rules(claim('experiment_scientist', 'simulated', 'In the simulation {{c6.holdout_returned}} of {{c6.treatment_size}} held-back customers came back.'))).toContain('S1 segment');
  });

  it('S2: a time word that does not match the evidence window', () => {
    expect(rules(claim('business_analyst', 'observed', 'Last week revenue changed by {{c1.revenue_change_pct}}.'))).toContain('S2 period');
    expect(rules(claim('business_analyst', 'observed', 'This week revenue changed by {{c7.revenue_change_pct}}.'))).toEqual([]);
    expect(rules(claim('business_analyst', 'observed', 'Revenue changed by {{c1.revenue_change_pct}} this year.'))).toContain('S2 period');
    expect(rules(claim('business_analyst', 'observed', 'Revenue changed by {{c1.revenue_change_pct}}.', { period: 'last week' }))).toContain('S2 period');
    expect(periodIn('over the last month')).toBe(30);
  });

  it('S3: numbers from two windows in one claim', () => {
    expect(rules(claim('business_analyst', 'observed', 'Revenue changed by {{c1.revenue_change_pct}} and by {{c7.revenue_change_pct}}.'))).toContain('S3 mixed windows');
  });

  it('S4: direction words that contradict the sign', () => {
    expect(rules(claim('business_analyst', 'observed', 'Revenue rose by {{c1.revenue_change_pct}}.'))).toContain('S4 direction');
    expect(rules(claim('business_analyst', 'observed', 'Revenue fell by {{c1.revenue_change_pct}}.'))).toEqual([]);
    expect(rules(claim('business_analyst', 'observed', 'The average bill fell, adding {{c2.aov_effect}}.'))).toEqual([]);
  });
});

describe('evidence-type and conclusion checks', () => {
  it('S5: an estimate stated as an established fact', () => {
    expect(rules(claim('growth_strategist', 'estimated', 'The discount made {{c5.discount_net}} in profit.'))).toContain('S5 estimate wording');
    expect(rules(claim('growth_strategist', 'estimated', 'The discount is expected to make {{c5.discount_net}}.'))).toEqual([]);
  });

  it('S6: a simulated outcome presented as real performance', () => {
    expect(rules(claim('experiment_scientist', 'simulated', 'The campaign brought back {{c6.treatment_returned}} customers.'))).toContain('S6 simulation');
    expect(rules(claim('experiment_scientist', 'simulated', 'In the simulated run, {{c6.treatment_returned}} real customers came back.'))).toContain('S6 simulation');
    expect(rules(claim('experiment_scientist', 'simulated', 'In the simulated run, {{c6.treatment_returned}} customers came back.'))).toEqual([]);
  });

  it('S7: a "best option" that contradicts the comparison tool', () => {
    expect(rules(claim('growth_strategist', 'estimated', 'The best option is a free cookie, expected to make {{c5.addon_net}}.'))).toContain('S7 recommendation');
    expect(rules(claim('growth_strategist', 'estimated', 'The best option is the targeted discount, expected to make {{c5.discount_net}}.'))).toEqual([]);
  });

  it('S8: a financial estimate whose cost assumptions are missing', () => {
    const stripped = outcomes.map((o) => (o.ok && o.tool === 'compare_interventions' ? { ...o, metrics: o.metrics.filter((m) => m.evidence !== 'assumed') } : o));
    const f = claim('growth_strategist', 'estimated', 'The discount is expected to make {{c5.discount_net}}.');
    expect(semanticIssues(f, indexMetrics(stripped)).map((i) => i.rule)).toContain('S8 cost assumptions');
  });
});

describe('claim resolution and helpers', () => {
  it('resolves each reference to tool, metric, value, evidence type, population and period', () => {
    const r = resolveClaim(claim('customer_intelligence', 'observed', '{{c3.flagged_customers}} of {{c4.morning_revenue}}'), index);
    expect(r[0]).toMatchObject({ callId: 'c3', tool: 'lapse_evidence', metricKey: 'flagged_customers', value: '34', evidence: 'observed', population: { group: 'flagged_regulars', daypart: 'morning' } });
    expect(r[1]).toMatchObject({ tool: 'daypart_breakdown', population: { group: 'shop', daypart: 'morning' }, period: '20 Sep – 19 Oct' });
  });

  it('finds qualifiers and the words around each reference', () => {
    expect(qualifiersIn('held-back morning customers').map((q) => q.value)).toEqual(['morning', 'holdout']);
    expect(refSites('Among {{c3.regulars_checked}} regular morning customers, {{c3.flagged_customers}} showed')[0]).toMatchObject({ before: 'Among', after: 'regular morning customers' });
  });
});

describe('the rule-based engine never trips the semantic checks', () => {
  const intents: Intent[] = ['revenue_change', 'daypart', 'lapsed_customers', 'offer_strategy', 'blanket_discount', 'offer_what_if', 'experiment_results', 'campaign_status', 'action_request'];
  for (const intent of intents) {
    it(intent, () => {
      const run: ToolOutcome[] = [];
      let n = 0;
      const agents: SpecialistId[] = [...planFor(intent).steps.map((s) => s.agent), 'customer_intelligence'];
      for (const agent of agents) {
        const own = toolsFor(agent, intent, { ...emptyContext(), offer: { discountRupees: 20, interventionId: 'win-back-30' } }, 'q').map((r) => runTool(r, ctx, `d${++n}`));
        run.push(...own);
        for (const f of findingsFor(agent, intent, own)) {
          expect([f.claim, semanticIssues(f, indexMetrics(run))]).toEqual([f.claim, []]);
          expect([f.claim, reviewFinding(f, indexMetrics(run)).filter((i) => i.severity === 'error')]).toEqual([f.claim, []]);
        }
      }
    });
  }

  it('full rule-based answers carry resolved evidence for every finding', async () => {
    const res = await runQuestion('Why are morning sales down?', emptyContext(), ctx, { client: null });
    for (const s of res.answer.sections) for (const f of s.findings) expect(f.evidence.length).toBe(f.citations.length);
  });
});
