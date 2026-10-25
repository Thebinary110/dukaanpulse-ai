import { LIMITS, type OptionSettings } from '../../domain/decision';
import { formatINR } from '../../domain/format';
import type { Offer } from '../../domain/types';
import { NumberField } from '../NumberField';
import { Card } from './Card';

const rupees = (paise: number) => Math.round(paise) / 100;

export function OfferEditor({
  offer,
  windowDays,
  recipients,
  problems,
  editable,
  onChange,
}: {
  offer: Offer;
  windowDays: number;
  recipients: number;
  problems: string[];
  editable: boolean;
  onChange: (patch: Partial<OptionSettings>) => void;
}) {
  return (
    <Card id="offer-title" label="Offer rules · these drive the economics" labelTone="warning" title="What customers get" testId="offer-editor">
      <div className="grid gap-4 sm:grid-cols-2">
        {offer.kind === 'flat_discount' && (
          <>
            <NumberField label="Discount" value={rupees(offer.valuePaise)} limit={LIMITS.discount} onCommit={(v) => onChange({ valuePaise: Math.round(v * 100) })} disabled={!editable} hint="Your cost for each use" />
            <NumberField label="Minimum order" value={rupees(offer.minSpendPaise)} limit={LIMITS.minSpend} onCommit={(v) => onChange({ minSpendPaise: Math.round(v * 100) })} disabled={!editable} hint="₹0 means any order" />
          </>
        )}
        {offer.kind === 'free_item' && (
          <>
            <div>
              <p className="mb-1.5 text-xs text-muted">Reward</p>
              <p className="flex h-9 items-center text-sm text-text">Free cookie ({formatINR(offer.valuePaise)} retail)</p>
            </div>
            <NumberField label="Ingredient cost per cookie" value={rupees(offer.costPerRedemptionPaise)} limit={LIMITS.rewardCost} onCommit={(v) => onChange({ costPerRedemptionPaise: Math.round(v * 100) })} disabled={!editable} hint="Your cost for each use" />
          </>
        )}
        {offer.kind === 'loyalty_stamp' && (
          <>
            <div>
              <p className="mb-1.5 text-xs text-muted">Reward</p>
              <p className="flex h-9 items-center text-sm text-text">One extra stamp per visit</p>
            </div>
            <NumberField label="Cost per extra stamp" value={rupees(offer.costPerRedemptionPaise)} limit={LIMITS.rewardCost} onCommit={(v) => onChange({ costPerRedemptionPaise: Math.round(v * 100) })} disabled={!editable} hint="Share of the free item it earns" />
          </>
        )}
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-danger" role="alert" data-testid="offer-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-xs text-muted">Who can use it</dt>
          <dd className="text-text tabular sm:mt-0.5">Only the {recipients} customers in this campaign</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-xs text-muted">Uses</dt>
          <dd className="text-text sm:mt-0.5">Once per customer</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-xs text-muted">Valid for</dt>
          <dd className="text-text tabular sm:mt-0.5">{windowDays} days after the (simulated) send</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-xs text-muted">Minimum order</dt>
          <dd className="text-text tabular sm:mt-0.5">{offer.minSpendPaise > 0 ? formatINR(offer.minSpendPaise) : 'None'}</dd>
        </div>
      </dl>
    </Card>
  );
}
