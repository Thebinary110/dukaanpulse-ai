/**
 * Who each tool metric is about, and which window it covers. Assigned in one place after a tool
 * runs, so every metric that describes people or sales carries a population the semantic checks
 * can compare claims against.
 */
import type { Daypart } from '../../domain/types';
import type { Metric, Population, PopulationGroup, ToolName, ToolResult } from '../types';

const DAYPARTS: readonly Daypart[] = ['morning', 'afternoon', 'evening'];

function daypartPrefix(key: string): Daypart | undefined {
  return DAYPARTS.find((d) => key.startsWith(`${d}_`));
}

const pop = (group: PopulationGroup, daypart?: Daypart): Population => (daypart ? { group, daypart } : { group });

/** Population for one metric, or undefined for settings, labels and window lengths. */
export function populationOf(tool: ToolName, metric: Metric, all: readonly Metric[], flaggedDaypart: Daypart | undefined): Population | undefined {
  const k = metric.key;
  if (metric.unit === 'text' || k === 'window_days') return undefined;
  if (metric.evidence === 'assumed' && !k.endsWith('_size')) return undefined;
  switch (tool) {
    case 'revenue_comparison':
      // A share's population is its numerator: "repeat customers were x% of customers".
      return k.startsWith('repeat_share') ? pop('returning_customers') : pop('shop');
    case 'revenue_drivers': {
      const d = daypartPrefix(k);
      if (d) return pop('shop', d);
      if (k.startsWith('largest_decline')) {
        const which = all.find((m) => m.key === 'largest_decline_daypart')?.text as Daypart | undefined;
        return pop('shop', which);
      }
      return pop('shop');
    }
    case 'daypart_breakdown':
      return pop('shop', daypartPrefix(k));
    case 'lapse_evidence':
      return k === 'regulars_checked' ? pop('regulars') : pop('flagged_regulars', flaggedDaypart);
    case 'customer_mix':
      return k === 'new_customers' ? pop('new_customers') : pop('returning_customers');
    case 'compare_interventions':
      return pop('offer_group', flaggedDaypart);
    case 'blanket_discount':
      return pop('shop');
    case 'experiment_readiness':
      return k === 'treatment_size' ? pop('offer_group', flaggedDaypart) : k === 'holdout_size' ? pop('holdout', flaggedDaypart) : pop('campaign');
    case 'latest_results':
      return k.startsWith('treatment_') ? pop('offer_group', flaggedDaypart) : k.startsWith('holdout_') ? pop('holdout', flaggedDaypart) : pop('campaign');
    case 'campaign_status':
      return k === 'draft_recipients' ? pop('offer_group', flaggedDaypart) : k === 'draft_holdout' ? pop('holdout', flaggedDaypart) : undefined;
    case 'prepare_campaign_draft':
      return k === 'recipients' ? pop('offer_group', flaggedDaypart) : k === 'holdout' ? pop('holdout', flaggedDaypart) : pop('campaign');
  }
}

/** Adds populations to metrics and the comparison window to the result. */
export function annotate(result: Omit<ToolResult, 'window'>, flaggedDaypart: Daypart | undefined): ToolResult {
  const metrics = result.metrics.map((m) => {
    const population = populationOf(result.tool, m, result.metrics, flaggedDaypart);
    return population ? { ...m, population } : m;
  });
  const current = metrics.find((m) => m.period && m.baseline)?.period ?? metrics.find((m) => m.period)?.period;
  const baseline = metrics.find((m) => m.baseline)?.baseline ?? null;
  return current ? { ...result, metrics, window: { days: current.toDay - current.fromDay, current, baseline } } : { ...result, metrics };
}
