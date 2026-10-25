import { ArrowLeft, FileText } from 'lucide-react';
import { Link } from 'react-router';
import { ComingNext } from '../components/ComingNext';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { draftUplift } from '../domain/campaign';
import { formatCount, formatPercent } from '../domain/format';
import { describeOffer, getIntervention } from '../domain/interventions';
import { useWorkspace } from '../state/WorkspaceContext';

export function CampaignStudio() {
  const { scenario } = useWorkspace();
  const draft = scenario.draft;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Campaign Studio"
        description="Shape an offer, see what it costs, and approve it. Nothing runs without your approval."
        actions={<StatusChip status={scenario.status} />}
      />

      {draft && scenario.status !== 'rejected' ? (
        <section className="rounded-2xl border border-border bg-surface p-6" data-testid="draft-summary">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
            <FileText className="size-3.5" aria-hidden="true" />
            Draft from Opportunities
          </p>
          <h2 className="mt-2 text-xl font-semibold text-text" data-testid="draft-offer">
            {getIntervention(draft.interventionId).label}: {describeOffer(draft.offer)}
          </h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Get the offer</dt>
              <dd className="mt-1 font-semibold text-text tabular">{formatCount(draft.treatmentIds.length)} customers</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Held back</dt>
              <dd className="mt-1 font-semibold text-text tabular">{formatCount(draft.holdoutIds.length)} customers</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Assumed extra return rate</dt>
              <dd className="mt-1 font-semibold text-text tabular" data-testid="draft-uplift">
                {formatPercent(draftUplift(draft), { decimals: 0 })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Gross margin</dt>
              <dd className="mt-1 font-semibold text-text tabular" data-testid="draft-margin">
                {formatPercent(draft.assumptions.grossMarginRate, { decimals: 0 })}
              </dd>
            </div>
          </dl>
          <Link to="/opportunities" className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the comparison
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-surface p-6" data-testid="no-draft">
          <h2 className="font-semibold text-text">No campaign drafted yet</h2>
          <p className="mt-1 text-sm text-muted">
            {scenario.status === 'rejected'
              ? 'The opportunity was dismissed, so there is nothing to plan.'
              : 'Start from an opportunity: compare options there, then draft a campaign.'}
          </p>
          <Link to="/opportunities" className="mt-4 inline-flex text-sm font-medium text-accent hover:text-accent-hover">
            Go to Opportunities
          </Link>
        </section>
      )}

      <ComingNext
        title="Plan an offer you control"
        points={[
          'Message preview, clearly marked as never sent',
          'Edit the offer and audience before approving',
          'Cost, expected margin and break-even before you approve',
          'Explicit approval before any simulated run',
        ]}
      />
    </div>
  );
}
