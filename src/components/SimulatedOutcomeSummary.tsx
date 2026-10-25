import { FlaskConical } from 'lucide-react';
import { formatCount, formatINR, formatPercent } from '../domain/format';
import type { SimulatedOutcome } from '../domain/types';

/** Headline simulated outcome: offer group vs holdout. Always labelled as simulated. */
export function SimulatedOutcomeSummary({ outcome }: { outcome: SimulatedOutcome }) {
  const lift = outcome.liftRate;
  return (
    <div data-testid="outcome-summary">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-simulated/40 bg-simulated-soft px-2.5 py-0.5 text-xs font-medium text-text">
        <FlaskConical className="size-3.5 text-simulated" aria-hidden="true" />
        Simulated outcome, not a real result
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Came back, with the offer</dt>
          <dd className="mt-1 text-2xl font-semibold text-text" data-testid="outcome-treatment">
            {formatPercent(outcome.treatmentReturnRate, { decimals: 0 })}
          </dd>
          <dd className="text-xs text-muted tabular">
            {formatCount(outcome.treatment.returned)} of {formatCount(outcome.treatment.customers)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Came back, held back</dt>
          <dd className="mt-1 text-2xl font-semibold text-text" data-testid="outcome-holdout">
            {formatPercent(outcome.holdoutReturnRate, { decimals: 0 })}
          </dd>
          <dd className="text-xs text-muted tabular">
            {formatCount(outcome.holdout.returned)} of {formatCount(outcome.holdout.customers)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Net extra profit</dt>
          <dd className="mt-1 text-2xl font-semibold text-text" data-testid="outcome-net">
            {formatINR(outcome.netIncrementalProfitPaise, { signed: true })}
          </dd>
          <dd className="text-xs text-muted tabular">
            {formatPercent(lift, { signed: true, decimals: 0 }).replace('%', '')} pts lift vs holdout
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        With only {formatCount(outcome.holdout.customers)} held-back customers, the comparison is noisy. Treat it as an illustration of how the result
        would be measured.
      </p>
    </div>
  );
}
