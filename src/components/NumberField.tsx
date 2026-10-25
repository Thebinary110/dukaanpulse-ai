import { useEffect, useId, useState } from 'react';
import { parseBounded, type Limit } from '../domain/decision';

interface NumberFieldProps {
  label: string;
  /** Current committed value, in display units (₹, %, visits). */
  value: number;
  limit: Limit;
  onCommit: (value: number) => void;
  hint?: string;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Validated numeric input. Valid entries commit immediately; invalid ones show an
 * error and are never committed, so dependent figures never see NaN or out-of-range values.
 * On blur, an invalid entry reverts to the last valid value.
 */
export function NumberField({ label, value, limit, onCommit, hint, disabled, compact }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error === null) setText(String(value));
  }, [value, error]);

  const prefix = limit.unit === '₹' ? '₹' : null;
  const suffix = limit.unit === '%' ? '%' : null;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={`block text-xs text-muted ${compact ? 'sr-only' : 'mb-1.5'}`}>
        {label}
      </label>
      <div
        className={`flex h-9 items-center rounded-lg border bg-bg/60 px-2.5 text-sm transition-colors focus-within:border-accent ${
          error ? 'border-danger' : 'border-border-strong'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        {prefix && <span className="mr-1 text-muted">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const parsed = parseBounded(next, limit);
            if (parsed.ok) {
              setError(null);
              onCommit(parsed.value);
            } else {
              setError(parsed.error);
            }
          }}
          onBlur={() => {
            if (error !== null) {
              setError(null);
              setText(String(value));
            }
          }}
          className="w-full min-w-0 bg-transparent text-text tabular outline-none"
        />
        {suffix && <span className="ml-1 text-muted">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
