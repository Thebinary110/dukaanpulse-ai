import { ArrowLeft, ArrowRight, ChevronDown, CircleSlash, FileText, Lightbulb } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { DismissDialog } from '../components/opportunity/DismissDialog';
import { EvidenceChart } from '../components/opportunity/EvidenceChart';
import { EvidenceTable } from '../components/opportunity/EvidenceTable';
import { AssumptionsPanel } from '../components/opportunity/AssumptionsPanel';
import { OptionsComparison } from '../components/opportunity/OptionsComparison';
import { StatusChip } from '../components/StatusChip';
import { getDemoData, opportunityShortLabel } from '../data/demoData';
import { averageBasketOf, basketByCustomer, createCampaignDraft, planAudience } from '../domain/campaign';
import { evaluateOptions, recommend, type Objective, type OptionSettings } from '../domain/decision';
import { flaggingGapDays } from '../domain/detectors/evidence';
import { MIN_HISTORY_SPAN_DAYS, scoreRegulars } from '../domain/detectors/lapsedRegulars';
import type { LapsedOpportunitySummary } from '../domain/detectors/lapsedSummary';
import { formatCount, formatDays, formatINR, formatPercent } from '../domain/format';
import type { CampaignAssumptions, CampaignDraft } from '../domain/types';
import { useWorkspace } from '../state/WorkspaceContext';
import type { ScenarioStatus } from '../state/scenario';

const LOCKED: readonly ScenarioStatus[] = ['awaiting_approval', 'approved', 'executing', 'measured'];

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-xl font-semibold tracking-tight text-text">
        {title}
      </h2>
      {children && <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

function Fact({ label, value, note, testId }: { label: string; value: string; note: string; testId?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-[26px] leading-8 font-semibold tracking-tight text-text" data-testid={testId}>
        {value}
      </dd>
      <dd className="mt-0.5 text-xs text-muted">{note}</dd>
    </div>
  );
}

function NoOpportunity({ regularsTested }: { regularsTested: number }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] font-semibold tracking-tight text-text">Opportunities</h1>
      <section className="rounded-2xl border border-border bg-surface p-8" data-testid="no-opportunity">
        <h2 className="text-lg font-semibold text-text">Nothing to investigate right now</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          DukaanPulse checked {formatCount(regularsTested)} regular customers and found none with an unusually long absence.
        </p>
      </section>
    </div>
  );
}

export function Opportunities() {
  const { dataset, opportunity, asOfLabel } = getDemoData();
  const { scenario, explorer, dispatch, updateExplorer, resetExplorer, beginReview } = useWorkspace();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => beginReview(), [beginReview]);

  if (opportunity.status !== 'found') return <NoOpportunity regularsTested={opportunity.regularsTested} />;
  return (
    <Explorer
      summary={opportunity}
      asOfLabel={asOfLabel}
      feedback={feedback}
      setFeedback={setFeedback}
      status={scenario.status}
      rejectionReason={scenario.rejection?.reason ?? null}
      draftOffer={scenario.draft?.interventionId ?? null}
      currentDraft={scenario.draft}
      explorer={explorer}
      onSettings={(settings) => updateExplorer({ settings })}
      onObjective={(objective: Objective) => updateExplorer({ objective })}
      onSelect={(selectedId) => updateExplorer({ selectedId })}
      onResetAssumptions={resetExplorer}
      dispatch={dispatch}
      navigate={navigate}
      startDate={dataset.startDate}
      transactionsKey={dataset}
    />
  );
}

type WorkspaceApi = ReturnType<typeof useWorkspace>;

interface ExplorerProps {
  summary: LapsedOpportunitySummary;
  asOfLabel: string;
  feedback: string | null;
  setFeedback: (m: string | null) => void;
  status: ScenarioStatus;
  rejectionReason: string | null;
  draftOffer: string | null;
  currentDraft: CampaignDraft | null;
  explorer: WorkspaceApi['explorer'];
  onSettings: (s: WorkspaceApi['explorer']['settings']) => void;
  onObjective: (o: Objective) => void;
  onSelect: (id: string) => void;
  onResetAssumptions: () => void;
  dispatch: WorkspaceApi['dispatch'];
  navigate: ReturnType<typeof useNavigate>;
  startDate: string;
  transactionsKey: ReturnType<typeof getDemoData>['dataset'];
}

function Explorer(props: ExplorerProps) {
  const { summary, explorer, status, dispatch, setFeedback } = props;
  const dataset = props.transactionsKey;
  const opp = summary.opportunity;
  const locked = LOCKED.includes(status);
  const rejected = status === 'rejected';

  const scored = useMemo(() => scoreRegulars(dataset.transactions, dataset.asOfDay, opp.method), [dataset, opp.method]);
  const audience = useMemo(() => planAudience(opp.cohort.map((c) => c.customerId), dataset.seed), [opp.cohort, dataset.seed]);
  const averageBasketPaise = useMemo(() => averageBasketOf(basketByCustomer(opp.cohort), audience.treatmentIds), [opp.cohort, audience]);

  const evaluations = useMemo(
    () => evaluateOptions({ customers: audience.treatmentIds.length, averageBasketPaise, settings: explorer.settings }),
    [audience, averageBasketPaise, explorer.settings],
  );
  const recommendation = useMemo(() => recommend(evaluations, explorer.objective), [evaluations, explorer.objective]);
  const selectedId = explorer.selectedId ?? recommendation.recommendedId;
  const selected = evaluations.find((e) => e.intervention.id === selectedId)!;
  const recommended = evaluations.find((e) => e.intervention.id === recommendation.recommendedId)!;
  const canDraft = !locked && !rejected && selected.offer.kind !== 'none' && selected.problems.length === 0;

  const setAssumptions = (patch: Partial<CampaignAssumptions>) =>
    props.onSettings({ ...explorer.settings, assumptions: { ...explorer.settings.assumptions, ...patch } });
  const setOption = (id: string, patch: Partial<OptionSettings>) =>
    props.onSettings({ ...explorer.settings, options: { ...explorer.settings.options, [id]: { ...explorer.settings.options[id]!, ...patch } } });

  const draftCampaign = () => {
    const draft = createCampaignDraft({
      opportunityId: opp.id,
      interventionId: selected.intervention.id,
      offer: selected.offer,
      uplift: selected.uplift,
      assumptions: explorer.settings.assumptions,
      audience,
      merchantName: dataset.merchant.name,
      name: `Win back ${opportunityShortLabel().toLowerCase()}`,
      previous: status === 'drafting' ? props.currentDraft : null,
    });
    const result = dispatch(status === 'drafting' ? { type: 'UPDATE_DRAFT', draft } : { type: 'START_DRAFT', draft });
    if (result.ok) props.navigate('/campaigns');
    else setFeedback(result.error);
  };

  const dismiss = (reason: string) => {
    const result = dispatch({ type: 'REJECT', at: new Date().toISOString(), reason });
    setFeedback(result.ok ? 'Opportunity dismissed. No campaign will be drafted.' : result.error);
  };

  const reopen = () => {
    dispatch({ type: 'RESET' });
    const result = dispatch({ type: 'REVIEW' });
    setFeedback(result.ok ? 'Review reopened.' : result.error);
  };

  const flagAtTypical = flaggingGapDays(summary.medianTypicalGapDays, opp.method);
  const daypartShare = summary.dominantDaypart ? summary.daypartShares[summary.dominantDaypart] : null;

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <Link to="/" className="inline-flex w-fit items-center gap-1.5 rounded text-sm text-muted transition-colors hover:text-text">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Overview
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={status} />
          <span className="text-xs text-muted">Detected from synthetic payments up to {props.asOfLabel}</span>
        </div>
        <div className="max-w-3xl">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-balance text-text sm:text-[32px]">{summary.headline}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Are regulars who used to come almost every {summary.dominantDaypart ?? 'day'} drifting away, and is it worth trying to win
            them back? Review the evidence, compare responses, then decide.
          </p>
        </div>
        <p role="status" aria-live="polite" className={feedback(props.feedback)} data-testid="explorer-feedback">
          {props.feedback}
        </p>
      </header>

      {rejected && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border-strong bg-surface p-6 sm:flex-row sm:items-center sm:justify-between" data-testid="rejected-banner">
          <div className="flex gap-3">
            <CircleSlash className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-text">You dismissed this opportunity</h2>
              <p className="mt-1 text-sm text-muted">
                Reason: {props.rejectionReason}. No campaign will be drafted or simulated. The evidence stays available below.
              </p>
            </div>
          </div>
          <button type="button" onClick={reopen} className="shrink-0 rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-sm font-semibold text-text hover:bg-surface-hover">
            Reopen review
          </button>
        </section>
      )}

      {/* A. Summary */}
      <section aria-labelledby="summary-title" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 id="summary-title" className="text-xs font-semibold tracking-wider text-accent uppercase">
            Observed in payments
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Fact label="Customers flagged" value={formatCount(summary.customers)} note={`of ${formatCount(opp.regularsTested)} regulars checked`} testId="fact-flagged" />
            <Fact label="Absent for" value={formatDays(summary.medianCurrentGapDays)} note={`median; at least ${formatDays(summary.shortestCurrentGapDays)}`} testId="fact-gap" />
            <Fact label="Usually every" value={formatDays(summary.medianTypicalGapDays)} note="median, from their own history" testId="fact-usual" />
            <Fact
              label={summary.dominantDaypart ? `${summary.dominantDaypart[0]!.toUpperCase()}${summary.dominantDaypart.slice(1)} visits` : 'Usual time'}
              value={daypartShare === null ? '—' : formatPercent(daypartShare, { decimals: 0 })}
              note="of their past visits"
            />
          </dl>
        </div>
        <div className="rounded-2xl border border-dashed border-border-strong bg-bg/40 p-6" data-testid="exposure">
          <h2 className="text-xs font-semibold tracking-wider text-warning uppercase">Estimated exposure</h2>
          <p className="mt-3 text-[26px] leading-8 font-semibold tracking-tight text-text" data-testid="exposure-value">
            {formatINR(summary.pastMonthlySpendPaise)}
            <span className="text-base font-medium text-muted"> / month</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            What these customers used to spend at their usual pace. It is at risk only if they have really stopped coming, so it is not lost revenue.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            About <span className="text-text tabular">{opp.expectedFalseAlarms.toFixed(1)}</span> of the {formatCount(summary.customers)} would be flagged by chance even if
            nothing had changed. Some may simply be on a break.
          </p>
        </div>
      </section>

      {/* B. Evidence */}
      <section aria-labelledby="evidence-title" className="flex flex-col gap-5">
        <SectionHeading id="evidence-title" eyebrow="Evidence" title="Why these customers were flagged">
          Each customer is compared only with their own habit, not with everyone else.
        </SectionHeading>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <EvidenceChart rows={scored} config={opp.method} />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-text">How to read it</h3>
            <ol className="space-y-3 text-sm leading-relaxed text-muted">
              <li className="flex gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-border-strong text-[11px] tabular">1</span>
                Learn how often each regular usually pays, from their own visits.
              </li>
              <li className="flex gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-border-strong text-[11px] tabular">2</span>
                Measure how long it has been since their last payment.
              </li>
              <li className="flex gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-border-strong text-[11px] tabular">3</span>
                Flag them when an absence that long would happen less than {formatPercent(opp.method.probabilityThreshold, { decimals: 0 })} of the time
                if their habit had not changed. That is the dashed line.
              </li>
            </ol>
            <p className="rounded-lg bg-bg/50 px-3 py-2.5 text-xs leading-relaxed text-muted">
              Example: someone who usually comes every {formatDays(summary.medianTypicalGapDays)} is flagged after {formatDays(flagAtTypical)} away. A weekly
              customer needs a much longer absence. A flag is a signal to look closer, not proof that they have left.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="mb-3 text-sm font-semibold text-text">Customer evidence</h3>
          <EvidenceTable rows={scored} config={opp.method} startDate={props.startDate} />
          <details className="group mt-4 border-t border-border pt-4">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-sm text-muted hover:text-text [&::-webkit-details-marker]:hidden">
              <FileText className="size-4" aria-hidden="true" />
              Method, settings and limitations
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-4 grid gap-6 text-sm text-muted md:grid-cols-2" data-testid="methodology">
              <div>
                <h4 className="mb-2 text-xs font-semibold tracking-wider text-text uppercase">Settings used</h4>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs tabular">
                  <dt>Regular customer</dt>
                  <dd className="text-text">≥ {opp.method.minWeeklyRate} visit / week</dd>
                  <dt>History needed</dt>
                  <dd className="text-text">≥ {opp.method.minVisitDays} visit-days over ≥ {MIN_HISTORY_SPAN_DAYS} days</dd>
                  <dt>Minimum absence</dt>
                  <dd className="text-text">{opp.method.minGapDays} days</dd>
                  <dt>Flag threshold</dt>
                  <dd className="text-text">P(absence | usual habit) &lt; {opp.method.probabilityThreshold}</dd>
                  <dt>Usual rate</dt>
                  <dd className="text-text">(visit-days − 1) ÷ days from first to last visit</dd>
                  <dt>Regulars checked</dt>
                  <dd className="text-text">{formatCount(opp.regularsTested)}</dd>
                  <dt>Expected chance flags</dt>
                  <dd className="text-text">{opp.expectedFalseAlarms.toFixed(1)}</dd>
                </dl>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold tracking-wider text-text uppercase">Limitations</h4>
                <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed">
                  <li>Detects absence only. A regular who drops from daily to weekly visits is not flagged.</li>
                  <li>One stray visit resets the absence, so some drifting customers are missed.</li>
                  <li>Newer customers with less history are not checked.</li>
                  <li>The chance figure assumes visits are independent day to day. Real habits (holidays, illness) are lumpier.</li>
                  <li>Tested on synthetic data with known lapses, it found 75–85% of them, plus a few false alarms.</li>
                </ul>
              </div>
            </div>
          </details>
        </div>
      </section>

      {/* C + D. Options and assumptions */}
      <section aria-labelledby="options-title" className="flex flex-col gap-5">
        <SectionHeading id="options-title" eyebrow="Decision" title="Compare ways to respond">
          These offers are hypotheses to test, not proven preferences. Every figure is an estimate from the assumptions shown and your customers'
          observed spending, compared against customers who would return anyway.
        </SectionHeading>
        {locked && (
          <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted" data-testid="locked-note">
            A campaign for this opportunity is already past drafting ({status.replace('_', ' ')}). Changes here will not affect it.
          </p>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <AssumptionsPanel
            assumptions={explorer.settings.assumptions}
            onChange={setAssumptions}
            onReset={props.onResetAssumptions}
            averageBasketPaise={averageBasketPaise}
            treatment={audience.treatmentIds.length}
            holdout={audience.holdoutIds.length}
            disabled={locked}
          />
          <OptionsComparison
            evaluations={evaluations}
            recommendation={recommendation}
            selectedId={selectedId}
            onSelect={props.onSelect}
            settings={explorer.settings.options}
            onChange={setOption}
            customers={audience.treatmentIds.length}
            baselineReturnRate={explorer.settings.assumptions.baselineReturnRate}
            disabled={locked}
          />
        </div>
      </section>

      {/* E. Recommendation */}
      <section aria-labelledby="recommendation-title" className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface" data-testid="recommendation">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true" />
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
                <Lightbulb className="size-3.5" aria-hidden="true" />
                Recommendation
              </p>
              <fieldset className="inline-flex rounded-lg border border-border bg-bg/40 p-0.5">
                <legend className="sr-only">Goal</legend>
                {(
                  [
                    ['profit', 'Most profit'],
                    ['customers', 'Most customers back'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap text-muted transition-colors hover:text-text has-checked:bg-surface-raised has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-focus"
                  >
                    <input type="radio" name="objective" value={value} checked={explorer.objective === value} onChange={() => props.onObjective(value)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </fieldset>
            </div>
            <h2 id="recommendation-title" className="mt-3 text-2xl font-semibold tracking-tight text-text" data-testid="recommended-title">
              {recommendation.reliability === 'none_profitable'
                ? 'Hold off: no offer is expected to pay back'
                : `${recommended.intervention.label}: ${recommended.offerLabel}`}
            </h2>
            {recommendation.reliability === 'close' && (
              <p className="mt-2 inline-flex rounded-full border border-warning/40 bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-text">Close call</p>
            )}
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted" data-testid="recommendation-reasons">
              {recommendation.reasons.map((r) => (
                <li key={r} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col justify-between gap-5 rounded-xl border border-border bg-bg/40 p-5">
            <div>
              <p className="text-xs text-muted">Your choice</p>
              <p className="mt-1 text-base font-semibold text-text" data-testid="selected-option">
                {selected.intervention.label}
                {selected.offer.kind !== 'none' && <span className="font-normal text-muted"> · {selected.offerLabel}</span>}
              </p>
              {selectedId !== recommendation.recommendedId && (
                <p className="mt-1 text-xs text-warning">You picked a different option from the recommendation.</p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Drafting creates a plan for {formatCount(audience.treatmentIds.length)} customers, with {formatCount(audience.holdoutIds.length)} held back for
                comparison. Nothing is sent, and the campaign still needs your approval in Campaign Studio. In this prototype every result is simulated.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
              {rejected ? (
                <button type="button" onClick={reopen} className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">
                  Reopen review
                </button>
              ) : (
                <button
                  type="button"
                  onClick={draftCampaign}
                  disabled={!canDraft}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
                >
                  {status === 'drafting' ? 'Update draft' : 'Draft campaign'}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              )}
              {!rejected && <DismissDialog onConfirm={dismiss} disabled={locked} />}
            </div>
            {!canDraft && !rejected && !locked && (
              <p className="text-xs text-muted">
                {selected.offer.kind === 'none' ? '"Do nothing" needs no campaign. Dismiss the opportunity or pick an offer.' : 'Fix the highlighted settings to draft.'}
              </p>
            )}
            {status === 'drafting' && props.draftOffer && (
              <Link to="/campaigns" className="text-xs text-accent hover:text-accent-hover">
                A draft is already in Campaign Studio. Open it
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function feedback(message: string | null): string {
  return message ? 'w-fit rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text' : 'sr-only';
}
