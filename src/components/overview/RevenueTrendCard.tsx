import { useId, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { formatINR, formatPercent } from '../../domain/format';
import type { RevenueTrend } from '../../domain/overview';
import { shortDateLabel, weekdayLabel } from '../../domain/time';

interface Row {
  label: string;
  currentLabel: string;
  previousLabel: string | null;
  current: number;
  previous: number | null;
}

function rangeLabel(startDate: string, from: number, to: number, weekly: boolean): string {
  if (!weekly) return `${weekdayLabel(startDate, from)} ${shortDateLabel(startDate, from)}`;
  return `${shortDateLabel(startDate, from)} – ${shortDateLabel(startDate, to - 1)}`;
}

function toRows(trend: RevenueTrend, startDate: string): Row[] {
  const weekly = trend.granularity === 'week';
  return trend.points.map((p) => ({
    label: shortDateLabel(startDate, p.fromDay),
    currentLabel: rangeLabel(startDate, p.fromDay, p.toDay, weekly),
    previousLabel:
      p.previousFromDay === null || p.previousToDay === null ? null : rangeLabel(startDate, p.previousFromDay, p.previousToDay, weekly),
    current: p.currentPaise,
    previous: p.previousPaise,
  }));
}

function ChartTooltip({ active, payload, weekly }: TooltipContentProps<number, string> & { weekly: boolean }) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  const change = row.previous ? (row.current - row.previous) / row.previous : null;
  const unit = weekly ? ' / day' : '';
  return (
    <div className="min-w-52 rounded-lg border border-border-strong bg-surface-raised px-3 py-2.5 text-xs shadow-xl shadow-black/40">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-muted">
          <span className="h-0.5 w-3 rounded-full bg-series-current" aria-hidden="true" />
          {row.currentLabel}
        </span>
        <span className="font-semibold text-text tabular">
          {formatINR(row.current)}
          {unit}
        </span>
      </div>
      {row.previous !== null && row.previousLabel && (
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-muted">
            <span className="h-0.5 w-3 rounded-full bg-series-comparison" aria-hidden="true" />
            {row.previousLabel}
          </span>
          <span className="font-medium text-text tabular">
            {formatINR(row.previous)}
            {unit}
          </span>
        </div>
      )}
      {change !== null && (
        <p className="mt-2 border-t border-border pt-2 text-muted tabular">{formatPercent(change, { signed: true })} vs previous period</p>
      )}
    </div>
  );
}

export function RevenueTrendCard({ trend, startDate, rangeDays }: { trend: RevenueTrend; startDate: string; rangeDays: number }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const titleId = useId();
  const weekly = trend.granularity === 'week';
  const rows = toRows(trend, startDate);
  const hasPrevious = rows.some((r) => r.previous !== null);
  const peak = rows.reduce((best, r) => (r.current > best.current ? r : best), rows[0]!);
  const subtitle = weekly
    ? `Average revenue per day, by week · last ${rangeDays} days`
    : `Revenue per day · last ${rangeDays} days`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col rounded-2xl border border-border bg-surface p-5 sm:p-6" data-testid="revenue-trend">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-text">
            Revenue trend
          </h2>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Display as">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-muted capitalize transition-colors hover:text-text aria-pressed:bg-surface-raised aria-pressed:text-text"
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-series-current" aria-hidden="true" />
          Last {rangeDays} days
        </span>
        {hasPrevious && (
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full bg-series-comparison" aria-hidden="true" />
            Previous {rangeDays} days
          </span>
        )}
        <span className="ml-auto tabular">
          {weekly ? 'Strongest week' : 'Best day'}: <span className="font-medium text-text">{peak.currentLabel}</span> ·{' '}
          {formatINR(peak.current)}
          {weekly ? ' / day' : ''}
        </span>
      </div>

      {view === 'chart' ? (
        <div className="mt-3 h-80" role="img" aria-label={`${subtitle}. Switch to table view for exact values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--dp-grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: 'var(--dp-border)' }}
                tick={{ fill: 'var(--dp-muted)', fontSize: 12 }}
                tickMargin={8}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fill: 'var(--dp-muted)', fontSize: 12 }}
                tickFormatter={(v: number) => formatINR(v, { compact: true })}
                tickCount={5}
              />
              <Tooltip
                cursor={{ stroke: 'var(--dp-border-strong)', strokeWidth: 1 }}
                content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} weekly={weekly} />}
              />
              {hasPrevious && (
                <Line
                  type="monotone"
                  dataKey="previous"
                  name={`Previous ${rangeDays} days`}
                  stroke="var(--dp-series-comparison)"
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--dp-series-comparison)', stroke: 'var(--dp-surface)', strokeWidth: 2 }}
                  animationDuration={400}
                />
              )}
              <Area
                type="monotone"
                dataKey="current"
                name={`Last ${rangeDays} days`}
                stroke="var(--dp-series-current)"
                strokeWidth={2}
                fill="var(--dp-series-current)"
                fillOpacity={0.1}
                dot={rows.length <= 14 ? { r: 3.5, fill: 'var(--dp-series-current)', stroke: 'var(--dp-surface)', strokeWidth: 2 } : false}
                activeDot={{ r: 4.5, fill: 'var(--dp-series-current)', stroke: 'var(--dp-surface)', strokeWidth: 2 }}
                animationDuration={400}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3 h-80 overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{subtitle}</caption>
            <thead className="sticky top-0 bg-surface-raised text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {weekly ? 'Week' : 'Day'}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Revenue{weekly ? ' / day' : ''}
                </th>
                {hasPrevious && (
                  <>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Previous period
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Revenue{weekly ? ' / day' : ''}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular">
              {rows.map((r) => (
                <tr key={r.currentLabel}>
                  <td className="px-3 py-1.5 text-text">{r.currentLabel}</td>
                  <td className="px-3 py-1.5 text-right text-text">{formatINR(r.current)}</td>
                  {hasPrevious && (
                    <>
                      <td className="px-3 py-1.5 text-muted">{r.previousLabel}</td>
                      <td className="px-3 py-1.5 text-right text-muted">{r.previous === null ? '—' : formatINR(r.previous)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
