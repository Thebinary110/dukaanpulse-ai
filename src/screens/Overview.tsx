import { Database } from 'lucide-react';
import { ComingNext } from '../components/ComingNext';
import { PageHeader } from '../components/PageHeader';
import { getDemoData } from '../data/demoData';
import { formatCount } from '../domain/format';

const KPI_LABELS = ['Revenue', 'Orders', 'Average order value', 'Repeat customers'];

export function Overview() {
  const { dataset, periodLabel } = getDemoData();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Welcome back, ${dataset.merchant.name}`}
        description="How your shop is doing, and what DukaanPulse thinks deserves your attention today."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
        {KPI_LABELS.map((label) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm text-muted">{label}</p>
            <div className="mt-3 h-8 w-28 animate-pulse rounded-md bg-surface-raised" />
            <div className="mt-3 h-3 w-20 rounded bg-surface-raised" />
          </div>
        ))}
      </div>

      <ComingNext
        title="Your business command center"
        points={[
          'Revenue, orders, average order value and repeat-customer share for the last 30 days',
          'Change versus the previous 30 days',
          'Daily sales trend and new versus returning customers',
          'The top opportunity DukaanPulse found in your payments',
        ]}
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-surface-raised/50 px-4 py-3 text-sm text-muted">
          <Database className="size-4 text-simulated" aria-hidden="true" />
          <span>
            Synthetic dataset ready:{' '}
            <span className="tabular font-medium text-text" data-testid="txn-count">
              {formatCount(dataset.transactions.length)}
            </span>{' '}
            payments from{' '}
            <span className="tabular font-medium text-text">{formatCount(dataset.customers.length)}</span> customers,{' '}
            {periodLabel}.
          </span>
        </p>
      </ComingNext>
    </div>
  );
}
