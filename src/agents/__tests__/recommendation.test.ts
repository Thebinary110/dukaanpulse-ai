import { describe, expect, it } from 'vitest';
import { emptyContext } from '../context';
import { runQuestion } from '../orchestrator';
import { buildRecommendation } from '../recommendation';
import { formatMetric } from '../render';
import { runTool } from '../tools/registry';
import type { ToolResult } from '../types';
import { completedRecord, context } from './helpers';

const ctx = context({ history: [completedRecord()] });
const value = (r: ReturnType<typeof runTool>, key: string) => formatMetric((r as ToolResult).metrics.find((m) => m.key === key)!);

describe('recommendation card', () => {
  it('recommends from the comparison tool, with target, economics, assumptions and alternatives', () => {
    const compare = runTool({ tool: 'compare_interventions' }, ctx, 'c1');
    const lapse = runTool({ tool: 'lapse_evidence' }, ctx, 'c2');
    const card = buildRecommendation('offer_strategy', [compare, lapse])!;
    expect(card.status).toBe('recommend');
    expect(card.action).toBe(value(compare, 'recommended'));
    expect(card.target).toBe(`${value(compare, 'recipients')} regulars flagged as away (mostly morning), with 7 more held back to measure the result`);
    expect(card.economics.map((e) => e.value)).toContain(value(compare, 'recommended_net'));
    expect(card.assumptions.map((a) => a.value)).toEqual(expect.arrayContaining([value(compare, 'baseline_return'), value(compare, 'gross_margin')]));
    expect(card.alternatives.map((a) => a.option)).toEqual(expect.arrayContaining(['Do nothing: No offer']));
    expect(card.evidence[0]!.text).toContain('34 of 209 regular customers');
    expect(card.nextStep?.ask).toBe('Prepare a draft campaign with this offer');
  });

  it('adds the discount-for-everyone alternative when it was evaluated', () => {
    const card = buildRecommendation('blanket_discount', [runTool({ tool: 'compare_interventions' }, ctx, 'c1'), runTool({ tool: 'blanket_discount', args: { discountRupees: 30 } }, ctx, 'c2')])!;
    expect(card.alternatives.at(-1)!.note).toMatch(/Gives away about ₹.* on orders that would happen anyway/);
  });

  it('refuses to recommend when the cost assumptions are missing', () => {
    const compare = runTool({ tool: 'compare_interventions' }, ctx, 'c1') as ToolResult;
    const stripped = { ...compare, metrics: compare.metrics.filter((m) => m.evidence !== 'assumed') };
    const card = buildRecommendation('offer_strategy', [stripped])!;
    expect(card.status).toBe('insufficient');
    expect(card.action).toBeNull();
    expect(card.uncertain.join(' ')).toMatch(/cost assumptions/);
  });

  it('does not force a recommendation for a diagnostic question', async () => {
    const run = await runQuestion('Why did revenue decline?', emptyContext(), ctx, { client: null });
    const card = run.answer.recommendation!;
    expect(card.status).toBe('insufficient');
    expect(card.action).toBeNull();
    expect(card.known.join(' ')).toContain('−13.0%');
    expect(card.uncertain.join(' ')).toMatch(/cannot show reasons/);
    expect(card.wouldHelp.length).toBeGreaterThan(0);
  });

  it('reports the rule-based next step for results, keeping simulated and estimated apart', async () => {
    const run = await runQuestion('What happened in the last simulated campaign?', emptyContext(), ctx, { client: null });
    const card = run.answer.recommendation!;
    expect(card.action).toBe('Repeat with a larger test');
    expect(card.economics.map((e) => e.kind)).toEqual(['simulated', 'estimated', 'estimated']);
  });

  it('has nothing to recommend for unanswerable questions or action requests', async () => {
    expect((await runQuestion('Will my sales go up next Diwali?', emptyContext(), ctx, { client: null })).answer.recommendation).toBeNull();
    expect((await runQuestion('Approve the campaign', emptyContext(), ctx, { client: null })).answer.recommendation).toBeNull();
  });
});
