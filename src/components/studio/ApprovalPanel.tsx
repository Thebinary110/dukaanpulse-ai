import * as Dialog from '@radix-ui/react-dialog';
import { Check, Circle, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import type { DraftCheck } from '../../domain/campaign';
import { describeOffer } from '../../domain/interventions';
import type { CampaignDraft } from '../../domain/types';

export interface ChecklistItem {
  label: string;
  ok: boolean;
  detail?: string;
}

export function buildChecklist(check: DraftCheck, acknowledged: boolean): ChecklistItem[] {
  return [
    { label: 'Intervention selected', ok: true },
    { label: 'Campaign named', ok: check.name.length === 0, detail: check.name[0] },
    { label: 'Offer rules are valid', ok: check.offer.length === 0, detail: check.offer[0] },
    { label: 'Message states the offer accurately', ok: check.message.length === 0, detail: check.message[0]?.text },
    { label: 'Offer group and holdout are valid and separate', ok: check.audience.length === 0, detail: check.audience[0] },
    { label: 'Assumptions shown with the estimates', ok: true },
    { label: 'You understand this is a simulation', ok: acknowledged, detail: acknowledged ? undefined : 'Tick the box below.' },
  ];
}

export function Checklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="space-y-2" data-testid="approval-checklist">
      {items.map((item) => (
        <li key={item.label} className="flex gap-2.5 text-sm" data-ok={item.ok}>
          {item.ok ? (
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <Circle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className={item.ok ? 'text-text' : 'text-text'}>
              <span className="sr-only">{item.ok ? 'Done: ' : 'To do: '}</span>
              {item.label}
            </span>
            {!item.ok && item.detail && <span className="block text-xs text-warning">{item.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ApproveDialog({
  draft,
  disabled,
  onApprove,
}: {
  draft: CampaignDraft;
  disabled: boolean;
  onApprove: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
          Approve campaign…
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-border-strong bg-surface p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-text">Approve “{draft.name}”?</Dialog.Title>
            <Dialog.Close className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-text" aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
            Approving locks this exact configuration. In this prototype, approval only allows a <strong className="text-text">simulated</strong> run:
            no messages are sent, no customers are contacted and no money moves.
          </Dialog.Description>
          <dl className="mt-4 space-y-1.5 rounded-xl border border-border bg-bg/50 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Offer</dt>
              <dd className="text-right text-text">{describeOffer(draft.offer)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Recipients</dt>
              <dd className="text-text tabular">{draft.treatmentIds.length} customers</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Held back</dt>
              <dd className="text-text tabular">{draft.holdoutIds.length} customers</dd>
            </div>
            <div className="border-t border-border pt-2">
              <dt className="text-muted">Message</dt>
              <dd className="mt-1 text-text">{draft.message}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">After approving you can no longer edit it. To change anything, restart the demo.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text">Cancel</Dialog.Close>
            <button
              type="button"
              onClick={() => {
                if (onApprove()) setOpen(false);
              }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
            >
              Approve campaign
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
