import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';

const REASONS = ['Not the right time', 'Offers would cost too much', 'The signal is not convincing', 'I will handle it myself'];

export function DismissDialog({ onConfirm, disabled }: { onConfirm: (reason: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]!);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-40"
        >
          Dismiss opportunity
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-strong bg-surface p-6 shadow-2xl">
          <Dialog.Title className="text-lg font-semibold text-text">Dismiss this opportunity?</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-muted">
            No campaign will be drafted. You can reopen the review later.
          </Dialog.Description>
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-2 text-xs text-muted">Reason</legend>
            {REASONS.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm text-text has-checked:border-accent/60 has-checked:bg-accent-soft">
                <input type="radio" name="dismiss-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--dp-accent)]" />
                {r}
              </label>
            ))}
          </fieldset>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text">Cancel</Dialog.Close>
            <button
              type="button"
              onClick={() => {
                onConfirm(reason);
                setOpen(false);
              }}
              className="rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-sm font-semibold text-text hover:bg-surface-hover"
            >
              Dismiss
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
