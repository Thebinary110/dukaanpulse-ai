/**
 * Allowlisted, read-only business tools for the agents.
 *
 * Each tool validates its arguments, calls existing tested domain functions, and returns
 * typed metrics with units, evidence type, period and baseline, provenance and limitations.
 * Tools never change application state. prepare_campaign_draft only returns a proposal; the
 * merchant must click to turn it into a draft through the existing state machine.
 */
import { averageBasketOf, basketByCustomer, checkDraft, createCampaignDraft, estimateDraft, planAudience } from '../../domain/campaign';
import { evaluateOptions, LIMITS, offerFor, recommend, type DecisionSettings, type Objective } from '../../domain/decision';
import type { OpportunityOverview } from '../../domain/detectors/lapsedSummary';
import { blanketDiscountEconomics } from '../../domain/financials';
import { describeOffer, getIntervention, INTERVENTIONS, returnRateWithUplift } from '../../domain/interventions';
import { comparePeriods, revenueByDaypart, revenueDrivers, type DayWindow } from '../../domain/overview';
import { recommendNextStep, resultMetrics, type LearningRecord } from '../../domain/results';
import { sampleSizePerGroup, twoProportionPower } from '../../domain/stats';
import { shortDateLabel } from '../../domain/time';
import type { Dataset, Daypart } from '../../domain/types';
import { customerMix } from '../../domain/overview';
import { STATUS_LABEL, type ScenarioState } from '../../state/scenario';
import type { Metric, OfferOverrides, Period, ToolCallRequest, ToolName, ToolOutcome, ToolResult } from '../types';

export interface ToolContext {
  dataset: Dataset;
  opportunity: OpportunityOverview;
  settings: DecisionSettings;
  objective: Objective;
  scenario: ScenarioState;
  history: readonly LearningRecord[];
}

// ── Argument specs (also rendered as JSON schema for the model) ────────────

type ParamSpec =
  | { type: 'enum'; values: readonly (string | number)[]; default?: string | number; description: string }
  | { type: 'number'; min: number; max: number; integer?: boolean; description: string };

export interface ToolSpec {
  name: ToolName;
  description: string;
  params: Record<string, ParamSpec>;
}

const RANGE: ParamSpec = { type: 'enum', values: [7, 30, 90], default: 30, description: 'Comparison window in days; compared with the equally long window before it.' };
const INTERVENTION_IDS = INTERVENTIONS.map((i) => i.id);
const OFFER_PARAMS: Record<string, ParamSpec> = {
  interventionId: { type: 'enum', values: INTERVENTION_IDS, description: 'Which intervention the overrides apply to.' },
  discountRupees: { type: 'number', min: LIMITS.discount.min, max: LIMITS.discount.max, description: 'Flat discount in rupees (targeted discount only).' },
  minSpendRupees: { type: 'number', min: LIMITS.minSpend.min, max: LIMITS.minSpend.max, description: 'Minimum order in rupees (targeted discount only).' },
  upliftPercent: { type: 'number', min: LIMITS.uplift.min, max: LIMITS.uplift.max, description: 'Assumed extra return rate in percentage points.' },
};

export const TOOL_SPECS: Record<ToolName, ToolSpec> = {
  revenue_comparison: { name: 'revenue_comparison', description: 'Revenue, orders, average bill and repeat-customer share for a window vs the previous window.', params: { rangeDays: RANGE } },
  revenue_drivers: { name: 'revenue_drivers', description: 'Splits a revenue change into orders and average-bill effects, and by time of day. Describes where change shows up, not why.', params: { rangeDays: RANGE } },
  daypart_breakdown: { name: 'daypart_breakdown', description: 'Revenue and orders by morning, afternoon and evening vs the previous window.', params: { rangeDays: RANGE } },
  lapse_evidence: { name: 'lapse_evidence', description: 'Regular customers whose current absence is unusually long for their own habit, with detection settings and chance-flag count.', params: {} },
  customer_mix: { name: 'customer_mix', description: 'New vs returning paying customers and their revenue share in a window.', params: { rangeDays: RANGE } },
  compare_interventions: {
    name: 'compare_interventions',
    description: 'Expected-value comparison of targeted discount, free add-on, loyalty bonus and doing nothing for the flagged customers, with the current assumptions and optional overrides.',
    params: { ...OFFER_PARAMS, objective: { type: 'enum', values: ['profit', 'customers'], description: 'Ranking goal.' } },
  },
  blanket_discount: {
    name: 'blanket_discount',
    description: 'Cost of giving every customer a flat discount for a window, and the extra orders needed to recover it.',
    params: { discountRupees: { type: 'number', min: 5, max: 200, description: 'Flat discount in rupees.' }, rangeDays: RANGE },
  },
  experiment_readiness: { name: 'experiment_readiness', description: 'Group sizes, power to detect the assumed lift and sample size needed, for the planned test.', params: {} },
  latest_results: { name: 'latest_results', description: 'The most recent completed simulated campaign: group return rates with denominators, net profit vs estimate, and the rule-based next step.', params: {} },
  campaign_status: { name: 'campaign_status', description: 'Current campaign workflow status and draft summary (read-only).', params: {} },
  prepare_campaign_draft: {
    name: 'prepare_campaign_draft',
    description: 'Prepares (does not create or approve) a campaign draft proposal with validation results.',
    params: { interventionId: OFFER_PARAMS.interventionId!, discountRupees: OFFER_PARAMS.discountRupees!, minSpendRupees: OFFER_PARAMS.minSpendRupees! },
  },
};

export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_SPECS, name);
}

export type ValidationResult = { ok: true; args: Record<string, unknown> } | { ok: false; error: string };

/** Rejects unknown tools, unknown arguments, wrong types and out-of-range values; fills defaults. */
export function validateToolArgs(tool: string, raw: unknown): ValidationResult {
  if (!isToolName(tool)) return { ok: false, error: `Unknown tool "${tool}".` };
  const spec = TOOL_SPECS[tool];
  const args = raw === undefined || raw === null ? {} : raw;
  if (typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'Arguments must be an object.' };
  const input = args as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!(key in spec.params)) return { ok: false, error: `Unknown argument "${key}" for ${tool}.` };
  const out: Record<string, unknown> = {};
  for (const [key, p] of Object.entries(spec.params)) {
    const v = input[key];
    if (v === undefined || v === null) {
      if (p.type === 'enum' && p.default !== undefined) out[key] = p.default;
      continue;
    }
    if (p.type === 'enum') {
      const match = p.values.find((allowed) => allowed === v || String(allowed) === String(v));
      if (match === undefined) return { ok: false, error: `${key} must be one of ${p.values.join(', ')}.` };
      out[key] = match;
    } else {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) return { ok: false, error: `${key} must be a number.` };
      if (n < p.min || n > p.max) return { ok: false, error: `${key} must be between ${p.min} and ${p.max}.` };
      if (p.integer && !Number.isInteger(n)) return { ok: false, error: `${key} must be a whole number.` };
      out[key] = n;
    }
  }
  return { ok: true, args: out };
}

/** JSON-schema-like description of a tool's arguments, for model prompts. */
export function toolSchemaText(tool: ToolName): string {
  const spec = TOOL_SPECS[tool];
  const params = Object.entries(spec.params).map(([k, p]) =>
    p.type === 'enum' ? `${k}: one of [${p.values.join(', ')}]${p.default !== undefined ? ` (default ${p.default})` : ''}` : `${k}: number ${p.min}–${p.max}`,
  );
  return `${tool}(${params.join('; ') || 'no arguments'}): ${spec.description}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DAYPART_KEYS: readonly Daypart[] = ['morning', 'afternoon', 'evening'];
const OPTION_KEY: Record<string, string> = { 'win-back-30': 'discount', 'free-addon': 'addon', 'double-stamps': 'loyalty', 'no-action': 'nothing' };

function period(ds: Dataset, w: DayWindow): Period {
  return { fromDay: w.fromDay, toDay: w.toDay, label: `${shortDateLabel(ds.startDate, w.fromDay)} – ${shortDateLabel(ds.startDate, w.toDay - 1)}` };
}

function windows(ds: Dataset, rangeDays: number): { current: DayWindow; previous: DayWindow | null } {
  const current = { fromDay: ds.asOfDay - rangeDays, toDay: ds.asOfDay };
  const previous = current.fromDay - rangeDays >= 0 ? { fromDay: current.fromDay - rangeDays, toDay: current.fromDay } : null;
  return { current, previous };
}

/** Applies validated offer overrides to decision settings without mutating them. */
export function applyOverrides(settings: DecisionSettings, o: OfferOverrides): DecisionSettings {
  const id = o.interventionId ?? (o.discountRupees !== undefined || o.minSpendRupees !== undefined ? 'win-back-30' : undefined);
  if (!id) return settings;
  const current = settings.options[id];
  if (!current) return settings;
  return {
    ...settings,
    options: {
      ...settings.options,
      [id]: {
        ...current,
        ...(o.discountRupees !== undefined ? { valuePaise: Math.round(o.discountRupees * 100) } : {}),
        ...(o.minSpendRupees !== undefined ? { minSpendPaise: Math.round(o.minSpendRupees * 100) } : {}),
        ...(o.upliftPercent !== undefined ? { uplift: o.upliftPercent / 100 } : {}),
      },
    },
  };
}

function overridesFrom(args: Record<string, unknown>): OfferOverrides {
  const o: OfferOverrides = {};
  if (typeof args.interventionId === 'string') o.interventionId = args.interventionId;
  if (typeof args.discountRupees === 'number') o.discountRupees = args.discountRupees;
  if (typeof args.minSpendRupees === 'number') o.minSpendRupees = args.minSpendRupees;
  if (typeof args.upliftPercent === 'number') o.upliftPercent = args.upliftPercent;
  return o;
}

const m = (key: string, label: string, value: number, unit: Metric['unit'], evidence: Metric['evidence'], extra: Partial<Metric> = {}): Metric => ({
  key,
  label,
  value,
  unit,
  evidence,
  ...extra,
});
const t = (key: string, label: string, text: string, evidence: Metric['evidence'], extra: Partial<Metric> = {}): Metric => ({ key, label, value: 0, text, unit: 'text', evidence, ...extra });

const SYNTHETIC = 'Synthetic demo data for a fictional bakery; not real Paytm or merchant data.';

// ── Tool implementations ───────────────────────────────────────────────────

type Impl = (args: Record<string, unknown>, ctx: ToolContext) => Omit<ToolResult, 'callId' | 'tool' | 'ok' | 'provenance'> & { computedWith: string[] };

const IMPLS: Record<ToolName, Impl> = {
  revenue_comparison(args, ctx) {
    const range = args.rangeDays as number;
    const c = comparePeriods(ctx.dataset.transactions, ctx.dataset.asOfDay, range);
    const p = period(ctx.dataset, c.current);
    const b = c.previous ? period(ctx.dataset, c.previous) : undefined;
    const metrics: Metric[] = [
      m('window_days', 'Window length', range, 'count', 'observed', { period: p }),
      m('revenue_now', `Revenue, last ${range} days`, c.revenuePaise.current ?? 0, 'paise', 'observed', { period: p }),
      m('orders_now', `Orders, last ${range} days`, c.orders.current ?? 0, 'count', 'observed', { period: p }),
    ];
    if (c.averageOrderValuePaise.current !== null) metrics.push(m('aov_now', 'Average bill', c.averageOrderValuePaise.current, 'paise', 'observed', { period: p }));
    if (b) {
      metrics.push(m('revenue_before', `Revenue, previous ${range} days`, c.revenuePaise.previous ?? 0, 'paise', 'observed', { period: b }));
      metrics.push(m('orders_before', `Orders, previous ${range} days`, c.orders.previous ?? 0, 'count', 'observed', { period: b }));
      if (c.revenuePaise.relativeChange !== null) metrics.push(m('revenue_change_pct', 'Revenue change', c.revenuePaise.relativeChange, 'percent', 'observed', { period: p, baseline: b }));
      if (c.revenuePaise.absoluteChange !== null) metrics.push(m('revenue_change', 'Revenue change', c.revenuePaise.absoluteChange, 'paise', 'observed', { period: p, baseline: b }));
      if (c.orders.relativeChange !== null) metrics.push(m('orders_change_pct', 'Orders change', c.orders.relativeChange, 'percent', 'observed', { period: p, baseline: b }));
      if (c.averageOrderValuePaise.relativeChange !== null) metrics.push(m('aov_change_pct', 'Average bill change', c.averageOrderValuePaise.relativeChange, 'percent', 'observed', { period: p, baseline: b }));
      metrics.push(t('revenue_direction', 'Revenue direction', c.revenuePaise.direction, 'observed', { period: p, baseline: b }));
    }
    if (c.repeatCustomerShare.current !== null) metrics.push(m('repeat_share_now', 'Repeat-customer share', c.repeatCustomerShare.current, 'percent', 'observed', { period: p }));
    if (c.repeatCustomerShare.absoluteChange !== null) metrics.push(m('repeat_share_change', 'Repeat-customer share change', c.repeatCustomerShare.absoluteChange, 'pp', 'observed', { period: p, baseline: b }));
    const limitations = [SYNTHETIC, 'Shows what changed between two windows, not why it changed.'];
    if (!b) limitations.push('No earlier window of the same length to compare with.');
    if (c.repeatCustomerShare.unavailableReason) limitations.push(`Repeat customers: ${c.repeatCustomerShare.unavailableReason}`);
    return { summary: `Compared the last ${range} days with the ${range} days before`, metrics, limitations, link: { to: `/?range=${range}`, label: 'Open Overview' }, computedWith: ['comparePeriods'] };
  },

  revenue_drivers(args, ctx) {
    const range = args.rangeDays as number;
    const w = windows(ctx.dataset, range);
    if (!w.previous) {
      return { summary: 'No earlier window to compare with', metrics: [], limitations: [SYNTHETIC, 'No earlier window of the same length to compare with.'], computedWith: ['revenueDrivers'] };
    }
    const d = revenueDrivers(ctx.dataset.transactions, w.current, w.previous);
    const p = period(ctx.dataset, w.current);
    const b = period(ctx.dataset, w.previous);
    const extra = { period: p, baseline: b };
    const largestDecline = DAYPART_KEYS.reduce((a, x) => (d.daypartChangePaise[x] < d.daypartChangePaise[a] ? x : a));
    const metrics: Metric[] = [
      m('window_days', 'Window length', range, 'count', 'observed', extra),
      m('revenue_change', 'Revenue change', d.revenueChangePaise, 'paise', 'observed', extra),
      m('orders_effect', 'Change from number of orders', d.ordersEffectPaise, 'paise', 'observed', extra),
      m('aov_effect', 'Change from average bill', d.averageBillEffectPaise, 'paise', 'observed', extra),
      ...DAYPART_KEYS.map((x) => m(`${x}_change`, `${x[0]!.toUpperCase()}${x.slice(1)} revenue change`, d.daypartChangePaise[x], 'paise', 'observed', extra)),
      t('largest_decline_daypart', 'Time of day with the largest fall', largestDecline, 'observed', extra),
      m('largest_decline_change', 'Its revenue change', d.daypartChangePaise[largestDecline], 'paise', 'observed', extra),
    ];
    if (d.revenueChangePaise !== 0) {
      metrics.push(m('largest_decline_share', 'Share of the total change', d.daypartChangePaise[largestDecline] / d.revenueChangePaise, 'percent', 'observed', extra));
    }
    return {
      summary: `Split the ${range}-day revenue change by orders, average bill and time of day`,
      metrics,
      limitations: [SYNTHETIC, 'An arithmetic split of the change: it shows where the change appears, not what caused it.'],
      link: { to: `/?range=${range}`, label: 'Open Overview' },
      computedWith: ['revenueDrivers'],
    };
  },

  daypart_breakdown(args, ctx) {
    const range = args.rangeDays as number;
    const w = windows(ctx.dataset, range);
    const cur = revenueByDaypart(ctx.dataset.transactions, w.current.fromDay, w.current.toDay);
    const prev = w.previous ? revenueByDaypart(ctx.dataset.transactions, w.previous.fromDay, w.previous.toDay) : null;
    const p = period(ctx.dataset, w.current);
    const b = w.previous ? period(ctx.dataset, w.previous) : undefined;
    const metrics: Metric[] = [m('window_days', 'Window length', range, 'count', 'observed', { period: p })];
    for (const s of cur) {
      metrics.push(m(`${s.daypart}_revenue`, `${s.daypart} revenue`, s.revenuePaise, 'paise', 'observed', { period: p }));
      metrics.push(m(`${s.daypart}_orders`, `${s.daypart} orders`, s.orders, 'count', 'observed', { period: p }));
      const before = prev?.find((x) => x.daypart === s.daypart);
      if (before && before.revenuePaise > 0) {
        metrics.push(m(`${s.daypart}_change_pct`, `${s.daypart} revenue change`, (s.revenuePaise - before.revenuePaise) / before.revenuePaise, 'percent', 'observed', { period: p, baseline: b }));
        metrics.push(t(`${s.daypart}_direction`, `${s.daypart} revenue direction`, s.revenuePaise > before.revenuePaise ? 'up' : s.revenuePaise < before.revenuePaise ? 'down' : 'flat', 'observed', { period: p, baseline: b }));
      }
    }
    return {
      summary: `Broke down the last ${range} days by time of day`,
      metrics,
      limitations: [SYNTHETIC, 'Time-of-day totals do not show which customers changed.'],
      link: { to: `/?range=${range}`, label: 'Open Overview' },
      computedWith: ['revenueByDaypart'],
    };
  },

  lapse_evidence(_args, ctx) {
    const o = ctx.opportunity;
    if (o.status !== 'found') {
      return {
        summary: 'Checked regulars for unusually long absences',
        metrics: [m('flagged_customers', 'Regulars flagged', 0, 'count', 'observed'), m('regulars_checked', 'Regulars checked', o.regularsTested, 'count', 'observed')],
        limitations: [SYNTHETIC],
        link: { to: '/opportunities', label: 'Open Opportunities' },
        computedWith: ['summarizeLapsedOpportunity'],
      };
    }
    const opp = o.opportunity;
    const metrics: Metric[] = [
      m('flagged_customers', 'Regulars with an unusually long absence', o.customers, 'count', 'observed'),
      m('regulars_checked', 'Regulars checked', opp.regularsTested, 'count', 'observed'),
      m('median_current_gap', 'Median days since last payment', o.medianCurrentGapDays, 'days', 'observed'),
      m('median_usual_gap', 'Median usual days between visits', o.medianTypicalGapDays, 'days', 'observed'),
      m('expected_chance_flags', 'Flags expected by chance alone', opp.expectedFalseAlarms, 'count', 'estimated'),
      m('monthly_exposure', 'Their usual monthly spend (exposure if none return)', o.pastMonthlySpendPaise, 'paise', 'estimated'),
    ];
    if (o.dominantDaypart) {
      metrics.push(t('dominant_daypart', 'Time of day most of their visits fell in', o.dominantDaypart, 'observed'));
      metrics.push(m('dominant_daypart_share', 'Share of their past visits at that time', o.daypartShares[o.dominantDaypart], 'percent', 'observed'));
    }
    return {
      summary: 'Checked each regular against their own visit habit',
      metrics,
      limitations: [
        SYNTHETIC,
        'Detects absence only; a regular who visits less often but still comes is not flagged.',
        'A flag is a signal, not proof that a customer has left; some will be on a normal break.',
        'Payment data cannot tell why a customer stopped coming.',
      ],
      link: { to: '/opportunities', label: 'Open Opportunities' },
      computedWith: ['summarizeLapsedOpportunity', 'detectLapsedRegulars'],
    };
  },

  customer_mix(args, ctx) {
    const range = args.rangeDays as number;
    const w = windows(ctx.dataset, range);
    const mix = customerMix(ctx.dataset.transactions, w.current.fromDay, w.current.toDay);
    const p = period(ctx.dataset, w.current);
    const total = mix.newCustomers + mix.returningCustomers;
    const revenue = mix.newRevenuePaise + mix.returningRevenuePaise;
    const metrics: Metric[] = [
      m('returning_customers', 'Returning customers', mix.returningCustomers, 'count', 'observed', { period: p }),
      m('new_customers', 'New customers', mix.newCustomers, 'count', 'observed', { period: p }),
    ];
    if (total > 0) metrics.push(m('returning_share', 'Share of customers who are returning', mix.returningCustomers / total, 'percent', 'observed', { period: p }));
    if (revenue > 0) metrics.push(m('returning_revenue_share', 'Share of revenue from returning customers', mix.returningRevenuePaise / revenue, 'percent', 'observed', { period: p }));
    const limitations = [SYNTHETIC];
    if (!mix.historySufficient) limitations.push('Not enough earlier history to separate new and returning customers reliably.');
    return { summary: `Split the last ${range} days' customers into new and returning`, metrics, limitations, link: { to: `/?range=${range}`, label: 'Open Overview' }, computedWith: ['customerMix'] };
  },

  compare_interventions(args, ctx) {
    const o = ctx.opportunity;
    if (o.status !== 'found') {
      return { summary: 'No flagged customers to target', metrics: [], limitations: [SYNTHETIC, 'No opportunity was detected, so there is no audience to compare offers for.'], computedWith: [] };
    }
    const settings = applyOverrides(ctx.settings, overridesFrom(args));
    const audience = planAudience(o.opportunity.cohort.map((c) => c.customerId), ctx.dataset.seed);
    const basket = averageBasketOf(basketByCustomer(o.opportunity.cohort), audience.treatmentIds);
    const evals = evaluateOptions({ customers: audience.treatmentIds.length, averageBasketPaise: basket, settings });
    const objective = (args.objective as Objective | undefined) ?? ctx.objective;
    const rec = recommend(evals, objective);
    const metrics: Metric[] = [
      m('recipients', 'Customers who would get the offer', audience.treatmentIds.length, 'count', 'observed'),
      m('average_bill', 'Their average bill', basket, 'paise', 'observed'),
      m('baseline_return', 'Would return anyway', settings.assumptions.baselineReturnRate, 'percent', 'assumed'),
      m('gross_margin', 'Gross margin', settings.assumptions.grossMarginRate, 'percent', 'assumed'),
    ];
    for (const e of evals) {
      const k = OPTION_KEY[e.intervention.id] ?? e.intervention.id;
      metrics.push(t(`${k}_offer`, `${e.intervention.label} offer`, `${e.intervention.label}: ${e.offerLabel}`, 'assumed'));
      metrics.push(m(`${k}_uplift`, `${e.intervention.label}: assumed extra return rate`, e.uplift, 'pp', 'assumed'));
      metrics.push(m(`${k}_net`, `${e.intervention.label}: expected net extra profit`, e.economics.netIncrementalProfitPaise, 'paise', 'estimated'));
      metrics.push(m(`${k}_cost`, `${e.intervention.label}: expected cost`, e.economics.totalCostPaise, 'paise', 'estimated'));
      metrics.push(m(`${k}_extra_customers`, `${e.intervention.label}: expected extra customers back`, e.economics.expectedIncrementalReturners, 'count', 'estimated'));
      metrics.push(m(`${k}_downside_net`, `${e.intervention.label}: net if it works half as well`, e.downsideNetProfitPaise, 'paise', 'estimated'));
      if (Number.isFinite(e.economics.breakEvenReturnRate)) {
        metrics.push(m(`${k}_breakeven_rate`, `${e.intervention.label}: return rate needed to break even`, e.economics.breakEvenReturnRate, 'percent', 'estimated'));
      }
    }
    const top = evals.find((e) => e.intervention.id === rec.recommendedId)!;
    metrics.push(t('recommended', 'Recommended option', `${top.intervention.label}${top.offer.kind === 'none' ? '' : `: ${top.offerLabel}`}`, 'estimated'));
    metrics.push(m('recommended_net', 'Recommended option: expected net extra profit', top.economics.netIncrementalProfitPaise, 'paise', 'estimated'));
    metrics.push(m('recommended_cost', 'Recommended option: expected cost', top.economics.totalCostPaise, 'paise', 'estimated'));
    metrics.push(m('recommended_downside_net', 'Recommended option: net if it works half as well', top.downsideNetProfitPaise, 'paise', 'estimated'));
    if (Number.isFinite(top.economics.breakEvenReturnRate) && top.offer.kind !== 'none') {
      metrics.push(m('recommended_breakeven_rate', 'Recommended option: return rate needed to break even', top.economics.breakEvenReturnRate, 'percent', 'estimated'));
      metrics.push(m('recommended_return_rate', 'Recommended option: assumed return rate', top.returnRate, 'percent', 'assumed'));
    }
    metrics.push(t('reliability', 'Recommendation strength', rec.reliability === 'clear' ? 'clear' : rec.reliability === 'close' ? 'close call' : 'no option pays back', 'estimated'));
    return {
      summary: 'Compared the four responses with the expected-value model',
      metrics,
      limitations: [
        SYNTHETIC,
        'Response rates are assumptions you can edit, not measured customer behaviour.',
        'Covers one 14-day campaign window; it does not value a won-back customer’s later months.',
        'Not every redemption is extra business: customers who would return anyway still use the offer.',
      ],
      link: { to: '/opportunities', label: 'Open the comparison' },
      computedWith: ['planAudience', 'evaluateOptions', 'recommend', 'campaignEconomics'],
    };
  },

  blanket_discount(args, ctx) {
    const range = (args.rangeDays as number) ?? 30;
    const discount = (args.discountRupees as number | undefined) ?? 30;
    const c = comparePeriods(ctx.dataset.transactions, ctx.dataset.asOfDay, range);
    const orders = c.orders.current ?? 0;
    const aov = c.averageOrderValuePaise.current ?? 0;
    const e = blanketDiscountEconomics({ orders, averageBillPaise: aov, discountPaise: discount * 100, grossMarginRate: ctx.settings.assumptions.grossMarginRate, redemptionShare: 1 });
    const p = period(ctx.dataset, c.current);
    const metrics: Metric[] = [
      m('orders', `Orders, last ${range} days`, orders, 'count', 'observed', { period: p }),
      m('average_bill', 'Average bill', aov, 'paise', 'observed', { period: p }),
      m('discount', 'Discount for everyone', discount * 100, 'paise', 'assumed'),
      m('gross_margin', 'Gross margin', ctx.settings.assumptions.grossMarginRate, 'percent', 'assumed'),
      m('subsidy_cost', 'Discount given on orders that would happen anyway', e.subsidyCostPaise, 'paise', 'estimated', { period: p }),
    ];
    if (Number.isFinite(e.breakEvenExtraOrders)) {
      metrics.push(m('breakeven_extra_orders', 'Extra orders needed to recover it', e.breakEvenExtraOrders, 'count', 'estimated', { period: p }));
      metrics.push(m('breakeven_growth', 'Order growth needed to recover it', e.breakEvenOrderGrowth, 'percent', 'estimated', { period: p }));
    }
    return {
      summary: `Estimated the cost of a discount for every order over ${range} days`,
      metrics,
      limitations: [SYNTHETIC, 'Assumes every existing order uses the discount, and uses the assumed gross margin.', 'Does not estimate how many extra orders a discount would actually bring.'],
      computedWith: ['comparePeriods', 'blanketDiscountEconomics'],
    };
  },

  experiment_readiness(_args, ctx) {
    const o = ctx.opportunity;
    const draft = ctx.scenario.draft;
    let treatment: number;
    let holdout: number;
    let rT: number;
    const baseline = draft ? draft.assumptions.baselineReturnRate : ctx.settings.assumptions.baselineReturnRate;
    if (draft) {
      treatment = draft.treatmentIds.length;
      holdout = draft.holdoutIds.length;
      rT = draft.assumedReturnRate;
    } else {
      if (o.status !== 'found') return { summary: 'No planned test', metrics: [], limitations: [SYNTHETIC, 'No flagged customers, so no test is planned.'], computedWith: [] };
      const a = planAudience(o.opportunity.cohort.map((c) => c.customerId), ctx.dataset.seed);
      treatment = a.treatmentIds.length;
      holdout = a.holdoutIds.length;
      rT = returnRateWithUplift(baseline, ctx.settings.options['win-back-30']!.uplift);
    }
    const metrics: Metric[] = [
      m('treatment_size', 'Customers who get the offer', treatment, 'count', 'observed'),
      m('holdout_size', 'Customers held back', holdout, 'count', 'observed'),
      m('assumed_rate_with_offer', 'Assumed return rate with the offer', rT, 'percent', 'assumed'),
      m('baseline_rate', 'Assumed return rate without an offer', baseline, 'percent', 'assumed'),
      m('power', 'Chance this test detects the assumed lift', twoProportionPower(rT, baseline, treatment, holdout), 'percent', 'estimated'),
      m('required_per_group', 'Customers per group needed for 80% power', sampleSizePerGroup(rT, baseline), 'count', 'estimated'),
    ];
    return {
      summary: 'Checked whether the planned test is large enough',
      metrics,
      limitations: [SYNTHETIC, 'Power uses a two-proportion normal approximation; exact tests are more conservative at these sizes.', 'The assumed lift is an input, not something the data has shown.'],
      link: { to: '/campaigns', label: 'Open Campaign Studio' },
      computedWith: ['twoProportionPower', 'sampleSizePerGroup', 'planAudience'],
    };
  },

  latest_results(_args, ctx) {
    const r = ctx.history[0];
    if (!r) {
      return { summary: 'Looked for completed simulated runs', metrics: [m('completed_runs', 'Completed simulated runs', 0, 'count', 'observed')], limitations: [SYNTHETIC, 'No simulated campaign has been completed in this session yet.'], link: { to: '/results', label: 'Open Results' }, computedWith: [] };
    }
    const rm = resultMetrics(r);
    const next = recommendNextStep(r);
    return {
      summary: 'Read the latest completed simulated run',
      metrics: [
        m('completed_runs', 'Completed simulated runs', ctx.history.length, 'count', 'observed'),
        t('campaign', 'Campaign', r.campaignName, 'observed'),
        t('offer', 'Offer', `${r.interventionLabel}: ${r.offerLabel}`, 'observed'),
        m('treatment_returned', 'Came back, offer group', rm.treatment.count, 'count', 'simulated'),
        m('treatment_size', 'Offer group size', rm.treatment.denominator, 'count', 'observed'),
        m('treatment_rate', 'Return rate, offer group', rm.treatment.rate, 'percent', 'simulated'),
        m('holdout_returned', 'Came back, held back', rm.holdout.count, 'count', 'simulated'),
        m('holdout_size', 'Holdout size', rm.holdout.denominator, 'count', 'observed'),
        m('holdout_rate', 'Return rate, held back', rm.holdout.rate, 'percent', 'simulated'),
        m('lift', 'Difference in return rate', rm.liftRate, 'pp', 'simulated'),
        m('net_simulated', 'Net extra profit in the simulated run', rm.netPaise, 'paise', 'simulated'),
        m('net_estimate', 'Net extra profit estimated before the run', r.estimate.netIncrementalProfitPaise, 'paise', 'estimated'),
        m('runs_profitable', 'Share of simulated runs of this setup that were profitable', r.range.probabilityProfitable, 'percent', 'simulated'),
        m('power', 'Chance this test size detects the assumed lift', rm.powerForAssumedLift, 'percent', 'estimated'),
        m('required_per_group', 'Customers per group needed for 80% power', rm.requiredPerGroup, 'count', 'estimated'),
        t('next_step', 'Rule-based next step', next.title, 'estimated'),
      ],
      limitations: [SYNTHETIC, 'Simulated outcomes come from the stated assumptions, not from real customers.', 'With a small holdout, the comparison is noisy and not statistically significant.'],
      link: { to: '/results', label: 'Open Results' },
      computedWith: ['resultMetrics', 'recommendNextStep'],
    };
  },

  campaign_status(_args, ctx) {
    const s = ctx.scenario;
    const metrics: Metric[] = [t('status', 'Campaign status', STATUS_LABEL[s.status], 'observed')];
    if (s.draft) {
      metrics.push(t('draft_offer', 'Drafted offer', `${getIntervention(s.draft.interventionId).label}: ${describeOffer(s.draft.offer)}`, 'observed'));
      metrics.push(m('draft_recipients', 'Recipients in the draft', s.draft.treatmentIds.length, 'count', 'observed'));
      metrics.push(m('draft_holdout', 'Held back in the draft', s.draft.holdoutIds.length, 'count', 'observed'));
    }
    return { summary: 'Read the current campaign status', metrics, limitations: ['Read-only. Approval and simulation happen only in Campaign Studio.'], link: { to: '/campaigns', label: 'Open Campaign Studio' }, computedWith: [] };
  },

  prepare_campaign_draft(args, ctx) {
    const o = ctx.opportunity;
    if (o.status !== 'found') return { summary: 'No audience to draft for', metrics: [], limitations: ['No opportunity was detected.'], computedWith: [] };
    const id = (args.interventionId as string | undefined) ?? 'win-back-30';
    const intervention = getIntervention(id);
    if (intervention.offer.kind === 'none') {
      return { summary: 'Doing nothing needs no campaign', metrics: [t('offer', 'Offer', 'Do nothing', 'assumed')], limitations: ['"Do nothing" cannot be drafted as a campaign.'], computedWith: [] };
    }
    const settings = applyOverrides(ctx.settings, { ...overridesFrom(args), interventionId: id });
    const s = settings.options[id]!;
    const offer = offerFor(intervention.offer.kind, s);
    const audience = planAudience(o.opportunity.cohort.map((c) => c.customerId), ctx.dataset.seed);
    const baskets = basketByCustomer(o.opportunity.cohort);
    const basket = averageBasketOf(baskets, audience.treatmentIds);
    const draft = createCampaignDraft({
      opportunityId: o.opportunity.id,
      interventionId: id,
      offer,
      uplift: s.uplift,
      assumptions: settings.assumptions,
      audience,
      merchantName: ctx.dataset.merchant.name,
      name: `Win back ${o.dominantDaypart ?? 'lapsed'} regulars`,
      previous: ctx.scenario.status === 'drafting' ? ctx.scenario.draft : null,
    });
    const check = checkDraft(draft, o.opportunity.cohort.map((c) => c.customerId), basket);
    const problems = [...check.name, ...check.offer, ...check.message.map((i) => i.text), ...check.audience];
    const est = problems.length === 0 || check.offer.length === 0 ? estimateDraft(draft, basket) : null;
    const label = `${intervention.label}: ${describeOffer(offer)}`;
    const metrics: Metric[] = [
      t('offer', 'Proposed offer', label, 'assumed'),
      m('recipients', 'Recipients', draft.treatmentIds.length, 'count', 'observed'),
      m('holdout', 'Held back', draft.holdoutIds.length, 'count', 'observed'),
    ];
    if (est) {
      metrics.push(m('expected_cost', 'Expected cost', est.economics.totalCostPaise, 'paise', 'estimated'));
      metrics.push(m('expected_net', 'Expected net extra profit', est.economics.netIncrementalProfitPaise, 'paise', 'estimated'));
    }
    return {
      summary: problems.length === 0 ? 'Prepared a draft proposal that passes the existing checks' : 'Prepared a draft proposal that needs fixes before approval',
      metrics,
      limitations: ['A proposal only. Creating the draft needs your click; approval happens only in Campaign Studio.', 'Simulated campaigns only: nothing is ever sent.'],
      link: { to: '/campaigns', label: 'Open Campaign Studio' },
      proposal: { kind: 'campaign_draft', draft, problems, label },
      computedWith: ['createCampaignDraft', 'checkDraft', 'estimateDraft'],
    };
  },
};

/** Runs one allowlisted tool call. Never throws: invalid calls return a ToolError. */
export function runTool(request: ToolCallRequest, ctx: ToolContext, callId: string): ToolOutcome {
  const v = validateToolArgs(request.tool, request.args);
  if (!v.ok) return { callId, tool: request.tool, ok: false, error: v.error };
  const tool = request.tool as ToolName;
  try {
    const { computedWith, ...rest } = IMPLS[tool](v.args, ctx);
    return {
      callId,
      tool,
      ok: true,
      ...rest,
      provenance: { tool, args: v.args, datasetSeed: ctx.dataset.seed, asOfDay: ctx.dataset.asOfDay, computedWith },
    };
  } catch (e) {
    return { callId, tool, ok: false, error: e instanceof Error ? e.message : 'Tool failed.' };
  }
}
