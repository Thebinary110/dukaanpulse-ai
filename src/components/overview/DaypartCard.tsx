import { useId } from 'react';
import { formatINR, formatPercent } from '../../domain/format';
import { DAYPART_HOURS, largestDaypartChange, type DaypartSlice } from '../../domain/overview';

const NAME = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } as const;

export function DaypartCard({ current, previous, rangeDays }: { current: DaypartSlice[]; previous: DaypartSlice[] | null; rangeDays: number }) {
  const titleId = useId();
  const max = Math.max(...current.map((s) => s.revenuePaise), ...(previous ?? []).map((s) => s.revenuePaise), 1);
  const mover = previous ? largestDaypartChange(current, previous) : null;

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-border bg-surface p-5 sm:p-6" data-testid="daypart-card">
      <h2 id={titleId} className="text-base font-semibold text-text">
        Sales by time of day
      </h2>
      <p className="mt-0.5 text-sm text-muted">Revenue, last {rangeDays} days{previous ? ` vs the ${rangeDays} before` : ''}</p>

      {mover && Math.abs(mover.relativeChange) >= 0.05 && (
        <p className="mt-3 text-sm text-text" data-testid="daypart-insight">
          {NAME[mover.daypart]} sales {mover.relativeChange < 0 ? 'fell' : 'rose'}{' '}
          <span className="font-semibold tabular">{formatPercent(Math.abs(mover.relativeChange), { decimals: 0 })}</span>, the biggest change
          of the day.
        </p>
      )}

      {previous && (
        <div className="mt-4 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-series-current" aria-hidden="true" />
            Last {rangeDays} days
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-series-comparison" aria-hidden="true" />
            Previous {rangeDays} days
          </span>
        </div>
      )}

      <ul className="mt-4 space-y-4">
        {current.map((slice) => {
          const prev = previous?.find((p) => p.daypart === slice.daypart) ?? null;
          const change = prev && prev.revenuePaise > 0 ? (slice.revenuePaise - prev.revenuePaise) / prev.revenuePaise : null;
          return (
            <li key={slice.daypart}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-text">
                  {NAME[slice.daypart]} <span className="text-xs text-muted">{DAYPART_HOURS[slice.daypart]}</span>
                </span>
                <span className="text-text tabular">
                  {formatINR(slice.revenuePaise, { compact: true })}
                  {change !== null && <span className="ml-2 text-xs text-muted">{formatPercent(change, { signed: true, decimals: 0 })}</span>}
                </span>
              </div>
              <div className="mt-1.5 space-y-[2px]" aria-hidden="true">
                <div className="h-2 rounded-r bg-series-current" style={{ width: `${(slice.revenuePaise / max) * 100}%` }} />
                {prev && <div className="h-2 rounded-r bg-series-comparison" style={{ width: `${(prev.revenuePaise / max) * 100}%` }} />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
