import { ArrowRight, ChevronDown, FileText, FlaskConical, Info, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { formatMetric } from '../../agents/render';
import type { ActionProposal, RunResult, ToolResult } from '../../agents/types';
import { AGENT_NAME, SECTION_LABEL, SECTION_TONE, TOOL_LABEL } from './labels';

function EvidenceCard({ result, cited }: { result: ToolResult; cited: Set<string> }) {
  const metrics = [...result.metrics].sort((a, b) => Number(cited.has(`${result.callId}.${b.key}`)) - Number(cited.has(`${result.callId}.${a.key}`))).slice(0, 4);
  const period = result.metrics.find((m) => m.period)?.period;
  const baseline = result.metrics.find((m) => m.baseline)?.baseline;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border bg-bg/40 p-3.5" data-testid="evidence-card">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-text">{TOOL_LABEL[result.tool]}</h4>
          {period && (
            <p className="text-[11px] text-muted tabular">
              {period.label}
              {baseline ? ` vs ${baseline.label}` : ''}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted tabular">{result.callId}</span>
      </header>
      <dl className="mt-2 space-y-1">
        {metrics.map((m) => (
          <div key={m.key} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="min-w-0 truncate text-muted" title={m.label}>
              {m.label}
            </dt>
            <dd className="shrink-0 text-text tabular">
              {formatMetric(m)} <span className="text-[10px] text-muted uppercase">{m.evidence}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
        <details className="text-[11px] text-muted">
          <summary className="cursor-pointer list-none hover:text-text [&::-webkit-details-marker]:hidden">Provenance</summary>
          <p className="mt-1 break-words tabular">
            {result.provenance.tool}({JSON.stringify(result.provenance.args)}) · seed {result.provenance.datasetSeed} · as of day {result.provenance.asOfDay}
            {result.provenance.computedWith.length > 0 ? ` · ${result.provenance.computedWith.join(', ')}` : ''}
          </p>
        </details>
        {result.link && (
          <Link to={result.link.to} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-hover">
            {result.link.label}
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}

export interface ActionState {
  /** null when the draft can be created now. */
  blockedReason: string | null;
  onCreate: () => void;
}

function ActionCard({ proposal, action }: { proposal: ActionProposal; action: ActionState }) {
  const invalid = proposal.problems.length > 0;
  return (
    <section className="rounded-xl border border-accent/40 bg-accent-soft/40 p-4" data-testid="action-card">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase">
        <FileText className="size-3.5" aria-hidden="true" />
        Proposed action · needs your decision
      </p>
      <h4 className="mt-1 text-sm font-semibold text-text">{proposal.label}</h4>
      <p className="mt-1 text-xs text-muted tabular">
        {proposal.draft.treatmentIds.length} customers get the offer, {proposal.draft.holdoutIds.length} held back. Message: “{proposal.draft.message}”
      </p>
      {invalid && (
        <ul className="mt-2 space-y-0.5 text-xs text-warning" role="alert">
          {proposal.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={action.onCreate}
          disabled={action.blockedReason !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
        >
          Create draft in Campaign Studio
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
        <span className="text-[11px] text-muted">{action.blockedReason ?? 'Creates a draft only. You review and approve it in Campaign Studio; nothing is sent.'}</span>
      </div>
    </section>
  );
}

export function AnswerView({ result, action, onFollowUp, disabled }: { result: RunResult; action: ActionState | null; onFollowUp: (q: string) => void; disabled: boolean }) {
  const { answer } = result;
  const cited = new Set(answer.sections.flatMap((s) => s.findings.flatMap((f) => f.citations)));
  const outcomes = result.reports.flatMap((r) => r.toolCalls).filter((o): o is ToolResult => o.ok && [...cited].some((c) => c.startsWith(`${o.callId}.`)));
  const rejected = result.reports.reduce((n, r) => n + r.rejected.length, 0);

  return (
    <div className="space-y-4" data-testid="answer">
      <p className="text-[15px] leading-relaxed font-medium text-text" data-testid="answer-headline">
        {answer.headline}
      </p>
      {answer.premiseNote && (
        <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-text" data-testid="premise-note">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {answer.premiseNote}
        </p>
      )}
      {result.notices.some((n) => /cannot approve/.test(n)) && (
        <p className="flex gap-2 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text" data-testid="safety-note">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          DukaanPulse cannot approve, send or pay. You approve campaigns yourself in Campaign Studio, and this prototype never sends anything.
        </p>
      )}

      {answer.sections.map((s) => (
        <section key={s.type} aria-label={SECTION_LABEL[s.type]} data-testid={`section-${s.type}`}>
          <h3 className={`mb-1.5 inline-flex rounded-full border px-2 py-px text-[10px] font-semibold tracking-wider uppercase ${SECTION_TONE[s.type]}`}>{SECTION_LABEL[s.type]}</h3>
          <ul className="space-y-1.5">
            {s.findings.map((f) => (
              <li key={f.id} className="text-sm leading-relaxed text-text">
                {f.text} <span className="text-[11px] text-muted">· {AGENT_NAME[f.agent]}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {result.action && action && <ActionCard proposal={result.action} action={action} />}

      {outcomes.length > 0 && (
        <section aria-label="Evidence">
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Evidence ({outcomes.length} tool results)</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {outcomes.map((o) => (
              <EvidenceCard key={o.callId} result={o} cited={cited} />
            ))}
          </div>
        </section>
      )}

      <details className="group text-xs text-muted">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 hover:text-text [&::-webkit-details-marker]:hidden">
          Limitations and review
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4" data-testid="limitations">
          {answer.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="mt-2">
          Risk Reviewer: {result.review.decision === 'pass' ? 'passed' : 'flagged issues'}
          {rejected > 0 ? `; removed ${rejected} unsupported ${rejected === 1 ? 'claim' : 'claims'} before showing this answer` : ''}.
        </p>
      </details>

      <p className="flex items-start gap-1.5 text-[11px] text-muted" data-testid="disclosure">
        <FlaskConical className="mt-px size-3 shrink-0 text-simulated" aria-hidden="true" />
        {answer.disclosure}
      </p>

      {answer.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggested follow-up questions">
          {answer.followUps.map((q) => (
            <button
              key={q}
              type="button"
              disabled={disabled}
              onClick={() => onFollowUp(q)}
              className="rounded-full border border-border-strong px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/60 hover:text-text disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
