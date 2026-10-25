import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { formatCount, formatINR, formatPercent } from '../../domain/format';
import type { LearningRecord } from '../../domain/results';

interface BinRow {
  mid: number;
  from: number;
  to: number;
  count: number;
}

function BinTooltip({ active, payload, runs }: TooltipContentProps<number, string> & { runs: number }) {
  const b = payload?.[0]?.payload as BinRow | undefined;
  if (!active || !b) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-xs shadow-xl shadow-black/40">
      <p className="text-muted tabular">
        {formatINR(b.from)} to {formatINR(b.to)}
      </p>
      <p className="mt-0.5 font-semibold text-text tabular">
        {formatCount(b.count)} of {formatCount(runs)} runs ({formatPercent(b.count / runs, { decimals: 0 })})
      </p>
    </div>
  );
}

/** Net profit across many simulated runs of the approved configuration, with this run and the estimate marked. */
export function ProfitDistribution({ record }: { record: LearningRecord }) {
  const rows: BinRow[] = record.bins.map((b) => ({ mid: (b.from + b.to) / 2, from: b.from, to: b.to, count: b.count }));
  const width = rows.length > 1 ? rows[1]!.mid - rows[0]!.mid : 1;
  const domain: [number, number] = [rows[0]!.from - width / 2, rows.at(-1)!.to + width / 2];
  const clamp = (v: number) => Math.min(domain[1], Math.max(domain[0], v));
  const run = record.outcome.netIncrementalProfitPaise;
  const estimate = record.estimate.netIncrementalProfitPaise;
  return (
    <figure data-testid="profit-distribution">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-series-comparison" aria-hidden="true" />
          {formatCount(record.range.runs)} simulated runs
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-simulated" aria-hidden="true" />
          This run {formatINR(run, { signed: true })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 border-l-2 border-dashed border-accent" aria-hidden="true" />
          Estimate {formatINR(estimate, { signed: true })}
        </span>
      </div>
      <div
        className="mt-3 h-56"
        role="img"
        aria-label={`Histogram of net profit across ${record.range.runs} simulated runs. 10th percentile ${formatINR(record.range.p10Paise)}, median ${formatINR(record.range.p50Paise)}, 90th percentile ${formatINR(record.range.p90Paise)}. This run: ${formatINR(run)}. Estimate: ${formatINR(estimate)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--dp-grid)" />
            <XAxis
              dataKey="mid"
              type="number"
              domain={domain}
              tickFormatter={(v: number) => formatINR(v, { compact: true })}
              tick={{ fill: 'var(--dp-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--dp-border)' }}
              tickLine={false}
              tickCount={6}
            />
            <YAxis width={36} tick={{ fill: 'var(--dp-muted)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'var(--dp-surface-hover)' }} content={(p) => <BinTooltip {...(p as TooltipContentProps<number, string>)} runs={record.range.runs} />} />
            <ReferenceLine x={0} stroke="var(--dp-border-strong)" />
            <Bar dataKey="count" fill="var(--dp-series-comparison)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <ReferenceLine x={clamp(estimate)} stroke="var(--dp-accent)" strokeDasharray="4 3" strokeWidth={2} />
            <ReferenceLine x={clamp(run)} stroke="var(--dp-simulated)" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-muted tabular">
        10th–90th percentile: {formatINR(record.range.p10Paise)} to {formatINR(record.range.p90Paise)} · median {formatINR(record.range.p50Paise)} ·{' '}
        {formatPercent(record.range.probabilityProfitable, { decimals: 0 })} of runs profitable
      </figcaption>
    </figure>
  );
}
