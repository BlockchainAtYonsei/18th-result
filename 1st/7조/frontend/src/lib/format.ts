const numberFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
});

export function formatNumber(value: number | bigint, maximumFractionDigits = 2) {
  if (maximumFractionDigits === 0) return integerFormatter.format(value);
  return numberFormatter.format(value);
}

export function formatMUsd(value: number, maximumFractionDigits = 0) {
  return `${formatNumber(value, maximumFractionDigits)} mUSD`;
}

export function formatKoreanDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatShortDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
