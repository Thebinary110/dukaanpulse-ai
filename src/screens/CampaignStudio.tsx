import { ArrowLeft, ArrowRight, FlaskConical, Lock, Play, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { SimulatedOutcomeSummary } from '../components/SimulatedOutcomeSummary';
import { StatusChip } from '../components/StatusChip';
import { ApproveDialog, buildChecklist, Checklist } from '../components/studio/ApprovalPanel';
import { AudienceCard } from '../components/studio/AudienceCard';
import { Card } from '../components/studio/Card';
import { EconomicsPanel } from '../components/studio/EconomicsPanel';
import { MessageEditor } from '../components/studio/MessageEditor';
import { OfferEditor } from '../components/studio/OfferEditor';
import { SimulationPanel } from '../components/studio/SimulationPanel';
import { getDemoData } from '../data/demoData';
import { averageBasketOf, basketByCustomer, CAMPAIGN_NAME_MAX_LENGTH, checkDraft, estimateDraft, updateDraftOffer } from '../domain/campaign';
import type { OptionSettings } from '../domain/decision';
import { formatCount, formatINR } from '../domain/format';
import { describeOffer, getIntervention } from '../domain/interventions';
import { generateMessage } from '../domain/message';
import { simulateCampaign } from '../domain/simulator';
import type { CampaignDraft, LapsedCustomer } from '../domain/types';
import { simulationSeed, type ScenarioStatus } from '../state/scenario';
import { useWorkspace } from '../state/WorkspaceContext';

const HAS_DRAFT: readonly ScenarioStatus[] = ['drafting', 'awaiting_approval', 'approved', 'executing', 'measured'];

function formatApprovalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} IST`;
}

function SimulationNotice() {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-simulated/40 bg-simulated-soft px-4 py-3 text-sm text-text" data-testid="simulation-notice">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-simulated" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Simulation only.</strong> This studio never sends messages, contacts customers or moves money. Approval
        allows a simulated run on synthetic data.
      </span>
    </p>
  );
}

function EmptyState({ status, notice, onRestart }: { status: ScenarioStatus; notice: string | null; onRestart: () => void }) {
  const rejected = status === 'rejected';
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight text-text">Campaign Studio</h1>
        <p className="mt-1.5 text-[15px] text-muted">Shape an offer, check what it costs, and approve it. Nothing runs without your approval.</p>
      </header>
      {notice && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-text" role="status" data-testid="storage-notice">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {notice} Start again from Opportunities.
        </p>
      )}
      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8" data-testid="no-draft">
        <h2 className="text-lg font-semibold text-text">{rejected ? 'The opportunity was dismissed' : 'No campaign drafted yet'}</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {rejected
            ? 'You dismissed this opportunity, so there is nothing to plan. Reopen the review in Opportunities to draft a campaign.'
            : 'Campaigns start from an opportunity: review the evidence, compare offers, then choose "Draft campaign".'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/opportunities"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            Go to Opportunities
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          {rejected && (
            <button type="button" onClick={onRestart} className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text">
              Restart demo
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function CampaignStudio() {
  const { scenario, explorer, dispatch, updateExplorer, restartDemo, storageNotice } = useWorkspace();
  const { dataset, opportunity } = getDemoData();
  const navigate = useNavigate();

  const restart = useCallback(() => {
    restartDemo();
    navigate('/');
  }, [restartDemo, navigate]);

  if (!scenario.draft || !HAS_DRAFT.includes(scenario.status) || opportunity.status !== 'found') {
    return <EmptyState status={scenario.status} notice={storageNotice} onRestart={restart} />;
  }

  return (
    <Studio
      draft={scenario.draft}
      status={scenario.status}
      approval={scenario.approval}
      outcome={scenario.outcome}
      lastError={scenario.lastError}
      cohort={opportunity.opportunity.cohort}
      regularsChecked={opportunity.opportunity.regularsTested}
      merchantName={dataset.merchant.name}
      datasetSeed={dataset.seed}
      startDate={dataset.startDate}
      dispatch={dispatch}
      onExplorerOffer={(id, patch) =>
        updateExplorer({ settings: { ...explorer.settings, options: { ...explorer.settings.options, [id]: { ...explorer.settings.options[id]!, ...patch } } } })
      }
      onRestart={restart}
    />
  );
}

type Api = ReturnType<typeof useWorkspace>;

interface StudioProps {
  draft: CampaignDraft;
  status: ScenarioStatus;
  approval: Api['scenario']['approval'];
  outcome: Api['scenario']['outcome'];
  lastError: string | null;
  cohort: LapsedCustomer[];
  regularsChecked: number;
  merchantName: string;
  datasetSeed: number;
  startDate: string;
  dispatch: Api['dispatch'];
  onExplorerOffer: (id: string, patch: Partial<OptionSettings>) => void;
  onRestart: () => void;
}

function Studio(props: StudioProps) {
  const { draft, status, dispatch } = props;
  const nameId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = status === 'drafting';
  const intervention = getIntervention(draft.interventionId);

  const flaggedIds = useMemo(() => props.cohort.map((c) => c.customerId), [props.cohort]);
  const baskets = useMemo(() => basketByCustomer(props.cohort), [props.cohort]);
  const averageBasketPaise = useMemo(() => averageBasketOf(baskets, draft.treatmentIds), [baskets, draft.treatmentIds]);
  const check = useMemo(() => checkDraft(draft, flaggedIds, averageBasketPaise), [draft, flaggedIds, averageBasketPaise]);
  const estimate = useMemo(() => (check.offer.length === 0 ? estimateDraft(draft, averageBasketPaise) : null), [check.offer.length, draft, averageBasketPaise]);
  const checklist = buildChecklist(check, acknowledged || !['drafting', 'awaiting_approval'].includes(status));
  const ready = checklist.every((i) => i.ok);
  const generated = generateMessage(draft.offer, props.merchantName, draft.assumptions.windowDays);

  const showsSimulation = status === 'executing' || status === 'measured';
  const outcome = useMemo(
    () => (showsSimulation ? props.outcome ?? simulateCampaign(draft, baskets, simulationSeed(props.datasetSeed, draft)) : null),
    [showsSimulation, props.outcome, draft, baskets, props.datasetSeed],
  );

  const update = (next: CampaignDraft) => {
    const r = dispatch({ type: 'UPDATE_DRAFT', draft: next });
    setError(r.ok ? null : r.error);
  };
  const changeOffer = (patch: Partial<OptionSettings>) => {
    const next = updateDraftOffer(draft, patch, props.merchantName);
    update(next);
    props.onExplorerOffer(draft.interventionId, {
      valuePaise: next.offer.valuePaise,
      minSpendPaise: next.offer.minSpendPaise,
      costPerRedemptionPaise: next.offer.costPerRedemptionPaise,
    });
  };
  const approve = (): boolean => {
    if (status === 'drafting') {
      const submitted = dispatch({ type: 'SUBMIT_FOR_APPROVAL' });
      if (!submitted.ok) {
        setError(submitted.error);
        return false;
      }
    }
    const approved = dispatch({ type: 'APPROVE', at: new Date().toISOString(), approvedBy: `${props.merchantName} owner (demo)` });
    setError(approved.ok ? null : approved.error);
    return approved.ok;
  };
  const runSimulation = () => {
    const r = dispatch({ type: 'START_EXECUTION', at: new Date().toISOString() });
    setError(r.ok ? null : r.error);
  };
  const complete = useCallback(() => {
    if (outcome) dispatch({ type: 'COMPLETE', outcome });
  }, [dispatch, outcome]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link to="/opportunities" className="inline-flex w-fit items-center gap-1.5 rounded text-sm text-muted transition-colors hover:text-text">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to opportunity review
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={status} />
          <span className="text-xs text-muted">Campaign Studio</span>
        </div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight break-words text-text sm:text-[32px]" data-testid="campaign-title">
          {draft.name.trim() || 'Untitled campaign'}
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted">
          {intervention.label} for {formatCount(draft.treatmentIds.length)} regulars who may be slipping away, measured against{' '}
          {formatCount(draft.holdoutIds.length)} held-back customers.
        </p>
      </header>

      <SimulationNotice />

      {(error ?? props.lastError) && (
        <p role="alert" className="rounded-lg border border-danger/50 bg-danger-soft px-4 py-2.5 text-sm text-text" data-testid="studio-error">
          {error ?? props.lastError}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {status === 'approved' && props.approval && (
            <section className="rounded-2xl border border-success/40 bg-surface p-5 sm:p-6" data-testid="approved-panel">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-success uppercase">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Approved
              </p>
              <h2 className="mt-1 text-lg font-semibold text-text">Approved and locked. Ready for a simulated run</h2>
              <p className="mt-1 text-sm text-muted">
                Approved {formatApprovalTime(props.approval.at)} by {props.approval.approvedBy}. The simulation uses exactly this configuration. Nothing
                will be sent.
              </p>
              <button
                type="button"
                onClick={runSimulation}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
              >
                <Play className="size-4" aria-hidden="true" />
                Run simulation
              </button>
            </section>
          )}

          {showsSimulation && outcome && (
            <SimulationPanel
              outcome={outcome}
              windowDays={draft.assumptions.windowDays}
              recipients={draft.treatmentIds.length}
              running={status === 'executing'}
              onComplete={complete}
            />
          )}

          {status === 'measured' && props.outcome && (
            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" data-testid="measured-panel">
              <h2 className="text-base font-semibold text-text">Simulated result</h2>
              <div className="mt-3">
                <SimulatedOutcomeSummary outcome={props.outcome} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/results" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">
                  View results
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <button type="button" onClick={props.onRestart} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Restart demo
                </button>
              </div>
            </section>
          )}

          <Card id="overview-title" label="Campaign" labelTone="accent" title={`${intervention.label}: ${describeOffer(draft.offer)}`} testId="campaign-overview">
            <p className="text-sm leading-relaxed text-muted">{intervention.description}</p>
            <div className="mt-4 max-w-md">
              <label htmlFor={nameId} className="mb-1.5 block text-xs text-muted">
                Internal campaign name
              </label>
              <input
                id={nameId}
                value={draft.name}
                maxLength={CAMPAIGN_NAME_MAX_LENGTH + 20}
                disabled={!editable}
                onChange={(e) => update({ ...draft, name: e.target.value })}
                aria-invalid={check.name.length > 0}
                className={`h-9 w-full rounded-lg border bg-bg/60 px-3 text-sm text-text outline-none focus:border-accent disabled:opacity-60 ${
                  check.name.length > 0 ? 'border-danger' : 'border-border-strong'
                }`}
              />
              {check.name.length > 0 && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {check.name[0]}
                </p>
              )}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Recipients</dt>
                <dd className="mt-1 text-xl font-semibold text-text tabular" data-testid="overview-recipients">
                  {formatCount(draft.treatmentIds.length)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Held back</dt>
                <dd className="mt-1 text-xl font-semibold text-text tabular">{formatCount(draft.holdoutIds.length)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Est. campaign cost</dt>
                <dd className="mt-1 text-xl font-semibold text-text tabular" data-testid="overview-cost">
                  {estimate ? formatINR(estimate.economics.totalCostPaise) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Est. net extra profit</dt>
                <dd className="mt-1 text-xl font-semibold text-text tabular" data-testid="overview-net">
                  {estimate ? formatINR(estimate.economics.netIncrementalProfitPaise, { signed: true }) : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <OfferEditor
            offer={draft.offer}
            windowDays={draft.assumptions.windowDays}
            recipients={draft.treatmentIds.length}
            problems={check.offer}
            editable={editable}
            onChange={changeOffer}
          />

          <MessageEditor
            message={draft.message}
            generated={generated}
            issues={check.message}
            merchantName={props.merchantName}
            editable={editable}
            onChange={(message) => update({ ...draft, message })}
          />

          <AudienceCard
            treatmentIds={draft.treatmentIds}
            holdoutIds={draft.holdoutIds}
            flagged={props.cohort}
            regularsChecked={props.regularsChecked}
            problems={check.audience}
            startDate={props.startDate}
          />
        </div>

        <aside className="grid min-w-0 items-start gap-6 md:grid-cols-2 xl:grid-cols-1" aria-label="Economics and approval">
          <section aria-labelledby="approval-title" className="rounded-2xl border border-border-strong bg-surface p-5" data-testid="approval-panel">
            <h2 id="approval-title" className="text-sm font-semibold text-text">
              {editable || status === 'awaiting_approval' ? 'Before you approve' : 'Approval'}
            </h2>
            <div className="mt-4">
              <Checklist items={checklist} />
            </div>

            {(editable || status === 'awaiting_approval') && (
              <>
                <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-bg/50 p-3 text-xs leading-relaxed text-text">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--dp-accent)]"
                  />
                  I understand this is a simulation: no messages will be sent and no payments will be made.
                </label>
                <div className="mt-4 flex flex-col gap-2">
                  <ApproveDialog draft={draft} disabled={!ready} onApprove={approve} />
                  {!ready && <p className="text-xs text-muted">Complete the checklist to approve.</p>}
                  {status === 'awaiting_approval' && (
                    <button
                      type="button"
                      onClick={() => {
                        const r = dispatch({ type: 'REQUEST_CHANGES' });
                        setError(r.ok ? null : r.error);
                      }}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text"
                    >
                      Back to editing
                    </button>
                  )}
                </div>
              </>
            )}

            {!editable && status !== 'awaiting_approval' && props.approval && (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-bg/50 px-3 py-2.5 text-xs leading-relaxed text-muted" data-testid="locked-note">
                <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Approved {formatApprovalTime(props.approval.at)}. This configuration is locked.
              </p>
            )}
          </section>

          <EconomicsPanel draft={draft} estimate={estimate} editable={editable} />
        </aside>
      </div>
    </div>
  );
}
