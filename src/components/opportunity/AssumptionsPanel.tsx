import { RotateCcw } from 'lucide-react';
import { LIMITS } from '../../domain/decision';
import { formatCount, formatINR } from '../../domain/format';
import type { CampaignAssumptions } from '../../domain/types';
import { NumberField } from '../NumberField';

interface Props {
  assumptions: CampaignAssumptions;
  onChange: (patch: Partial<CampaignAssumptions>) => void;
  onReset: () => void;
  averageBasketPaise: number;
  treatment: number;
  holdout: number;
  disabled: boolean;
}

const pct = (f: number) => Math.round(f * 1000) / 10;

export function AssumptionsPanel({ assumptions, onChange, onReset, averageBasketPaise, treatment, holdout, disabled }: Props) {
  return (
    <section aria-labelledby="assumptions-title" className="rounded-xl border border-border bg-surface p-5" data-testid="assumptions-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 id="assumptions-title" className="text-sm font-semibold text-text">
          Assumptions
        </h3>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          Reset
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">Your estimates, not measurements. Every figure updates as you edit.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <NumberField
          label="Gross margin on sales"
          value={pct(assumptions.grossMarginRate)}
          limit={LIMITS.grossMarginRate}
          onCommit={(v) => onChange({ grossMarginRate: v / 100 })}
          disabled={disabled}
        />
        <NumberField
          label="Would return anyway"
          hint="Without any offer, within the window"
          value={pct(assumptions.baselineReturnRate)}
          limit={LIMITS.baselineReturnRate}
          onCommit={(v) => onChange({ baselineReturnRate: v / 100 })}
          disabled={disabled}
        />
        <NumberField
          label="Returners who use the offer"
          value={pct(assumptions.redemptionRate)}
          limit={LIMITS.redemptionRate}
          onCommit={(v) => onChange({ redemptionRate: v / 100 })}
          disabled={disabled}
        />
        <NumberField
          label="Later full-price visits"
          hint="Per returning customer, within the window"
          value={assumptions.followOnVisits}
          limit={LIMITS.followOnVisits}
          onCommit={(v) => onChange({ followOnVisits: v })}
          disabled={disabled}
        />
        <NumberField
          label="Cost per message"
          hint="Illustrative, not a quoted price"
          value={assumptions.messageCostPaise / 100}
          limit={LIMITS.messageCost}
          onCommit={(v) => onChange({ messageCostPaise: Math.round(v * 100) })}
          disabled={disabled}
        />
      </div>

      <dl className="mt-5 space-y-2 border-t border-border pt-4 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Average bill (observed)</dt>
          <dd className="text-text tabular">{formatINR(averageBasketPaise)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Get the offer</dt>
          <dd className="text-text tabular">{formatCount(treatment)} customers</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Held back to measure</dt>
          <dd className="text-text tabular">{formatCount(holdout)} customers</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Campaign window</dt>
          <dd className="text-text tabular">{assumptions.windowDays} days</dd>
        </div>
      </dl>
    </section>
  );
}
