// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatCurrency, formatPct, formatR, formatDuration } from './formatters';

describe('formatters', () => {
  it('formats currency with sign and 2 decimals', () => {
    expect(formatCurrency(1234.5)).toBe('+$1,234.50');
    expect(formatCurrency(-42.1)).toBe('-$42.10');
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats percentages and R-multiples', () => {
    expect(formatPct(12.345)).toBe('+12.35%');
    expect(formatPct(-3.2)).toBe('-3.20%');
    expect(formatR(2.5)).toBe('+2.50R');
    expect(formatR(-1.1)).toBe('-1.10R');
  });

  it('formats durations cleanly', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(240)).toBe('4m');
    expect(formatDuration(7260)).toBe('2h 1m');
  });
});
