import { STATUS_LABEL, type ScenarioStatus } from '../state/scenario';

const TONE: Record<ScenarioStatus, string> = {
  detected: 'border-accent/40 bg-accent-soft text-text',
  reviewing: 'border-accent/40 bg-accent-soft text-text',
  drafting: 'border-accent/40 bg-accent-soft text-text',
  awaiting_approval: 'border-warning/40 bg-warning-soft text-text',
  approved: 'border-success/40 bg-success-soft text-text',
  executing: 'border-simulated/40 bg-simulated-soft text-text',
  measured: 'border-simulated/40 bg-simulated-soft text-text',
  rejected: 'border-border-strong bg-surface-raised text-muted',
};

const DOT: Record<ScenarioStatus, string> = {
  detected: 'bg-accent',
  reviewing: 'bg-accent',
  drafting: 'bg-accent',
  awaiting_approval: 'bg-warning',
  approved: 'bg-success',
  executing: 'bg-simulated',
  measured: 'bg-simulated',
  rejected: 'bg-muted',
};

export function StatusChip({ status }: { status: ScenarioStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}
      data-testid="scenario-status"
    >
      <span className={`size-1.5 rounded-full ${DOT[status]}`} aria-hidden="true" />
      <span className="sr-only">Status: </span>
      {STATUS_LABEL[status]}
    </span>
  );
}
