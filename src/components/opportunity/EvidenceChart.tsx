import { useId } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { flaggingGapDays } from '../../domain/detectors/evidence';
import type { ScoredRegular } from '../../domain/detectors/lapsedRegulars';
import { formatCount, formatDays } from '../../domain/format';
import type { LapsedDetectorConfig } from '../../domain/types';

interface Point {
  id: string;
  usual: number;
  gap: number;
  flagged: boolean;
}

function PointTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const p = payload?.[0]?.payload as Point | undefined;
  if (!active || !p || !('id' in p)) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-xs shadow-xl shadow-black/40">
      <p className="font-semibold text-text">{p.id}</p>
      <p className="mt-0.5 text-muted">
        Usually every <span className="text-text tabular">{formatDays(p.usual)}</span>
      </p>
      <p className="text-muted">
        Last paid <span className="text-text tabular">{formatDays(p.gap)}</span> ago
      </p>
      <p className="mt-1 text-muted">{p.flagged ? 'Flagged: unusually long absence' : 'Not flagged'}</p>
    </div>
  );
}

/**
 * Each regular customer: usual interval between visits (x) against days since their last
 * payment (y). The dashed line is the detector's flag line for that usual interval.
 */
export function EvidenceChart({ rows, config }: { rows: readonly ScoredRegular[]; config: LapsedDetectorConfig }) {
  const titleId = useId();
  const points: Point[] = rows.map((r) => ({ id: r.customerId, usual: r.typicalGapDays, gap: r.currentGapDays, flagged: r.flagged }));
  const flagged = points.filter((p) => p.flagged);
  const others = points.filter((p) => !p.flagged);

  const minX = Math.max(1, Math.floor(Math.min(...points.map((p) => p.usual)) * 2) / 2);
  const maxX = Math.ceil(Math.max(...points.map((p) => p.usual)) * 2) / 2;
  const maxY = Math.ceil(Math.max(...points.map((p) => p.gap), flaggingGapDays(maxX, config)) / 10) * 10;
  const boundary = Array.from({ length: Math.round((maxX - minX) / 0.05) + 1 }, (_, i) => {
    const usual = minX + i * 0.05;
    return { usual, boundary: flaggingGapDays(usual, config) };
  });

  return (
    <figure aria-labelledby={titleId} className="flex h-full flex-col" data-testid="evidence-chart">
      <figcaption id={titleId}>
        <span className="block text-sm font-semibold text-text">Usual visit interval vs current absence</span>
        <span className="block text-xs text-muted">One dot per regular customer, from their own payment history</span>
      </figcaption>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-series-current" aria-hidden="true" />
          Flagged ({formatCount(flagged.length)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-series-comparison" aria-hidden="true" />
          Not flagged ({formatCount(others.length)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-muted" aria-hidden="true" />
          Flag line
        </span>
      </div>
      <div
        className="mt-2 h-72 min-h-64 flex-1"
        role="img"
        aria-label={`Scatter chart: ${flagged.length} flagged customers sit above the flag line; ${others.length} others sit below it. The table below lists every customer.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 12, bottom: 20, left: 4 }}>
            <CartesianGrid stroke="var(--dp-grid)" />
            <XAxis
              type="number"
              dataKey="usual"
              domain={[minX, maxX]}
              tickCount={6}
              tickFormatter={(v: number) => `${v}`}
              tick={{ fill: 'var(--dp-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--dp-border)' }}
              tickLine={false}
              allowDuplicatedCategory={false}
              label={{ value: 'Usually visits every … days', position: 'insideBottom', offset: -14, fill: 'var(--dp-muted)', fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="gap"
              domain={[0, maxY]}
              tick={{ fill: 'var(--dp-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
              label={{ value: 'Days since last payment', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--dp-muted)', fontSize: 12, dy: 70 }}
            />
            <Tooltip shared={false} cursor={{ stroke: 'var(--dp-border-strong)', strokeDasharray: '0' }} content={(p) => <PointTooltip {...(p as TooltipContentProps<number, string>)} />} />
            <Line
              data={boundary}
              dataKey="boundary"
              type="stepAfter"
              stroke="var(--dp-muted)"
              strokeDasharray="4 4"
              strokeWidth={1.25}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              tooltipType="none"
            />
            <Scatter data={others} fill="var(--dp-series-comparison)" fillOpacity={0.75} isAnimationActive={false} shape="circle" />
            <Scatter
              data={flagged}
              fill="var(--dp-series-current)"
              stroke="var(--dp-surface)"
              strokeWidth={1.5}
              isAnimationActive={false}
              shape="circle"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
