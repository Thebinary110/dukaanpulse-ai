import { ArrowRight, ChevronDown, Radar, SearchCheck } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { LapsedOpportunitySummary, OpportunityOverview } from '../../domain/detectors/lapsedSummary';
import { formatCount, formatDays, formatINR, formatPercent } from '../../domain/format';
import { shortDateLabel } from '../../domain/time';
import type { ConfidenceLevel } from '../../domain/types';
import { InfoTip } from '../InfoTip';

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'Strong signal',
  medium: 'Moderate signal',
  low: 'Weak signal',
};

const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  high: 'border-accent/40 bg-accent-soft text-text',
  medium: 'border-warning/40 bg-warning-soft text-text',
  low: 'border-border-strong bg-surface-raised text-muted',
};

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs whitespace-nowrap text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-text">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{note}</dd>
    </div>
  );
}

interface WeekRow {
  label: string;
  range: string;
  visits: number;
}

function WeekTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const row = payload?.[0]?.payload as WeekRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-xs shadow-xl shadow-black/40">
      <p className="text-muted">{row.range}</p>
      <p className="mt-0.5 font-semibold text-text tabular">
        {formatCount(row.visits)} {row.visits === 1 ? 'visit' : 'visits'}
      </p>
    </div>
  );
}

function VisitsChart({ summary, startDate }: { summary: LapsedOpportunitySummary; startDate: string }) {
  const rows: WeekRow[] = summary.weeklyVisits.map((w) => ({
    label: shortDateLabel(startDate, w.weekStartDay),
    range: `${shortDateLabel(startDate, w.weekStartDay)} – ${shortDateLabel(startDate, w.weekStartDay + 6)}`,
    visits: w.visits,
  }));
  return (
    <figure className="flex h-full min-h-56 flex-col" data-testid="opportunity-visits-chart">
      <figcaption className="text-xs text-muted">
        <span className="font-medium text-text">Weekly visits by these {formatCount(summary.customers)} customers</span>
        <span className="block">Observed in payments, last {rows.length} weeks</span>
      </figcaption>
      <div className="mt-3 min-h-44 flex-1" role="img" aria-label={`Weekly visits: ${rows.map((r) => `${r.label}: ${r.visits}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--dp-grid)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--dp-border)' }}
              tick={{ fill: 'var(--dp-muted)', fontSize: 11 }}
              tickMargin={6}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis width={32} tickLine={false} axisLine={false} tick={{ fill: 'var(--dp-muted)', fontSize: 11 }} tickCount={4} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'var(--dp-surface-hover)' }} content={(p) => <WeekTooltip {...(p as TooltipContentProps<number, string>)} />} />
            <Bar dataKey="visits" fill="var(--dp-series-current)" radius={[4, 4, 0, 0]} maxBarSize={24} animationDuration={400} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function Found({ summary, startDate, asOfLabel }: { summary: LapsedOpportunitySummary; startDate: string; asOfLabel: string }) {
  const titleId = useId();
  const { opportunity: opp } = summary;
  const level = opp.confidence.level;
  const chanceFlags = Math.round(opp.expectedFalseAlarms);
  const daypartShare = summary.dominantDaypart ? summary.daypartShares[summary.dominantDaypart] : null;

  return (
    <section
      aria-labelledby={titleId}
      data-testid="opportunity-panel"
      className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface"
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true" />
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold tracking-wider text-accent uppercase">
            <Radar className="size-3.5" aria-hidden="true" />
            Growth opportunity
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${CONFIDENCE_STYLE[level]}`}>
            {CONFIDENCE_LABEL[level]}
            <InfoTip label="About signal strength">
              Based on how many customers show an unusual absence ({formatCount(summary.customers)}) and how many would be
              flagged by chance alone (about {formatCount(chanceFlags)}). It is not a probability that they have left.
            </InfoTip>
          </span>
          <span className="text-muted">As of {asOfLabel} · gaps are medians</span>
        </div>

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <h2 id={titleId} className="text-2xl leading-tight font-semibold tracking-tight text-balance text-text sm:text-[28px]">
              {summary.headline}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted" data-testid="opportunity-summary">
              {summary.summary}
            </p>

            <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-5">
              <Stat label="Flagged" value={formatCount(summary.customers)} note={`of ${formatCount(opp.regularsTested)} regulars`} />
              <Stat label="Usual gap" value={formatDays(summary.medianTypicalGapDays)} note="between visits" />
              <Stat label="Current gap" value={formatDays(summary.medianCurrentGapDays)} note="since last visit" />
            </dl>
            {daypartShare !== null && (
              <p className="mt-4 text-sm text-muted">
                {formatPercent(daypartShare, { decimals: 0 })} of their past visits were in the {summary.dominantDaypart}.
              </p>
            )}
          </div>

          <VisitsChart summary={summary} startDate={startDate} />
        </div>

        <div className="mt-7 rounded-xl border border-dashed border-border-strong bg-bg/40 p-4 sm:p-5" data-testid="opportunity-estimate">
          <p className="text-xs font-semibold tracking-wider text-warning uppercase">Estimate, not observed</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            If none of them come back, about{' '}
            <span className="font-semibold text-text">{formatINR(summary.pastMonthlySpendPaise)} a month</span> in sales is at risk,
            based on what these customers used to spend. Roughly {formatCount(chanceFlags)} of the {formatCount(summary.customers)} could
            simply be on a normal break.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <details className="group text-sm">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md py-2.5 text-muted transition-colors hover:text-text [&::-webkit-details-marker]:hidden">
              <SearchCheck className="size-4" aria-hidden="true" />
              How DukaanPulse found this
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-3 max-w-2xl space-y-2 text-sm leading-relaxed text-muted" data-testid="opportunity-method">
              <p>
                For every regular customer, DukaanPulse learns how often they usually pay, using only their own past visits. It
                then asks how unlikely their current absence would be if nothing had changed. Customers whose absence would
                happen less than {formatPercent(opp.method.probabilityThreshold, { decimals: 0 })} of the time by chance are flagged.
              </p>
              <ul className="grid gap-1 rounded-lg border border-border bg-bg/40 p-3 text-xs tabular sm:grid-cols-2">
                <li>Regulars checked: {formatCount(opp.regularsTested)}</li>
                <li>Regular = at least {opp.method.minWeeklyRate} visit a week</li>
                <li>Minimum history: {opp.method.minVisitDays} visit-days</li>
                <li>Minimum absence: {opp.method.minGapDays} days</li>
                <li>Flag threshold: P(gap) &lt; {opp.method.probabilityThreshold}</li>
                <li>Expected chance flags: {opp.expectedFalseAlarms.toFixed(1)}</li>
              </ul>
            </div>
          </details>
          <Link
            to="/opportunities"
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover sm:self-auto"
          >
            Investigate opportunity
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function NoneFound({ regularsTested, asOfLabel }: { regularsTested: number; asOfLabel: string }) {
  return (
    <section data-testid="opportunity-empty" className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
        <Radar className="size-3.5" aria-hidden="true" />
        Growth opportunities
      </p>
      <h2 className="mt-3 text-xl font-semibold text-text">Nothing needs your attention right now</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        DukaanPulse checked {formatCount(regularsTested)} regular customers in payments up to {asOfLabel} and found none with an
        unusually long absence. It will keep watching as new payments arrive.
      </p>
    </section>
  );
}

export function OpportunityPanel({ overview, startDate, asOfLabel }: { overview: OpportunityOverview; startDate: string; asOfLabel: string }) {
  return overview.status === 'found' ? (
    <Found summary={overview} startDate={startDate} asOfLabel={asOfLabel} />
  ) : (
    <NoneFound regularsTested={overview.regularsTested} asOfLabel={asOfLabel} />
  );
}
