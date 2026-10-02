/** A count with thousands separators, or a compact one such as `12.4k` when `compact` is set. */
export function formatNumber(value: number, compact = false): string {
  return new Intl.NumberFormat('en', {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

/**
 * An amount at the owner's prices. Prices carry no currency, so neither does the amount; small
 * amounts keep four decimals so a cheap model's spend does not read as zero.
 */
export function formatMoney(value: number): string {
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return new Intl.NumberFormat('en', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** A share between 0 and 1 as a percentage, such as `42%`. */
export function formatPercent(share: number): string {
  return new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(share);
}

/** A size in bytes, such as `3.2 MB`. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1_000 && unit < units.length - 1) {
    value /= 1_000;
    unit += 1;
  }
  return `${formatNumber(Number(value.toFixed(1)))} ${units[unit] ?? 'B'}`;
}
