import { describe, expect, it } from 'vitest';
import { formatBytes, formatMoney, formatNumber, formatPercent } from './numbers';

describe('number formatting', () => {
  it('writes counts in full or compact', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(12_400, true)).toBe('12.4K');
  });

  it('keeps small amounts of money visible', () => {
    expect(formatMoney(0)).toBe('0.00');
    expect(formatMoney(4.2)).toBe('4.20');
    expect(formatMoney(0.0042)).toBe('0.0042');
  });

  it('writes shares and sizes', () => {
    expect(formatPercent(0.425)).toBe('42.5%');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(3_200_000)).toBe('3.2 MB');
  });
});
