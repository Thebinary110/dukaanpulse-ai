import { ArrowRight, CircleHelp, Lightbulb, Target } from 'lucide-react';
import { Link } from 'react-router';
import type { RecommendationCard as Card } from '../../agents/types';

const KIND_TAG: Record<string, string> = {
  estimated: 'border-border-strong text-muted',
  assumed: 'border-warning/40 text-warning',
  simulated: 'border-simulated/40 text-simulated',
};

function Tag({ kind }: { kind: string }) {
  return <span className={`ml-1.5 inline-flex rounded-full border px-1.5 text-[9px] font-semibold tracking-wider uppercase ${KIND_TAG[kind] ?? KIND_TAG.estimated}`}>{kind}</span>;
}

function NextStep({ card, onAsk, disabled }: { card: Card; onAsk: (q: string) => void; disabled: boolean }) {
  const step = card.nextStep;
  if (!step) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      {step.ask && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAsk(step.ask!)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {step.label}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      )}
      {step.to && (
        <Link to={step.to} className={`inline-flex items-center gap-1 text-xs font-medium ${step.ask ? 'text-muted hover:text-text' : 'text-accent hover:text-accent-hover'}`}>
          {step.ask ? 'Open the page' : step.label}
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      )}
      <span className="text-[11px] text-muted">Nothing is created, approved or sent from here.</span>
    </div>
  );
}

/** The merchant-facing decision summary. Every figure comes from a tool result. */
export function RecommendationCard({ card, onAsk, disabled }: { card: Card; onAsk: (q: string) => void; disabled: boolean }) {
  if (card.status === 'insufficient') {
    return (
      <section className="space-y-3 rounded-xl border border-border-strong bg-bg/40 p-4" aria-label="Not enough evidence to recommend" data-testid="recommendation-card" data-status="insufficient">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
          <CircleHelp className="size-3.5" aria-hidden="true" />
          No recommendation yet: not enough evidence
        </p>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            ['What we know', card.known],
            ['What is uncertain', card.uncertain],
            ['What would help', card.wouldHelp],
          ].map(([title, items]) =>
            (items as string[]).length > 0 ? (
              <div key={title as string}>
                <h4 className="text-xs font-semibold text-text">{title as string}</h4>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
                  {(items as string[]).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
        <NextStep card={card} onAsk={onAsk} disabled={disabled} />
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-accent/50 bg-accent-soft/30 p-4" aria-label="Recommendation" data-testid="recommendation-card" data-status="recommend">
      <div>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase">
          <Lightbulb className="size-3.5" aria-hidden="true" />
          Recommended next step
        </p>
        <h3 className="mt-1 text-base font-semibold text-text" data-testid="recommendation-action">
          {card.action}
        </h3>
        {card.target && (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted" data-testid="recommendation-target">
            <Target className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            For {card.target}
          </p>
        )}
      </div>

      {card.evidence.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text">
            Why <span className="ml-1 inline-flex rounded-full border border-accent/40 px-1.5 text-[9px] font-semibold tracking-wider text-accent uppercase">observed</span>
          </h4>
          <ul className="mt-1 space-y-1 text-sm leading-relaxed text-text">
            {card.evidence.map((e) => (
              <li key={e.text}>{e.text}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {card.economics.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text">Cost and trade-off</h4>
            <dl className="mt-1 space-y-1 text-xs" data-testid="recommendation-economics">
              {card.economics.map((e) => (
                <div key={e.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{e.label}</dt>
                  <dd className="shrink-0 text-right text-text tabular">
                    {e.value}
                    <Tag kind={e.kind} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {card.assumptions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text">Assumptions you can change</h4>
            <dl className="mt-1 space-y-1 text-xs" data-testid="recommendation-assumptions">
              {card.assumptions.map((a) => (
                <div key={a.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{a.label}</dt>
                  <dd className="shrink-0 text-text tabular">
                    {a.value}
                    <Tag kind="assumed" />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {card.alternatives.length > 0 && (
        <div className="overflow-x-auto">
          <h4 className="text-xs font-semibold text-text">Alternatives</h4>
          <table className="mt-1 w-full min-w-[320px] text-xs" data-testid="recommendation-alternatives">
            <caption className="sr-only">Other options and their expected net extra profit</caption>
            <tbody className="divide-y divide-border">
              {card.alternatives.map((a) => (
                <tr key={a.option}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-text">
                    {a.option}
                  </th>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-text tabular">{a.net}</td>
                  <td className="py-1.5 text-muted">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(card.uncertain.length > 0 || card.limitations.length > 0) && (
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted" aria-label="Limitations">
          {[...card.uncertain, ...card.limitations].map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      <NextStep card={card} onAsk={onAsk} disabled={disabled} />
    </section>
  );
}
