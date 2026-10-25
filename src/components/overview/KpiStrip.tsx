import type { ReactNode } from 'react';
import { formatCount, formatINR, formatPercent } from '../../domain/format';
import type { MetricComparison, PeriodComparison } from '../../domain/overview';
import { InfoTip } from '../InfoTip';
import { Delta } from './Delta';

interface KpiProps {
  label: string;
  definition: ReactNode;
  metric: MetricComparison;
  format: (v: number) => string;
  formatChange: (m: MetricComparison) => { primary: string; secondary?: string };
  comparisonLabel: string;
  hero?: boolean;
  testId: string;
}

function Kpi({ label, definition, metric, format, formatChange, comparisonLabel, hero, testId }: KpiProps) {
  const hasComparison = metric.direction !== 'unknown';
  const change = hasComparison ? formatChange(metric) : null;
  return (
    <div className="flex min-w-0 flex-col gap-2 bg-surface p-5 sm:p-6" data-testid={testId}>
      <div className="flex items-center gap-1 text-sm text-muted">
        <h3>{label}</h3>
        <InfoTip label={`About ${label.toLowerCase()}`}>{definition}</InfoTip>
      </div>
      <p className={`font-semibold tracking-tight text-text ${hero ? 'text-[34px] leading-10' : 'text-[28px] leading-9'}`} data-value>
        {metric.current === null ? '—' : format(metric.current)}
      </p>
      <div className="min-h-10 text-sm">
        {change ? (
          <>
            <Delta direction={metric.direction} primary={change.primary} secondary={change.secondary} />
            <p className="mt-0.5 text-xs text-muted tabular">
              {comparisonLabel}: {metric.previous === null ? '—' : format(metric.previous)}
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted">{metric.unavailableReason ?? 'No comparison available.'}</p>
        )}
      </div>
    </div>
  );
}

const relative = (m: MetricComparison) => (m.relativeChange === null ? '' : formatPercent(m.relativeChange, { signed: true }));

export function KpiStrip({ comparison }: { comparison: PeriodComparison }) {
  const prev = `Previous ${comparison.rangeDays} days`;
  return (
    <section
      aria-label="Performance summary"
      className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1fr]"
    >
      <Kpi
        hero
        testId="kpi-revenue"
        label="Revenue"
        definition="Total value of payments received in the period, before any discounts you funded."
        metric={comparison.revenuePaise}
        format={(v) => formatINR(v)}
        formatChange={(m) => ({ primary: relative(m), secondary: formatINR(m.absoluteChange!, { signed: true }) })}
        comparisonLabel={prev}
      />
      <Kpi
        testId="kpi-orders"
        label="Orders"
        definition="Number of payments received. Each payment counts as one order."
        metric={comparison.orders}
        format={formatCount}
        formatChange={(m) => ({
          primary: relative(m),
          secondary: `${m.absoluteChange! > 0 ? '+' : ''}${formatCount(m.absoluteChange!)}`,
        })}
        comparisonLabel={prev}
      />
      <Kpi
        testId="kpi-aov"
        label="Average order value"
        definition="Revenue divided by orders: how much a customer spends per visit on average."
        metric={comparison.averageOrderValuePaise}
        format={(v) => formatINR(v)}
        formatChange={(m) => ({ primary: relative(m), secondary: formatINR(m.absoluteChange!, { signed: true }) })}
        comparisonLabel={prev}
      />
      <Kpi
        testId="kpi-repeat"
        label="Repeat customers"
        definition="Share of the period's paying customers who had also paid before the period started. Needs at least 4 weeks of earlier history."
        metric={comparison.repeatCustomerShare}
        format={(v) => formatPercent(v)}
        formatChange={(m) => ({ primary: `${formatPercent(m.absoluteChange!, { signed: true }).replace('%', '')} pts` })}
        comparisonLabel={prev}
      />
    </section>
  );
}
