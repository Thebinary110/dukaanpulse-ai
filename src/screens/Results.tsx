import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, ChevronDown, FlaskConical, History, Lightbulb, TriangleAlert } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { GroupRates } from '../components/results/GroupRates';
import { ProfitDistribution } from '../components/results/ProfitDistribution';
import { Tag } from '../components/results/Tag';
import { formatCount, formatINR, formatPercent } from '../domain/format';
import {
  compareEstimateToOutcome,
  divergenceReasons,
  POWER_TARGET,
  PROFIT_RUNS,
  recommendNextStep,
  resultMetrics,
  REVISE_BELOW_PROFITABLE_SHARE,
  SMALL_GROUP,
  type ComparisonRow,
  type LearningRecord,
  type NextStep,
} from '../domain/results';
import type { ScenarioStatus } from '../state/scenario';
import { useWorkspace } from '../state/WorkspaceContext';

const ACTIVE: readonly ScenarioStatus[] = ['drafting', 'awaiting_approval', 'approved', 'executing'];

const DECISION_TONE: Record<NextStep, string> = {
  repeat_larger: 'border-accent/50',
  revise_offer: 'border-warning/50',
  stop: 'border-danger/50',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} IST`;
}

const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-IN');

function formatValue(row: ComparisonRow, v: number, signed = false): string {
  if (row.unit === 'paise') return formatINR(v, { signed });
  const text = `${signed && v > 0 ? '+' : ''}${one(v)}`;
  return text.replace('-', '−');
}

function Section({ id, title, kind, children, aside, testId }: { id: string; title: string; kind?: ReactNode; children: ReactNode; aside?: ReactNode; testId?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-surface p-5 sm:p-6" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={id} className="text-base font-semibold text-text">
            {title}
          </h2>
          {kind}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, sub, kind, testId }: { label: string; value: string; sub: string; kind: 'simulated' | 'estimate'; testId: string }) {
  return (
    <div className="min-w-0 bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{label}</p>
        <Tag kind={kind} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text" data-testid={testId}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted tabular [overflow-wrap:normal]">{sub}</p>
    </div>
  );
}

function EmptyResults({ status }: { status: ScenarioStatus }) {
  const inFlight = ACTIVE.includes(status);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight text-text">Results & learning</h1>
        <p className="mt-1.5 text-[15px] text-muted">How a simulated campaign compared with its estimate, and what to do next.</p>
      </header>
      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8" data-testid="results-empty">
        <h2 className="text-lg font-semibold text-text">No completed simulated runs yet</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {inFlight
            ? 'A campaign is in progress. Approve it and run its simulation in Campaign Studio to see results here.'
            : 'Start from an opportunity, draft and approve a campaign, then run its simulation. Results appear here.'}
        </p>
        <Link
          to={inFlight ? '/campaigns' : '/opportunities'}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          {inFlight ? 'Go to Campaign Studio' : 'Go to Opportunities'}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}

function ClearHistoryDialog({ onConfirm, count }: { onConfirm: () => void; count: number }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-hover hover:text-text">
          Clear history
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-strong bg-surface p-6 shadow-2xl">
          <Dialog.Title className="text-lg font-semibold text-text">Clear learning history?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            Removes {formatCount(count)} saved simulated {count === 1 ? 'run' : 'runs'} from this browser session. The current campaign is not affected.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text">Cancel</Dialog.Close>
            <Dialog.Close
              onClick={onConfirm}
              className="rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-sm font-semibold text-text hover:bg-surface-hover"
            >
              Clear history
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Results() {
  const { history, scenario, dispatch, clearHistory } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const record = history.find((r) => r.id === params.get('run')) ?? history[0];

  if (!record) return <EmptyResults status={scenario.status} />;
  const isCurrent = scenario.status === 'measured' && scenario.approval?.at === record.approvedAt;
  const canStartAgain = !ACTIVE.includes(scenario.status);

  const startNextReview = () => {
    // Keeps the comparison's assumptions; only the campaign workflow starts over.
    dispatch({ type: 'RESET' });
    dispatch({ type: 'REVIEW' });
    navigate('/opportunities');
  };

  return (
    <ResultsView
      record={record}
      history={history}
      isCurrent={isCurrent}
      canStartAgain={canStartAgain}
      onStartNextReview={startNextReview}
      onSelect={(id) => setParams(id === history[0]?.id ? {} : { run: id }, { replace: true })}
      onClearHistory={() => {
        clearHistory();
        setParams({}, { replace: true });
      }}
    />
  );
}

function ResultsView({
  record,
  history,
  isCurrent,
  canStartAgain,
  onStartNextReview,
  onSelect,
  onClearHistory,
}: {
  record: LearningRecord;
  history: LearningRecord[];
  isCurrent: boolean;
  canStartAgain: boolean;
  onStartNextReview: () => void;
  onSelect: (id: string) => void;
  onClearHistory: () => void;
}) {
  const m = useMemo(() => resultMetrics(record), [record]);
  const rows = useMemo(() => compareEstimateToOutcome(record), [record]);
  const reasons = useMemo(() => divergenceReasons(record), [record]);
  const next = useMemo(() => recommendNextStep(record), [record]);
  const a = record.assumptions;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        {isCurrent && (
          <Link to="/campaigns" className="inline-flex w-fit items-center gap-1.5 rounded text-sm text-muted transition-colors hover:text-text">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Campaign Studio
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-simulated/40 bg-simulated-soft px-2.5 py-0.5 text-xs font-medium text-text">
            <FlaskConical className="size-3.5 text-simulated" aria-hidden="true" />
            Simulated result, not a real campaign
          </span>
          <span className="text-xs text-muted" data-testid="run-context">
            {isCurrent ? 'Current run' : 'Earlier run from this session'} · completed {formatTime(record.completedAt)}
          </span>
        </div>
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight break-words text-text sm:text-[32px]">Results & learning</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted" data-testid="results-subtitle">
            {record.campaignName}: {record.interventionLabel.toLowerCase()} ({record.offerLabel}) for {formatCount(record.treatmentSize)} customers, measured against{' '}
            {formatCount(record.holdoutSize)} held back.
          </p>
        </div>
      </header>

      {m.smallSample && (
        <p className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm leading-relaxed text-text" data-testid="small-sample-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Small sample.</strong> Only {formatCount(m.holdout.denominator)} customers were held back and{' '}
            {formatCount(m.treatment.denominator)} got the offer. Each held-back customer moves that group's rate by {Math.round(m.holdoutRateStep * 100)} percentage
            points, so this comparison is noisy. It is not statistically significant evidence and does not prove the offer caused anything.
          </span>
        </p>
      )}

      {/* Decision */}
      <section aria-labelledby="decision-title" className={`relative overflow-hidden rounded-2xl border bg-surface ${DECISION_TONE[next.decision]}`} data-testid="decision">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
              <Lightbulb className="size-3.5" aria-hidden="true" />
              Recommended next step · rule-based
            </p>
            <h2 id="decision-title" className="mt-2 text-2xl font-semibold tracking-tight text-text" data-testid="decision-title">
              {next.title}
            </h2>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted" data-testid="decision-reasons">
              {next.reasons.map((r) => (
                <li key={r} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
            <details className="group mt-4">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-sm text-muted hover:text-text [&::-webkit-details-marker]:hidden">
                How this recommendation is made
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted" data-testid="decision-rules">
                <li className={next.rule === 1 ? 'text-text' : undefined}>
                  <strong>Stop</strong> if the median of {formatCount(PROFIT_RUNS)} simulated runs of this configuration loses money.
                </li>
                <li className={next.rule === 2 ? 'text-text' : undefined}>
                  <strong>Revise the offer</strong> if the estimate loses money when the offer works half as well, or fewer than{' '}
                  {formatPercent(REVISE_BELOW_PROFITABLE_SHARE, { decimals: 0 })} of runs are profitable.
                </li>
                <li className={next.rule === 3 ? 'text-text' : undefined}>
                  Otherwise <strong>repeat with a larger test</strong>, sized for {formatPercent(POWER_TARGET, { decimals: 0 })} power at a 5% significance level.
                </li>
              </ol>
              <p className="mt-2 text-xs text-muted">These are fixed rules applied to the numbers on this page, not a trained model. The single simulated run never decides on its own.</p>
            </details>
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-bg/40 p-5">
            <div className="text-sm leading-relaxed text-muted">
              {next.decision === 'stop' ? (
                <p>No further spend is suggested on this offer. The evidence and the run stay in your learning history.</p>
              ) : (
                <p>
                  The next step goes back to the comparison with your assumptions kept, so you can adjust the offer and plan the next run. In this demo the
                  flagged group is fixed at {formatCount(record.treatmentSize + record.holdoutSize)} customers. A real follow-up would include more lapsed
                  customers or run longer to reach about {formatCount(m.requiredPerGroup)} per group.
                </p>
              )}
            </div>
            {canStartAgain ? (
              next.decision === 'stop' ? (
                <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-hover">
                  Back to Overview
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onStartNextReview}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
                >
                  {next.decision === 'revise_offer' ? 'Revise the offer' : 'Plan the next test'}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              )
            ) : (
              <Link to="/campaigns" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-hover">
                Continue the campaign in progress
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Headline numbers */}
      <section aria-label="Headline numbers" className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-5" data-testid="results-kpis">
        <Stat
          label="Came back, offer group"
          value={`${formatCount(m.treatment.count)} of ${formatCount(m.treatment.denominator)}`}
          sub={`${formatPercent(m.treatment.rate, { decimals: 0 })} · 95% range ${formatPercent(m.treatment.interval.low, { decimals: 0 })}–${formatPercent(m.treatment.interval.high, { decimals: 0 })}`}
          kind="simulated"
          testId="kpi-treatment"
        />
        <Stat
          label="Came back, held back"
          value={`${formatCount(m.holdout.count)} of ${formatCount(m.holdout.denominator)}`}
          sub={`${formatPercent(m.holdout.rate, { decimals: 0 })} · 95% range ${formatPercent(m.holdout.interval.low, { decimals: 0 })}–${formatPercent(m.holdout.interval.high, { decimals: 0 })}`}
          kind="simulated"
          testId="kpi-holdout"
        />
        <Stat
          label="Extra customers back"
          value={one(m.simulatedIncrementalReturners)}
          sub={`${formatPercent(m.liftRate, { signed: true, decimals: 0 }).replace('%', '')} pts × ${formatCount(m.treatment.denominator)} customers`}
          kind="simulated"
          testId="kpi-incremental"
        />
        <Stat label="Campaign spend" value={formatINR(m.spendPaise)} sub="Offers used + messages (simulated)" kind="simulated" testId="kpi-spend" />
        <Stat
          label="Net extra profit"
          value={formatINR(m.netPaise, { signed: true })}
          sub={`Estimated before: ${formatINR(record.estimate.netIncrementalProfitPaise, { signed: true })}`}
          kind="simulated"
          testId="kpi-net"
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section id="rates-title" title="Return rate by group" kind={<Tag kind="simulated" />} testId="rates-section">
          <GroupRates
            rows={[
              { label: 'Offer group', metric: m.treatment, assumed: record.assumedReturnRate, assumedLabel: 'Assumed with the offer', tone: 'current' },
              { label: 'Held back', metric: m.holdout, assumed: a.baselineReturnRate, assumedLabel: 'Assumed without an offer', tone: 'comparison' },
            ]}
          />
          <p className="mt-4 text-xs leading-relaxed text-muted">
            The ranges overlap heavily. With groups this small, a real lift and no lift at all could both produce numbers like these.
          </p>
        </Section>

        <Section id="compare-title" title="Estimate vs simulated outcome" testId="comparison">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="sr-only">Estimate made before the run compared with this simulated run</caption>
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    Metric
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      Before <Tag kind="estimate" />
                    </span>
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      This run <Tag kind="simulated" />
                    </span>
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {rows.map((r) => (
                  <tr key={r.key} data-testid={`compare-${r.key}`}>
                    <th scope="row" className="py-2.5 pr-3 text-left font-normal text-text">
                      {r.label}
                      {r.denominator !== null && <span className="block text-xs text-muted">out of {formatCount(r.denominator)}</span>}
                    </th>
                    <td className="px-3 py-2.5 text-right text-muted">{formatValue(r, r.estimate)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-text">{formatValue(r, r.simulated)}</td>
                    <td className="py-2.5 pl-3 text-right text-muted">{formatValue(r, r.difference, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">The estimate was frozen when the run completed, from the approved configuration. It is never adjusted to match the outcome.</p>
        </Section>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section id="distribution-title" title="How much one run can vary" kind={<Tag kind="simulated" />} testId="distribution-section">
          <p className="-mt-1 mb-4 text-sm text-muted">Net extra profit across {formatCount(record.range.runs)} simulated runs of the same approved configuration.</p>
          <ProfitDistribution record={record} />
        </Section>

        <Section id="why-title" title="Why the outcome can differ from the estimate" testId="divergence">
          <ul className="space-y-3 text-sm leading-relaxed text-muted">
            {reasons.map((r) => (
              <li key={r} className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section id="config-title" title="Approved configuration for this run" testId="approved-config">
        <div className="grid gap-6 md:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Offer</dt>
            <dd className="text-text">
              {record.interventionLabel}: {record.offerLabel}
            </dd>
            <dt className="text-muted">Groups</dt>
            <dd className="text-text tabular">
              {formatCount(record.treatmentSize)} offer · {formatCount(record.holdoutSize)} held back
            </dd>
            <dt className="text-muted">Approved</dt>
            <dd className="text-text">
              {formatTime(record.approvedAt)} by {record.approvedBy}
            </dd>
            <dt className="text-muted">Simulation seed</dt>
            <dd className="text-text tabular">{record.seed}</dd>
            <dt className="text-muted">Message</dt>
            <dd className="text-text">{record.message}</dd>
          </dl>
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs text-muted">
              Assumptions <Tag kind="assumed" />
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm tabular">
              <dt className="text-muted">Would return anyway</dt>
              <dd className="text-text">{formatPercent(a.baselineReturnRate, { decimals: 0 })}</dd>
              <dt className="text-muted">With the offer</dt>
              <dd className="text-text">{formatPercent(record.assumedReturnRate, { decimals: 0 })}</dd>
              <dt className="text-muted">Returners who use the offer</dt>
              <dd className="text-text">{formatPercent(a.redemptionRate, { decimals: 0 })}</dd>
              <dt className="text-muted">Later full-price visits</dt>
              <dd className="text-text">{a.followOnVisits} per returner</dd>
              <dt className="text-muted">Gross margin</dt>
              <dd className="text-text">{formatPercent(a.grossMarginRate, { decimals: 0 })}</dd>
              <dt className="text-muted">Cost per message</dt>
              <dd className="text-text">{formatINR(a.messageCostPaise, { decimals: 2 })}</dd>
              <dt className="flex items-center gap-2 text-muted">
                Their average bill <Tag kind="observed" />
              </dt>
              <dd className="text-text">{formatINR(record.estimate.averageBasketPaise)}</dd>
            </dl>
          </div>
        </div>
      </Section>

      <Section
        id="history-title"
        title="Learning history"
        testId="history"
        kind={<History className="size-4 text-muted" aria-hidden="true" />}
        aside={<ClearHistoryDialog onConfirm={onClearHistory} count={history.length} />}
      >
        <p className="-mt-1 mb-3 text-xs leading-relaxed text-muted">
          One campaign runs at a time. Each completed simulated run is kept in this browser session, including after you restart the demo, and is cleared when
          the tab closes. Showing the {formatCount(history.length)} most recent.
        </p>
        <div className="relative overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Completed simulated runs</caption>
            <thead className="bg-surface-raised/60 text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Campaign
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Offer
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Net (simulated)
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Next step
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((h) => {
                const selected = h.id === record.id;
                return (
                  <tr key={h.id} className={selected ? 'bg-accent-soft/40' : undefined} data-testid="history-row">
                    <td className="px-3 py-2 text-text">
                      {h.campaignName}
                      <span className="block text-xs text-muted">{formatTime(h.completedAt)}</span>
                    </td>
                    <td className="px-3 py-2 text-muted">{h.offerLabel}</td>
                    <td className="px-3 py-2 text-right text-text tabular">{formatINR(h.outcome.netIncrementalProfitPaise, { signed: true })}</td>
                    <td className="px-3 py-2 text-muted">{recommendNextStep(h).title}</td>
                    <td className="px-3 py-2 text-right">
                      {selected ? (
                        <span className="text-xs text-muted">Viewing</span>
                      ) : (
                        <button type="button" onClick={() => onSelect(h.id)} className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-surface-hover">
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Small groups: below {SMALL_GROUP} customers per group, results are flagged as noisy.</p>
      </Section>
    </div>
  );
}
