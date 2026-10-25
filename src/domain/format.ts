/**
 * Display formatting for India: ₹ with Indian digit grouping (1,23,45,678),
 * and compact lakh/crore notation.
 */

const MINUS = '−'; // U+2212, typographic minus
const EMPTY = '—';

const groupers = new Map<number, Intl.NumberFormat>();
function grouper(fractionDigits: number): Intl.NumberFormat {
  let f = groupers.get(fractionDigits);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    groupers.set(fractionDigits, f);
  }
  return f;
}

export interface InrOptions {
  /** Decimal places for rupees (default 0). */
  decimals?: number;
  /** Use K / L / Cr suffixes for large values. */
  compact?: boolean;
  /** Prefix positive values with "+". */
  signed?: boolean;
}

function withSign(body: string, value: number, signed: boolean): string {
  if (value < 0) return `${MINUS}${body}`;
  if (signed && value > 0) return `+${body}`;
  return body;
}

/** Formats an amount in paise as rupees, e.g. 12345600 → "₹1,23,456". */
export function formatINR(paise: number, options: InrOptions = {}): string {
  if (!Number.isFinite(paise)) return EMPTY;
  const { decimals = 0, compact = false, signed = false } = options;
  const rupees = paise / 100;
  const abs = Math.abs(rupees);

  let body: string;
  if (compact && abs >= 1e7) body = `₹${trimZeros((abs / 1e7).toFixed(2))}Cr`;
  else if (compact && abs >= 1e5) body = `₹${trimZeros((abs / 1e5).toFixed(2))}L`;
  else if (compact && abs >= 1e3) body = `₹${trimZeros((abs / 1e3).toFixed(1))}K`;
  else body = `₹${grouper(decimals).format(abs)}`;

  // Avoid "−₹0" when rounding swallows a tiny negative value.
  const roundsToZero = Number(abs.toFixed(compact ? 2 : decimals)) === 0;
  return withSign(body, roundsToZero ? 0 : rupees, signed);
}

function trimZeros(fixed: string): string {
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** Formats a fraction as a percentage, e.g. 0.183 → "18.3%". */
export function formatPercent(fraction: number, options: { decimals?: number; signed?: boolean } = {}): string {
  if (!Number.isFinite(fraction)) return EMPTY;
  const { decimals = 1, signed = false } = options;
  const value = fraction * 100;
  const body = `${Math.abs(value).toFixed(decimals)}%`;
  const roundsToZero = Number(Math.abs(value).toFixed(decimals)) === 0;
  return withSign(body, roundsToZero ? 0 : value, signed);
}

/** Formats a count with Indian grouping, e.g. 123456 → "1,23,456". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return EMPTY;
  const body = grouper(0).format(Math.abs(Math.round(n)));
  return Math.round(n) < 0 ? `${MINUS}${body}` : body;
}
