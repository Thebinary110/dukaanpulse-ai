import { formatCount, formatPercent } from '../../domain/format';
import type { RateMetric } from '../../domain/results';

interface Row {
  label: string;
  metric: RateMetric;
  assumed: number;
  assumedLabel: string;
  tone: 'current' | 'comparison';
}

/** Return rate per group with its 95% range and the assumed rate, on one shared 0–max scale. */
export function GroupRates({ rows }: { rows: Row[] }) {
  const max = Math.min(1, Math.ceil((Math.max(...rows.flatMap((r) => [r.metric.interval.high, r.assumed])) + 0.05) * 10) / 10);
  const x = (v: number) => `${(v / max) * 100}%`;
  const ticks = Array.from({ length: Math.round(max * 10) + 1 }, (_, i) => i / 10).filter((_, i, a) => a.length <= 6 || i % 2 === 0);
  return (
    <figure data-testid="group-rates">
      <figcaption className="sr-only">Return rate by group with 95% ranges and assumed rates</figcaption>
      <div className="space-y-6">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-medium text-text">{r.label}</span>
              <span className="text-text tabular">
                {formatCount(r.metric.count)} of {formatCount(r.metric.denominator)} · {formatPercent(r.metric.rate, { decimals: 0 })}
                <span className="ml-2 text-xs text-muted">
                  95% range {formatPercent(r.metric.interval.low, { decimals: 0 })}–{formatPercent(r.metric.interval.high, { decimals: 0 })}
                </span>
              </span>
            </div>
            <div className="relative mt-2 h-7" aria-hidden="true">
              <div className="absolute inset-y-[11px] right-0 left-0 rounded-full bg-surface-raised" />
              <div
                className={`absolute inset-y-[9px] left-0 rounded-r ${r.tone === 'current' ? 'bg-series-current' : 'bg-series-comparison'}`}
                style={{ width: x(r.metric.rate) }}
              />
              <div className="absolute top-[13px] h-px bg-text/70" style={{ left: x(r.metric.interval.low), width: `calc(${x(r.metric.interval.high)} - ${x(r.metric.interval.low)})` }} />
              <div className="absolute top-[8px] h-[11px] w-px bg-text/70" style={{ left: x(r.metric.interval.low) }} />
              <div className="absolute top-[8px] h-[11px] w-px bg-text/70" style={{ left: x(r.metric.interval.high) }} />
              <div className="absolute top-0 h-7 border-l-2 border-dashed border-warning" style={{ left: x(r.assumed) }} />
            </div>
            <p className="mt-1 text-xs text-muted tabular">
              <span className="text-warning">┆</span> {r.assumedLabel}: {formatPercent(r.assumed, { decimals: 0 })}
            </p>
          </div>
        ))}
      </div>
      <div className="relative mt-3 h-4 text-[11px] text-muted tabular" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: x(t) }}>
            {Math.round(t * 100)}%
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-series-current" aria-hidden="true" />
          Simulated rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 bg-text/70" aria-hidden="true" />
          95% range (Wilson)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 border-l-2 border-dashed border-warning" aria-hidden="true" />
          Assumed before the run
        </span>
      </div>
    </figure>
  );
}
