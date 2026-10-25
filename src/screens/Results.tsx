import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { ComingNext } from '../components/ComingNext';
import { PageHeader } from '../components/PageHeader';
import { SimulatedOutcomeSummary } from '../components/SimulatedOutcomeSummary';
import { useWorkspace } from '../state/WorkspaceContext';

export function Results() {
  const { scenario } = useWorkspace();
  const measured = scenario.status === 'measured' && scenario.outcome;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Results" description="What a simulated campaign achieved compared with customers who received nothing." />
      {measured ? (
        <section className="rounded-2xl border border-border bg-surface p-6" data-testid="results-outcome">
          <h2 className="text-base font-semibold text-text">{scenario.draft?.name}</h2>
          <div className="mt-3">
            <SimulatedOutcomeSummary outcome={scenario.outcome!} />
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-surface p-6" data-testid="results-empty">
          <h2 className="font-semibold text-text">No simulated results yet</h2>
          <p className="mt-1 text-sm text-muted">Approve a campaign in Campaign Studio and run its simulation to see results here.</p>
          <Link to="/campaigns" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover">
            Go to Campaign Studio
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      )}
      <ComingNext
        title="Deeper analysis of the simulated result"
        points={[
          'Day-by-day returns for both groups',
          'Likely range of profit across many simulated runs',
          'Revenue, offer cost and net profit, side by side',
          'A recommended next step based on the result',
        ]}
      />
    </div>
  );
}
