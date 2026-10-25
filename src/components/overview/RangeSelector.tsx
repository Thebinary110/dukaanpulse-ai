import { RANGE_OPTIONS, type RangeDays } from '../../domain/overview';

/** Segmented control built on native radios: arrow keys move between options. */
export function RangeSelector({ value, onChange }: { value: RangeDays; onChange: (range: RangeDays) => void }) {
  return (
    <fieldset className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      <legend className="sr-only">Date range</legend>
      {RANGE_OPTIONS.map((range) => (
        <label
          key={range}
          className="relative cursor-pointer rounded-md px-3 whitespace-nowrap py-1.5 text-sm font-medium text-muted transition-colors select-none hover:text-text has-checked:bg-surface-raised has-checked:text-text has-checked:shadow-sm has-checked:shadow-black/30 has-focus-visible:outline-2 has-focus-visible:outline-focus"
        >
          <input
            type="radio"
            name="range"
            value={range}
            checked={value === range}
            onChange={() => onChange(range)}
            className="sr-only"
          />
          {range} days
        </label>
      ))}
    </fieldset>
  );
}
