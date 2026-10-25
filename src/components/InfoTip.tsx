import * as Tooltip from '@radix-ui/react-tooltip';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

/** Keyboard-focusable info icon with an explanatory tooltip. `label` names the button for screen readers. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-grid size-5 place-items-center rounded-full text-muted transition-colors hover:text-text"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 max-w-64 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-xs leading-relaxed text-muted shadow-xl shadow-black/40"
        >
          {children}
          <Tooltip.Arrow className="fill-surface-raised" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
