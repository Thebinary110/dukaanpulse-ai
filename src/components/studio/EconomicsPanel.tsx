import { Link } from 'react-router';
import type { DraftEstimate } from '../../domain/campaign';
import { formatINR, formatPercent } from '../../domain/format';
import type { CampaignDraft } from '../../domain/types';

const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-IN');

function Line({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className={strong ? 'text-sm font-semibold text-text' : 'text-xs text-muted'}>{label}</dt>
      <dd className={`tabular ${strong ? 'text-lg font-semibold text-text' : 'text-sm text-text'}`} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function Group({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className={`mb-1 text-[11px] font-semibold tracking-wider uppercase ${tone}`}>{title}</p>
      <dl>{children}</dl>
    </div>
  );
}

export function EconomicsPanel({ draft, estimate, editable }: { draft: CampaignDraft; estimate: DraftEstimate | null; editable: boolean }) {
  const a = draft.assumptions;
  const e = estimate?.economics;
  return (
    <section aria-labelledby="economics-title" className="rounded-2xl border border-border bg-surface p-5" data-testid="economics-panel">
      <h2 id="economics-title" className="text-sm font-semibold text-text">
        Economics for this campaign
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Estimates for the {draft.treatmentIds.length} recipients over {a.windowDays} days. They are not a promise, and not every redemption is extra business.
      </p>

      <div className="mt-4 space-y-3">
        <Group title="Observed" tone="text-accent">
          <Line label="Their average bill" value={estimate ? formatINR(estimate.averageBasketPaise) : '—'} />
        </Group>

        <Group title="Assumed" tone="text-warning">
          <Line label="Would return anyway" value={formatPercent(a.baselineReturnRate, { decimals: 0 })} />
          <Line label="Extra return from the offer" value={`+${formatPercent(draft.assumedReturnRate - a.baselineReturnRate, { decimals: 0 })}`} />
          <Line label="Returners who use the offer" value={formatPercent(a.redemptionRate, { decimals: 0 })} />
          <Line label="Later full-price visits" value={`${a.followOnVisits} per returner`} />
          <Line label="Gross margin" value={formatPercent(a.grossMarginRate, { decimals: 0 })} />
          <Line label="Cost per message" value={formatINR(a.messageCostPaise, { decimals: 2 })} />
          {editable && (
            <Link to="/opportunities" className="mt-1 inline-block text-xs text-accent hover:text-accent-hover">
              Change assumptions in the comparison
            </Link>
          )}
        </Group>

        <Group title="Estimated" tone="text-muted">
          {e && estimate ? (
            <>
              <Line label="Expected to return" value={`${one(e.expectedReturners)} of ${draft.treatmentIds.length}`} testId="est-returners" />
              <Line label="Of whom, extra" value={one(e.expectedIncrementalReturners)} testId="est-incremental" />
              <Line label="Campaign cost" value={formatINR(e.totalCostPaise)} testId="est-cost" />
              <Line label="Extra gross margin" value={formatINR(e.incrementalMarginPaise)} testId="est-margin" />
              <Line label="Net extra profit" value={formatINR(e.netIncrementalProfitPaise, { signed: true })} strong testId="est-net" />
              <Line
                label="Break-even"
                value={
                  Number.isFinite(e.breakEvenReturnRate) && e.breakEvenReturnRate <= 1
                    ? `${one(estimate.breakEvenRedemptions)} redemptions (${formatPercent(e.breakEvenReturnRate, { decimals: 0 })} return)`
                    : 'Not reachable'
                }
                testId="est-breakeven"
              />
              <Line label="If it works half as well" value={formatINR(estimate.downsideNetProfitPaise, { signed: true })} testId="est-downside" />
            </>
          ) : (
            <p className="py-1 text-xs text-muted">Fix the offer rules to see estimates.</p>
          )}
        </Group>
      </div>
      <p className="mt-4 rounded-lg bg-bg/50 px-3 py-2 text-[11px] leading-relaxed text-muted">
        Simulated outcomes come later, after approval, and are generated from these same assumptions.
      </p>
    </section>
  );
}
