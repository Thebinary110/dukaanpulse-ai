import { Database } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CustomerMixCard } from '../components/overview/CustomerMixCard';
import { DaypartCard } from '../components/overview/DaypartCard';
import { KpiStrip } from '../components/overview/KpiStrip';
import { NextStepCard } from '../components/overview/NextStepCard';
import { OpportunityPanel } from '../components/overview/OpportunityPanel';
import { RangeSelector } from '../components/overview/RangeSelector';
import { RevenueTrendCard } from '../components/overview/RevenueTrendCard';
import { getDemoData } from '../data/demoData';
import { formatCount } from '../domain/format';
import { comparePeriods, customerMix, RANGE_OPTIONS, revenueByDaypart, revenueTrend, type RangeDays } from '../domain/overview';
import { shortDateLabel } from '../domain/time';

const DEFAULT_RANGE: RangeDays = 30;

function parseRange(value: string | null): RangeDays {
  const n = Number(value);
  return (RANGE_OPTIONS as readonly number[]).includes(n) ? (n as RangeDays) : DEFAULT_RANGE;
}

export function Overview() {
  const { dataset, asOfLabel, opportunity } = getDemoData();
  const [params, setParams] = useSearchParams();
  const range = parseRange(params.get('range'));
  const { transactions, asOfDay, startDate } = dataset;

  const view = useMemo(() => {
    const comparison = comparePeriods(transactions, asOfDay, range);
    const { current, previous } = comparison;
    return {
      comparison,
      trend: revenueTrend(transactions, asOfDay, range),
      dayparts: revenueByDaypart(transactions, current.fromDay, current.toDay),
      previousDayparts: previous ? revenueByDaypart(transactions, previous.fromDay, previous.toDay) : null,
      mix: customerMix(transactions, current.fromDay, current.toDay),
    };
  }, [transactions, asOfDay, range]);

  const { current, previous } = view.comparison;
  const period = (from: number, to: number) => `${shortDateLabel(startDate, from)} – ${shortDateLabel(startDate, to - 1)}`;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {dataset.merchant.category} · {dataset.merchant.locality} · <span className="text-simulated">fictional</span>
          </p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight text-text sm:text-[32px]">
            {dataset.merchant.name}
          </h1>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted">
            Your growth overview: how the shop is doing, what changed, and what deserves your attention.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <RangeSelector value={range} onChange={(r) => setParams(r === DEFAULT_RANGE ? {} : { range: String(r) }, { replace: true })} />
          <p className="text-xs whitespace-nowrap text-muted tabular" data-testid="period-label">
            {period(current.fromDay, current.toDay)}
            {previous ? ` vs ${period(previous.fromDay, previous.toDay)}` : ' · no earlier period to compare'}
          </p>
        </div>
      </header>

      <p className="-mt-2 inline-flex w-fit items-center gap-2 text-xs text-muted">
        <Database className="size-3.5 text-simulated" aria-hidden="true" />
        Insights computed on this device from{' '}
        <span className="font-medium text-text tabular">{formatCount(transactions.length)}</span> synthetic demo payments
      </p>

      <KpiStrip comparison={view.comparison} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <OpportunityPanel overview={opportunity} startDate={startDate} asOfLabel={asOfLabel} />
        <NextStepCard overview={opportunity} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RevenueTrendCard trend={view.trend} startDate={startDate} rangeDays={range} />
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
          <DaypartCard current={view.dayparts} previous={view.previousDayparts} rangeDays={range} />
          <CustomerMixCard mix={view.mix} rangeDays={range} />
        </div>
      </div>
    </div>
  );
}
