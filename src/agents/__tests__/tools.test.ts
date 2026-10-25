import { describe, expect, it } from 'vitest';
import { comparePeriods, revenueDrivers } from '../../domain/overview';
import { evaluateOptions } from '../../domain/decision';
import { planAudience, averageBasketOf, basketByCustomer } from '../../domain/campaign';
import { canUseTool } from '../definitions';
import { runTool, TOOL_SPECS, validateToolArgs, applyOverrides } from '../tools/registry';
import type { ToolResult } from '../types';
import { completedRecord, context, dataset, opp } from './helpers';

const ok = (r: ReturnType<typeof runTool>): ToolResult => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
const metric = (r: ToolResult, key: string) => r.metrics.find((m) => m.key === key);

describe('tool argument validation', () => {
  it('rejects unknown tools and unknown or invalid arguments', () => {
    expect(validateToolArgs('drop_tables', {})).toEqual({ ok: false, error: 'Unknown tool "drop_tables".' });
    expect(validateToolArgs('revenue_comparison', { sql: 'select *' })).toMatchObject({ ok: false });
    expect(validateToolArgs('revenue_comparison', { rangeDays: 14 })).toMatchObject({ ok: false, error: 'rangeDays must be one of 7, 30, 90.' });
    expect(validateToolArgs('compare_interventions', { discountRupees: 1000 })).toMatchObject({ ok: false });
    expect(validateToolArgs('compare_interventions', { discountRupees: 'abc' })).toMatchObject({ ok: false });
    expect(validateToolArgs('revenue_comparison', [1, 2])).toMatchObject({ ok: false });
  });

  it('fills defaults and coerces numeric strings', () => {
    expect(validateToolArgs('revenue_comparison', undefined)).toEqual({ ok: true, args: { rangeDays: 30 } });
    expect(validateToolArgs('revenue_comparison', { rangeDays: '7' })).toEqual({ ok: true, args: { rangeDays: 7 } });
    expect(validateToolArgs('compare_interventions', { discountRupees: '20' })).toEqual({ ok: true, args: { discountRupees: 20 } });
  });

  it('never throws from runTool; invalid calls become errors', () => {
    const r = runTool({ tool: 'revenue_comparison', args: { rangeDays: 3 } }, context(), 'c1');
    expect(r).toEqual({ callId: 'c1', tool: 'revenue_comparison', ok: false, error: 'rangeDays must be one of 7, 30, 90.' });
  });

  it('every tool is permitted to at least one specialist and none to the orchestrator or reviewer', () => {
    for (const tool of Object.keys(TOOL_SPECS)) {
      expect(['business_analyst', 'customer_intelligence', 'growth_strategist', 'experiment_scientist', 'action_planner'].some((a) => canUseTool(a as never, tool))).toBe(true);
      expect(canUseTool('orchestrator', tool)).toBe(false);
      expect(canUseTool('risk_reviewer', tool)).toBe(false);
    }
    expect(canUseTool('business_analyst', 'prepare_campaign_draft')).toBe(false);
    expect(canUseTool('growth_strategist', 'prepare_campaign_draft')).toBe(false);
  });
});

describe('tool results match the domain functions', () => {
  it('revenue_comparison carries values, units, evidence, periods and provenance', () => {
    const r = ok(runTool({ tool: 'revenue_comparison', args: { rangeDays: 30 } }, context(), 'c1'));
    const c = comparePeriods(dataset.transactions, dataset.asOfDay, 30);
    expect(metric(r, 'revenue_now')).toMatchObject({ value: c.revenuePaise.current, unit: 'paise', evidence: 'observed' });
    expect(metric(r, 'revenue_change_pct')?.value).toBeCloseTo(c.revenuePaise.relativeChange!);
    expect(metric(r, 'revenue_change_pct')?.period?.label).toBe('20 Sep – 19 Oct');
    expect(metric(r, 'revenue_change_pct')?.baseline?.label).toBe('21 Aug – 19 Sep');
    expect(metric(r, 'revenue_direction')?.text).toBe('down');
    expect(r.provenance).toEqual({ tool: 'revenue_comparison', args: { rangeDays: 30 }, datasetSeed: dataset.seed, asOfDay: dataset.asOfDay, computedWith: ['comparePeriods'] });
    expect(r.limitations.join(' ')).toMatch(/not why/);
  });

  it('revenue_drivers is an exact decomposition', () => {
    const r = ok(runTool({ tool: 'revenue_drivers', args: { rangeDays: 30 } }, context(), 'c2'));
    const d = revenueDrivers(dataset.transactions, { fromDay: 150, toDay: 180 }, { fromDay: 120, toDay: 150 });
    expect(metric(r, 'revenue_change')?.value).toBe(d.revenueChangePaise);
    expect(metric(r, 'orders_effect')!.value + metric(r, 'aov_effect')!.value).toBeCloseTo(d.revenueChangePaise, 4);
    expect(metric(r, 'largest_decline_daypart')?.text).toBe('morning');
  });

  it('lapse_evidence reports detector output with estimates labelled', () => {
    const r = ok(runTool({ tool: 'lapse_evidence' }, context(), 'c3'));
    expect(metric(r, 'flagged_customers')?.value).toBe(opp.cohort.length);
    expect(metric(r, 'regulars_checked')?.value).toBe(opp.regularsTested);
    expect(metric(r, 'monthly_exposure')?.evidence).toBe('estimated');
    expect(metric(r, 'expected_chance_flags')?.evidence).toBe('estimated');
    expect(r.limitations.join(' ')).toMatch(/cannot tell why/);
  });

  it('compare_interventions uses evaluateOptions and applies validated overrides', () => {
    const base = context();
    const r = ok(runTool({ tool: 'compare_interventions', args: { discountRupees: 20 } }, base, 'c4'));
    const audience = planAudience(opp.cohort.map((c) => c.customerId), dataset.seed);
    const basket = averageBasketOf(basketByCustomer(opp.cohort), audience.treatmentIds);
    const evals = evaluateOptions({ customers: audience.treatmentIds.length, averageBasketPaise: basket, settings: applyOverrides(base.settings, { discountRupees: 20 }) });
    expect(metric(r, 'discount_net')?.value).toBeCloseTo(evals[0]!.economics.netIncrementalProfitPaise);
    expect(metric(r, 'discount_offer')?.text).toContain('₹20 off');
    expect(metric(r, 'baseline_return')?.evidence).toBe('assumed');
    expect(metric(r, 'discount_net')?.evidence).toBe('estimated');
    // The caller's settings object is not mutated.
    expect(base.settings.options['win-back-30']!.valuePaise).toBe(3000);
  });

  it('blanket_discount shows the subsidy on existing orders', () => {
    const r = ok(runTool({ tool: 'blanket_discount', args: { discountRupees: 30 } }, context(), 'c5'));
    const orders = metric(r, 'orders')!.value;
    expect(metric(r, 'subsidy_cost')?.value).toBe(orders * 3000);
    expect(metric(r, 'breakeven_growth')?.evidence).toBe('estimated');
  });

  it('latest_results reports no runs honestly, and simulated metrics when a run exists', () => {
    const none = ok(runTool({ tool: 'latest_results' }, context(), 'c6'));
    expect(metric(none, 'completed_runs')?.value).toBe(0);
    const rec = completedRecord();
    const r = ok(runTool({ tool: 'latest_results' }, context({ history: [rec] }), 'c7'));
    expect(metric(r, 'treatment_returned')).toMatchObject({ value: rec.outcome.treatment.returned, evidence: 'simulated' });
    expect(metric(r, 'treatment_size')?.value).toBe(rec.treatmentSize);
    expect(metric(r, 'net_estimate')?.evidence).toBe('estimated');
  });

  it('prepare_campaign_draft returns a validated proposal and never changes state', () => {
    const ctx = context();
    const before = JSON.stringify(ctx.scenario);
    const r = ok(runTool({ tool: 'prepare_campaign_draft', args: { interventionId: 'win-back-30', discountRupees: 20 } }, ctx, 'c8'));
    expect(r.proposal?.draft.offer.valuePaise).toBe(2000);
    expect(r.proposal?.problems).toEqual([]);
    expect(r.proposal?.draft.message).toContain('₹20 off');
    expect(JSON.stringify(ctx.scenario)).toBe(before);
    const bad = ok(runTool({ tool: 'prepare_campaign_draft', args: { interventionId: 'win-back-30', discountRupees: 150 } }, ctx, 'c9'));
    expect(bad.proposal?.problems.length).toBeGreaterThan(0);
  });
});
