import { useId } from 'react';
import { formatCount, formatPercent } from '../../domain/format';
import type { CustomerMix } from '../../domain/overview';

export function CustomerMixCard({ mix, rangeDays }: { mix: CustomerMix; rangeDays: number }) {
  const titleId = useId();
  const total = mix.newCustomers + mix.returningCustomers;
  const revenue = mix.newRevenuePaise + mix.returningRevenuePaise;
  const returningShare = total ? mix.returningCustomers / total : 0;
  const returningRevenueShare = revenue ? mix.returningRevenuePaise / revenue : 0;

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-border bg-surface p-5 sm:p-6" data-testid="customer-mix">
      <h2 id={titleId} className="text-base font-semibold text-text">
        New vs returning customers
      </h2>
      <p className="mt-0.5 text-sm text-muted">Paying customers, last {rangeDays} days</p>

      {!mix.historySufficient ? (
        <p className="mt-4 text-sm text-muted">Not enough earlier history to tell new customers from returning ones.</p>
      ) : total === 0 ? (
        <p className="mt-4 text-sm text-muted">No paying customers in this period.</p>
      ) : (
        <>
          <div className="mt-4 flex h-3 gap-[2px]" aria-hidden="true">
            <div className="rounded-l bg-series-current" style={{ width: `${returningShare * 100}%` }} />
            <div className="flex-1 rounded-r bg-series-comparison" />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-2.5 rounded-sm bg-series-current" aria-hidden="true" />
                Returning
              </dt>
              <dd className="mt-1 text-xl font-semibold text-text">{formatCount(mix.returningCustomers)}</dd>
              <dd className="text-xs text-muted tabular">{formatPercent(returningShare, { decimals: 0 })} of customers</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-2.5 rounded-sm bg-series-comparison" aria-hidden="true" />
                New
              </dt>
              <dd className="mt-1 text-xl font-semibold text-text">{formatCount(mix.newCustomers)}</dd>
              <dd className="text-xs text-muted tabular">{formatPercent(1 - returningShare, { decimals: 0 })} of customers</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-sm text-muted">
            Returning customers brought in{' '}
            <span className="font-semibold text-text tabular">{formatPercent(returningRevenueShare, { decimals: 0 })}</span> of revenue.
          </p>
        </>
      )}
    </section>
  );
}
