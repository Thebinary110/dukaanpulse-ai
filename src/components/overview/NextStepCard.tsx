import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import type { OpportunityOverview } from '../../domain/detectors/lapsedSummary';
import { formatCount } from '../../domain/format';

const STEPS = ['Review the evidence', 'Compare offers, including doing nothing', 'Approve, edit or decline', 'See a simulated result'];

export function NextStepCard({ overview }: { overview: OpportunityOverview }) {
  if (overview.status === 'none') {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6" data-testid="next-step">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Recommended next step</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">No action needed today. Your trends and customer mix are below.</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-surface p-6" data-testid="next-step">
      <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Recommended next step</h2>
      <p className="mt-3 text-lg leading-snug font-semibold text-text">
        Review the {formatCount(overview.customers)} customers and choose how to win them back
      </p>
      <ol className="mt-5 space-y-3 text-sm">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-3">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular ${
                i === 0 ? 'bg-accent text-on-accent' : 'border border-border-strong text-muted'
              }`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className={i === 0 ? 'font-medium text-text' : 'text-muted'}>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 flex gap-2 rounded-lg bg-bg/50 px-3 py-2.5 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-px size-4 shrink-0 text-success" aria-hidden="true" />
        Nothing is sent without your approval, and in this prototype nothing is ever sent: results are simulated.
      </p>
      <Link
        to="/opportunities"
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/60 hover:bg-surface-hover"
      >
        <Check className="size-4 text-accent" aria-hidden="true" />
        Start the review
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
