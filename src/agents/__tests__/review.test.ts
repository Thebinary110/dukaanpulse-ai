import { describe, expect, it } from 'vitest';
import { contradictedPremise, review, reviewFinding } from '../review';
import { indexMetrics, renderClaim, strayNumbers } from '../render';
import { runTool } from '../tools/registry';
import type { Finding } from '../types';
import { context } from './helpers';

const outcomes = [
  runTool({ tool: 'revenue_comparison', args: { rangeDays: 30 } }, context(), 'c1'),
  runTool({ tool: 'compare_interventions' }, context(), 'c2'),
  runTool({ tool: 'lapse_evidence' }, context(), 'c3'),
];
const index = indexMetrics(outcomes);
const f = (agent: Finding['agent'], type: Finding['type'], claim: string, citations?: string[]): Finding => ({
  id: 'x',
  agent,
  type,
  claim,
  citations: citations ?? [...claim.matchAll(/\{\{([a-z0-9_.]+)\}\}/g)].map((m) => m[1]!),
});
const rules = (finding: Finding) => reviewFinding(finding, index).filter((i) => i.severity === 'error').map((i) => i.rule);

describe('Risk Reviewer', () => {
  it('passes a well-formed observed finding', () => {
    expect(rules(f('business_analyst', 'observed', 'Revenue changed by {{c1.revenue_change_pct}} against the previous window.'))).toEqual([]);
  });

  it('rejects invented numbers (R3) and missing citations (R1/R2)', () => {
    expect(rules(f('business_analyst', 'observed', 'Revenue fell by 40% last month.', []))).toEqual(expect.arrayContaining(['R1 citation', 'R3 numbers']));
    expect(rules(f('business_analyst', 'observed', 'Revenue changed by {{c9.revenue_change_pct}}.'))).toContain('R2 references');
    expect(rules(f('business_analyst', 'observed', 'Revenue changed by {{c1.revenue_change_pct}}.', ['c1.revenue_now']))).toContain('R2 references');
  });

  it('rejects causal claims outside hypotheses (R5) and allows tentative hypotheses', () => {
    expect(rules(f('business_analyst', 'observed', 'Revenue fell {{c1.revenue_change_pct}} because regulars stopped coming.'))).toContain('R5 causation');
    expect(rules(f('business_analyst', 'hypothesis', 'Revenue may have fallen {{c1.revenue_change_pct}} because some regulars stopped coming; worth checking.'))).toEqual([]);
  });

  it('rejects capability, significance, personal-reason and real-data claims (R6–R8)', () => {
    expect(rules(f('growth_strategist', 'estimated', 'The discount will increase profit to {{c2.discount_net}}, guaranteed.'))).toContain('R6 capability');
    expect(rules(f('growth_strategist', 'estimated', 'This is a statistically significant gain of {{c2.discount_net}}.'))).toContain('R6 capability');
    expect(rules(f('customer_intelligence', 'observed', '{{c3.flagged_customers}} regulars stopped coming, probably because they moved away.'))).toContain('R7 reasons');
    expect(rules(f('customer_intelligence', 'observed', '{{c3.flagged_customers}} real customers have lapsed.'))).toContain('R8 real-vs-synthetic');
  });

  it('enforces evidence types per agent and per cited metric (R4)', () => {
    // An estimate presented as an observed fact.
    expect(rules(f('customer_intelligence', 'observed', 'About {{c3.monthly_exposure}} a month is at risk.'))).toContain('R4 evidence');
    // Growth Strategist may not assert observed findings.
    expect(rules(f('growth_strategist', 'observed', 'Revenue changed by {{c1.revenue_change_pct}}.'))).toContain('R4 evidence');
  });

  it('requires synthetic disclosure and limitations for estimates', () => {
    const est = f('growth_strategist', 'estimated', 'Expected net {{c2.discount_net}}.');
    expect(review({ findings: [est], outcomes, disclosure: 'Demo data.', limitations: [], headline: 'Ok.' }).issues.map((i) => i.rule)).toEqual(
      expect.arrayContaining(['R9 disclosure']),
    );
    expect(review({ findings: [est], outcomes, disclosure: 'Synthetic data.', limitations: ['Assumptions.'], headline: 'Ok.' }).decision).toBe('pass');
    expect(review({ findings: [], outcomes, disclosure: 'Synthetic data.', limitations: [], headline: 'Revenue fell 13%.' }).decision).toBe('revise');
  });

  it('renders references with the app formatters and detects stray numbers', () => {
    expect(renderClaim('Change {{c1.revenue_change_pct}} ({{c1.revenue_change}})', index)).toMatch(/^Change −13\.0% \(−₹1,18,325\)$/);
    expect(strayNumbers('Change {{c1.revenue_change_pct}} in 30 days')).toEqual(['30']);
  });

  it('spots a question whose premise contradicts the data', () => {
    expect(contradictedPremise('Why did revenue double last month?', outcomes)).toMatchObject({ claimed: 'doubled', ref: 'c1.revenue_change_pct' });
    expect(contradictedPremise('Why did revenue go up?', outcomes)).toMatchObject({ claimed: 'up', observed: 'down' });
    expect(contradictedPremise('Why did revenue decline?', outcomes)).toBeNull();
  });
});
