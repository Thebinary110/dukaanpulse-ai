import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { LIMITS, type OptionEvaluation, type OptionSettings, type Recommendation } from '../../domain/decision';
import { formatCount, formatINR, formatPercent } from '../../domain/format';
import { NumberField } from '../NumberField';

interface Props {
  evaluations: OptionEvaluation[];
  recommendation: Recommendation;
  selectedId: string;
  onSelect: (id: string) => void;
  settings: Record<string, OptionSettings>;
  onChange: (id: string, patch: Partial<OptionSettings>) => void;
  customers: number;
  baselineReturnRate: number;
  disabled: boolean;
}

const rupees = (paise: number) => Math.round(paise) / 100;
const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-IN');

function Row({ label, hint, children, emphasis }: { label: string; hint?: string; children: ReactNode; emphasis?: boolean }) {
  return (
    <tr className={emphasis ? 'bg-surface-raised/40' : undefined}>
      <th scope="row" className={`px-4 py-2.5 text-left align-top text-xs font-normal ${emphasis ? 'text-text' : 'text-muted'}`}>
        <span className={emphasis ? 'font-semibold' : undefined}>{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
      </th>
      {children}
    </tr>
  );
}

function Cell({ children, selected, className = '' }: { children: ReactNode; selected: boolean; className?: string }) {
  return <td className={`px-3 py-2.5 align-top text-sm tabular ${selected ? 'bg-accent-soft/50' : ''} ${className}`}>{children}</td>;
}

export function OptionsComparison({ evaluations, recommendation, selectedId, onSelect, settings, onChange, customers, baselineReturnRate, disabled }: Props) {
  const rank = (id: string) => recommendation.ranking.indexOf(id) + 1;

  return (
    <div className="relative overflow-x-auto rounded-xl border border-border bg-surface" data-testid="options-comparison">
      <table className="w-full min-w-[640px] table-fixed border-collapse">
        <caption className="sr-only">Comparison of interventions under the current assumptions</caption>
        <thead>
          <tr className="border-b border-border">
            <td className="w-[24%] px-4 py-3 align-bottom text-xs text-muted">
              For the {formatCount(customers)} customers who would get the offer, over the campaign window
            </td>
            {evaluations.map((e) => {
              const id = e.intervention.id;
              const selected = id === selectedId;
              const recommended = id === recommendation.recommendedId;
              return (
                <th key={id} scope="col" className={`px-3 py-3 text-left align-top font-normal ${selected ? 'bg-accent-soft/50' : ''}`}>
                  <label className={`flex cursor-pointer items-start gap-2 ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}>
                    <input
                      type="radio"
                      name="intervention"
                      value={id}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => onSelect(id)}
                      className="mt-1 size-4 shrink-0 accent-[var(--dp-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text">{e.intervention.label}</span>
                      <span className="block text-xs text-muted">{e.offerLabel}</span>
                    </span>
                  </label>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full border border-border-strong px-1.5 py-px text-muted tabular">#{rank(id)}</span>
                    {recommended && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-px font-semibold text-on-accent" data-testid={`recommended-${id}`}>
                        <Check className="size-3" aria-hidden="true" />
                        Recommended
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-border">
          <tr>
            <th colSpan={evaluations.length + 1} scope="colgroup" className="bg-bg/40 px-4 py-2 text-left text-[11px] font-semibold tracking-wider text-warning uppercase">
              Assumed: your settings
            </th>
          </tr>
          <Row label="Offer value" hint="What the customer gets">
            {evaluations.map((e) => {
              const id = e.intervention.id;
              const s = settings[id]!;
              return (
                <Cell key={id} selected={id === selectedId}>
                  {e.offer.kind === 'flat_discount' ? (
                    <NumberField compact label={`${e.intervention.label}: discount`} value={rupees(s.valuePaise)} limit={LIMITS.discount} onCommit={(v) => onChange(id, { valuePaise: Math.round(v * 100) })} disabled={disabled} />
                  ) : e.offer.kind === 'none' ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="text-text">{formatINR(e.offer.valuePaise)} {e.offer.kind === 'loyalty_stamp' ? 'stamp' : 'item'}</span>
                  )}
                </Cell>
              );
            })}
          </Row>
          <Row label="Minimum spend">
            {evaluations.map((e) => {
              const id = e.intervention.id;
              return (
                <Cell key={id} selected={id === selectedId}>
                  {e.offer.kind === 'flat_discount' ? (
                    <NumberField compact label={`${e.intervention.label}: minimum spend`} value={rupees(settings[id]!.minSpendPaise)} limit={LIMITS.minSpend} onCommit={(v) => onChange(id, { minSpendPaise: Math.round(v * 100) })} disabled={disabled} />
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </Cell>
              );
            })}
          </Row>
          <Row label="Your cost per use" hint="Discount given, or ingredient cost">
            {evaluations.map((e) => {
              const id = e.intervention.id;
              return (
                <Cell key={id} selected={id === selectedId}>
                  {e.offer.kind === 'free_item' || e.offer.kind === 'loyalty_stamp' ? (
                    <NumberField compact label={`${e.intervention.label}: cost per use`} value={rupees(settings[id]!.costPerRedemptionPaise)} limit={LIMITS.rewardCost} onCommit={(v) => onChange(id, { costPerRedemptionPaise: Math.round(v * 100) })} disabled={disabled} />
                  ) : (
                    <span className={e.offer.kind === 'none' ? 'text-muted' : 'text-text'}>{e.offer.kind === 'none' ? '₹0' : formatINR(e.offer.costPerRedemptionPaise)}</span>
                  )}
                </Cell>
              );
            })}
          </Row>
          <Row label="Extra return rate" hint={`Above the ${formatPercent(baselineReturnRate, { decimals: 0 })} who return anyway`}>
            {evaluations.map((e) => {
              const id = e.intervention.id;
              return (
                <Cell key={id} selected={id === selectedId}>
                  {e.offer.kind === 'none' ? (
                    <span className="text-muted">+0%</span>
                  ) : (
                    <NumberField compact label={`${e.intervention.label}: extra return rate`} value={Math.round(settings[id]!.uplift * 1000) / 10} limit={LIMITS.uplift} onCommit={(v) => onChange(id, { uplift: v / 100 })} disabled={disabled} />
                  )}
                </Cell>
              );
            })}
          </Row>

          <tr>
            <th colSpan={evaluations.length + 1} scope="colgroup" className="bg-bg/40 px-4 py-2 text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
              Estimated: expected outcome
            </th>
          </tr>
          <Row label="Expected to return">
            {evaluations.map((e) => (
              <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                <span className="text-text">{formatPercent(e.returnRate, { decimals: 0 })}</span>
                <span className="block text-xs text-muted">about {one(e.economics.expectedReturners)} of {formatCount(customers)}</span>
              </Cell>
            ))}
          </Row>
          <Row label="Extra customers back" hint="Who would not have returned anyway">
            {evaluations.map((e) => (
              <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                <span className="text-text">{one(e.economics.expectedIncrementalReturners)}</span>
              </Cell>
            ))}
          </Row>
          <Row label="Extra revenue">
            {evaluations.map((e) => (
              <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                <span className="text-text">{formatINR(e.economics.incrementalRevenuePaise)}</span>
              </Cell>
            ))}
          </Row>
          <Row label="Extra gross margin">
            {evaluations.map((e) => (
              <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                <span className="text-text">{formatINR(e.economics.incrementalMarginPaise)}</span>
              </Cell>
            ))}
          </Row>
          <Row label="Offer + message cost" hint="Includes offers used by customers who would have returned anyway">
            {evaluations.map((e) => (
              <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                <span className="text-text">{formatINR(e.economics.totalCostPaise)}</span>
                {e.economics.totalCostPaise > 0 && (
                  <span className="block text-xs text-muted">
                    {formatINR(e.economics.offerCostPaise)} + {formatINR(e.economics.messageCostPaise)}
                  </span>
                )}
              </Cell>
            ))}
          </Row>
          <Row label="Net extra profit" emphasis>
            {evaluations.map((e) => {
              const net = e.economics.netIncrementalProfitPaise;
              return (
                <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                  <span className={`text-base font-semibold ${net < -50 ? 'text-danger' : 'text-text'}`} data-testid={`net-${e.intervention.id}`}>
                    {e.offer.kind === 'none' ? '₹0' : formatINR(net, { signed: true })}
                  </span>
                </Cell>
              );
            })}
          </Row>
          <Row label="Break-even" hint="Redemptions needed to cover costs">
            {evaluations.map((e) => {
              const be = e.economics.breakEvenReturnRate;
              return (
                <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                  {e.offer.kind === 'none' ? (
                    <span className="text-muted">Nothing to recover</span>
                  ) : Number.isFinite(be) && be <= 1 ? (
                    <>
                      <span className="text-text">{one(e.breakEvenRedemptions)} redemptions</span>
                      <span className="block text-xs text-muted">{formatPercent(be, { decimals: 0 })} must return</span>
                    </>
                  ) : (
                    <span className="text-danger">Cannot break even</span>
                  )}
                </Cell>
              );
            })}
          </Row>
          <Row label="If it works half as well" hint="Downside: half the extra return rate">
            {evaluations.map((e) => (
              <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                <span className={e.downsideNetProfitPaise < -50 ? 'text-danger' : 'text-muted'}>
                  {e.offer.kind === 'none' ? '₹0' : formatINR(e.downsideNetProfitPaise, { signed: true })}
                </span>
              </Cell>
            ))}
          </Row>
          {evaluations.some((e) => e.problems.length > 0) && (
            <Row label="Check settings">
              {evaluations.map((e) => (
                <Cell key={e.intervention.id} selected={e.intervention.id === selectedId}>
                  {e.problems.length > 0 ? (
                    <span className="text-xs text-warning" role="alert">
                      {e.problems.join(' ')} Not ranked.
                    </span>
                  ) : null}
                </Cell>
              ))}
            </Row>
          )}
        </tbody>
      </table>
    </div>
  );
}
