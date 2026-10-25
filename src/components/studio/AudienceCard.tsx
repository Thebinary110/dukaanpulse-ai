import { ChevronDown, Lock } from 'lucide-react';
import type { LapsedCustomer } from '../../domain/types';
import { formatCount, formatDays } from '../../domain/format';
import { shortDateLabel } from '../../domain/time';
import { Card } from './Card';

const SAMPLE = 6;

function IdList({ ids, byId, startDate }: { ids: string[]; byId: Map<string, LapsedCustomer>; startDate: string }) {
  return (
    <div className="max-h-56 overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs tabular">
        <thead className="sticky top-0 bg-surface-raised text-muted">
          <tr>
            <th scope="col" className="px-3 py-1.5 font-medium">
              Customer
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              Usually every
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              Last payment
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ids.map((id) => {
            const c = byId.get(id);
            return (
              <tr key={id}>
                <td className="px-3 py-1.5 text-text">{id}</td>
                <td className="px-3 py-1.5 text-right text-muted">{c ? formatDays(c.typicalGapDays) : '—'}</td>
                <td className="px-3 py-1.5 text-right text-muted">{c ? shortDateLabel(startDate, c.lastVisitDay) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AudienceCard({
  treatmentIds,
  holdoutIds,
  flagged,
  regularsChecked,
  problems,
  startDate,
}: {
  treatmentIds: string[];
  holdoutIds: string[];
  flagged: LapsedCustomer[];
  regularsChecked: number;
  problems: string[];
  startDate: string;
}) {
  const byId = new Map(flagged.map((c) => [c.customerId, c]));
  return (
    <Card id="audience-title" label="Audience · from observed payments" title="Who gets the offer" testId="audience-card">
      <dl className="grid grid-cols-3 gap-4">
        <div>
          <dt className="text-xs text-muted">Get the offer</dt>
          <dd className="mt-1 text-2xl font-semibold text-text" data-testid="treatment-count">
            {formatCount(treatmentIds.length)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Held back</dt>
          <dd className="mt-1 text-2xl font-semibold text-text" data-testid="holdout-count">
            {formatCount(holdoutIds.length)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Evaluated</dt>
          <dd className="mt-1 text-2xl font-semibold text-text">{formatCount(regularsChecked)}</dd>
          <dd className="text-xs text-muted">regulars, {formatCount(flagged.length)} flagged</dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-xs text-muted">Sample of recipients</p>
        <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="recipient-sample">
          {treatmentIds.slice(0, SAMPLE).map((id) => (
            <li key={id} className="rounded-md border border-border bg-bg/50 px-2 py-0.5 text-xs text-text tabular">
              {id}
            </li>
          ))}
          {treatmentIds.length > SAMPLE && <li className="px-1 py-0.5 text-xs text-muted">+{treatmentIds.length - SAMPLE} more</li>}
        </ul>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted">
        The {formatCount(holdoutIds.length)} held-back customers get nothing. Comparing them with those who got the offer shows how many came back
        because of it, not just how many came back.
      </p>

      {problems.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-danger" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <details className="group mt-4 border-t border-border pt-4">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-sm text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          Inspect both groups
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2" data-testid="audience-lists">
          <div>
            <p className="mb-1.5 text-xs font-medium text-text">Get the offer ({formatCount(treatmentIds.length)})</p>
            <IdList ids={treatmentIds} byId={byId} startDate={startDate} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-text">Held back ({formatCount(holdoutIds.length)})</p>
            <IdList ids={holdoutIds} byId={byId} startDate={startDate} />
          </div>
        </div>
      </details>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        Fictional demo records: pseudonymous IDs and visit history only. No names, phone numbers or real customers.
      </p>
    </Card>
  );
}
