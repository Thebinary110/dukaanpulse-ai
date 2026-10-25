/**
 * Evidence references and rendering.
 *
 * Claims reference metrics as {{callId.metricKey}}. Rendering replaces each reference with
 * the metric's value formatted by the app's own formatters, so no number in an answer is
 * written by a model.
 */
import { formatCount, formatDays, formatINR, formatPercent } from '../domain/format';
import type { Metric, ToolOutcome, ToolResult } from './types';

export const REF_PATTERN = /\{\{\s*([a-z0-9_]+)\.([a-z0-9_]+)\s*\}\}/gi;

export type MetricIndex = Map<string, { metric: Metric; result: ToolResult }>;

export function indexMetrics(outcomes: readonly ToolOutcome[]): MetricIndex {
  const index: MetricIndex = new Map();
  for (const o of outcomes) {
    if (!o.ok) continue;
    for (const metric of o.metrics) index.set(`${o.callId}.${metric.key}`, { metric, result: o });
  }
  return index;
}

export function formatMetric(metric: Metric): string {
  switch (metric.unit) {
    case 'paise':
      return formatINR(metric.value, { signed: metric.key.includes('change') || metric.key.endsWith('_effect') || metric.key.endsWith('net') || metric.key.includes('net_') });
    case 'count':
      return Number.isInteger(metric.value) ? formatCount(metric.value) : (Math.round(metric.value * 10) / 10).toLocaleString('en-IN');
    case 'percent':
      return formatPercent(metric.value, { decimals: metric.key.includes('change') || Math.abs(metric.value) < 0.1 ? 1 : 0, signed: metric.key.includes('change') });
    case 'pp': {
      const pts = Math.round(metric.value * 1000) / 10;
      return `${pts > 0 ? '+' : pts < 0 ? '−' : ''}${Math.abs(pts)} pts`;
    }
    case 'days':
      return formatDays(metric.value);
    case 'ratio':
      return (Math.round(metric.value * 100) / 100).toString();
    case 'text':
      return metric.text ?? '';
  }
}

/** Metric refs used in a text. */
export function refsIn(text: string): string[] {
  return [...text.matchAll(REF_PATTERN)].map((m) => `${m[1]}.${m[2]}`);
}

/** Replaces references with formatted values; unknown references become "[missing]". */
export function renderClaim(text: string, index: MetricIndex): string {
  return text.replace(REF_PATTERN, (_all, call: string, key: string) => {
    const hit = index.get(`${call}.${key}`);
    return hit ? formatMetric(hit.metric) : '[missing]';
  });
}

/** Digits left in a text once its references are removed (these were not taken from tools). */
export function strayNumbers(text: string): string[] {
  return [...text.replace(REF_PATTERN, '').matchAll(/\d[\d,.]*/g)].map((m) => m[0]);
}
