import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { queryEvidence, signalStatus, type EvidenceFilter, type EvidenceSortKey, type SignalStatus, type SortDirection } from '../../domain/detectors/evidence';
import type { ScoredRegular } from '../../domain/detectors/lapsedRegulars';
import { formatChance, formatCount, formatDays } from '../../domain/format';
import { shortDateLabel } from '../../domain/time';
import type { LapsedDetectorConfig } from '../../domain/types';

const PAGE_SIZE = 10;

const STATUS: Record<SignalStatus, { label: string; className: string }> = {
  flagged: { label: 'Flagged', className: 'border-accent/40 bg-accent-soft text-text' },
  long_gap: { label: 'Long gap, within habit', className: 'border-border-strong text-muted' },
  active: { label: 'Visiting', className: 'border-border text-muted' },
};

interface Column {
  key: EvidenceSortKey | null;
  label: string;
  align?: 'right';
  hint?: string;
  /** Only shown on wide screens. */
  wideOnly?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'customerId', label: 'Customer' },
  { key: null, label: 'Visits', align: 'right', hint: 'Days with a payment', wideOnly: true },
  { key: 'typicalGapDays', label: 'Usually every', align: 'right' },
  { key: 'lastVisitDay', label: 'Last payment', align: 'right' },
  { key: 'currentGapDays', label: 'Absent for', align: 'right' },
  { key: 'gapProbability', label: 'Chance if unchanged', align: 'right', hint: 'Chance of an absence this long if their habit had not changed' },
  { key: null, label: 'Signal' },
];

export function EvidenceTable({ rows, config, startDate }: { rows: readonly ScoredRegular[]; config: LapsedDetectorConfig; startDate: string }) {
  const [filter, setFilter] = useState<EvidenceFilter>('flagged');
  const [sortKey, setSortKey] = useState<EvidenceSortKey>('currentGapDays');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);

  const result = queryEvidence(rows, { filter, sortKey, direction, page, pageSize: PAGE_SIZE });
  const flaggedCount = rows.filter((r) => r.flagged).length;
  const counts: Record<EvidenceFilter, number> = { flagged: flaggedCount, comparison: rows.length - flaggedCount, all: rows.length };
  const first = result.total === 0 ? 0 : (result.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(result.page * PAGE_SIZE, result.total);

  const sortBy = (key: EvidenceSortKey) => {
    if (key === sortKey) setDirection(direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setDirection(key === 'customerId' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  return (
    <div data-testid="evidence-table">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-bg/40 p-0.5" role="group" aria-label="Show customers">
          {(
            [
              ['flagged', 'Flagged'],
              ['comparison', 'Comparison'],
              ['all', 'All regulars'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text aria-pressed:bg-surface-raised aria-pressed:text-text"
            >
              {label} <span className="tabular opacity-80">{formatCount(counts[value])}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted tabular" aria-live="polite">
          {result.total === 0 ? 'No customers' : `${first}–${last} of ${formatCount(result.total)}`}
        </p>
      </div>

      <div className="relative mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Regular customers and the evidence for each, sortable by column</caption>
          <thead className="bg-surface-raised/60 text-xs text-muted">
            <tr>
              {COLUMNS.map((c) => {
                const active = c.key !== null && c.key === sortKey;
                return (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`px-2.5 py-2.5 align-bottom font-medium ${c.align === 'right' ? 'text-right' : ''} ${c.wideOnly ? 'hidden xl:table-cell' : ''}`}
                    title={c.hint}
                  >
                    {c.key ? (
                      <button
                        type="button"
                        onClick={() => sortBy(c.key!)}
                        className={`inline-flex items-center gap-1 rounded transition-colors hover:text-text ${c.align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-text' : ''}`}
                      >
                        {c.label}
                        {active ? (
                          direction === 'asc' ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          )
                        ) : (
                          <span className="size-3" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular">
            {result.rows.map((r) => {
              const status = STATUS[signalStatus(r, config)];
              return (
                <tr key={r.customerId} className="transition-colors hover:bg-surface-hover/50">
                  <td className="px-2.5 py-2 font-medium text-text">{r.customerId}</td>
                  <td className="hidden px-2.5 py-2 text-right text-muted xl:table-cell">{formatCount(r.visitDays)}</td>
                  <td className="px-2.5 py-2 text-right text-text">{formatDays(r.typicalGapDays)}</td>
                  <td className="px-2.5 py-2 text-right text-muted">{shortDateLabel(startDate, r.lastVisitDay)}</td>
                  <td className="px-2.5 py-2 text-right font-medium text-text">{formatDays(r.currentGapDays)}</td>
                  <td className="px-2.5 py-2 text-right text-muted">{formatChance(r.gapProbability)}</td>
                  <td className="px-2.5 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${status.className}`}>{status.label}</span>
                  </td>
                </tr>
              );
            })}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-muted">
                  No customers in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setPage(result.page - 1)}
          disabled={result.page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Previous
        </button>
        <span className="text-xs text-muted tabular">
          Page {result.page} of {result.pageCount}
        </span>
        <button
          type="button"
          onClick={() => setPage(result.page + 1)}
          disabled={result.page >= result.pageCount}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          Next
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
