import { describe, expect, it } from 'vitest';
import { formatChance, formatCount, formatDays, formatINR, formatPercent } from '../format';

describe('formatINR', () => {
  it.each([
    [0, '₹0'],
    [100, '₹1'],
    [99_900, '₹999'],
    [100_000, '₹1,000'],
    [12_345_600, '₹1,23,456'],
    [1_234_567_800, '₹1,23,45,678'],
    [-123_400, '−₹1,234'],
  ])('%d paise → %s', (paise, expected) => {
    expect(formatINR(paise)).toBe(expected);
  });

  it('rounds to whole rupees by default and supports decimals', () => {
    expect(formatINR(12_345)).toBe('₹123');
    expect(formatINR(12_355)).toBe('₹124');
    expect(formatINR(12_345, { decimals: 2 })).toBe('₹123.45');
    expect(formatINR(25, { decimals: 2 })).toBe('₹0.25');
  });

  it('never shows a negative zero', () => {
    expect(formatINR(-20)).toBe('₹0');
    expect(formatINR(-0)).toBe('₹0');
  });

  it('uses lakh and crore in compact mode', () => {
    expect(formatINR(81_485_500, { compact: true })).toBe('₹8.15L');
    expect(formatINR(10_000_000, { compact: true })).toBe('₹1L');
    expect(formatINR(2_500_000_000, { compact: true })).toBe('₹2.5Cr');
    expect(formatINR(1_234_500, { compact: true })).toBe('₹12.3K');
    expect(formatINR(99_900, { compact: true })).toBe('₹999');
    expect(formatINR(-15_000_000, { compact: true })).toBe('−₹1.5L');
  });

  it('can show an explicit plus sign', () => {
    expect(formatINR(50_000, { signed: true })).toBe('+₹500');
    expect(formatINR(0, { signed: true })).toBe('₹0');
    expect(formatINR(-50_000, { signed: true })).toBe('−₹500');
  });

  it('shows a dash for non-finite input', () => {
    expect(formatINR(Number.NaN)).toBe('—');
    expect(formatINR(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats fractions with sign handling', () => {
    expect(formatPercent(0.1834)).toBe('18.3%');
    expect(formatPercent(0.05, { signed: true })).toBe('+5.0%');
    expect(formatPercent(-0.05, { decimals: 0 })).toBe('−5%');
    expect(formatPercent(-0.0001)).toBe('0.0%');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('formatCount', () => {
  it('uses Indian grouping', () => {
    expect(formatCount(123_456)).toBe('1,23,456');
    expect(formatCount(-1_500)).toBe('−1,500');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatDays', () => {
  it('uses one decimal for short intervals and whole days otherwise', () => {
    expect(formatDays(2.333)).toBe('2.3 days');
    expect(formatDays(2)).toBe('2 days');
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(0.96)).toBe('1 day');
    expect(formatDays(30.4)).toBe('30 days');
    expect(formatDays(Number.NaN)).toBe('—');
  });
});

describe('formatChance', () => {
  it('floors tiny probabilities instead of showing 0.0%', () => {
    expect(formatChance(0.00004)).toBe('< 0.1%');
    expect(formatChance(0.023)).toBe('2.3%');
    expect(formatChance(0)).toBe('0.0%');
    expect(formatChance(1)).toBe('100.0%');
  });
});
