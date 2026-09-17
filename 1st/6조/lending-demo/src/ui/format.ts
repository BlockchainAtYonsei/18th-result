/**
 * Display formatting for raw ledger values.
 *
 * Every function here is a *unit* conversion or a string trim, never a protocol
 * recomputation: drops -> XRP, 1/10th-basis-points -> percent, ripple seconds ->
 * a clock reading. The numbers themselves always come from `ledger_entry`.
 */
import { dropsToXrp } from 'xrpl';

import { RATE_SCALE_100_PERCENT } from '../xrpl/tx/loanBroker.ts';
import { rippleToUnixMs } from '../lib/rippleTime.ts';

/** The em dash the mockups use wherever a field does not exist yet. */
export const EMPTY = '—';

/**
 * Raw drops -> a decimal XRP string. `dropsToXrp` is the source of truth; the manual
 * fallback exists because a few ledger fields (`PeriodicPayment`) carry fractional
 * drops, which `dropsToXrp` rejects.
 */
export function dropsToXrpDecimal(drops: string | number | null | undefined): string | null {
  if (drops === null || drops === undefined || drops === '') {
    return null;
  }
  const raw = String(drops);
  try {
    return String(dropsToXrp(raw));
  } catch {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return (parsed / 1_000_000).toFixed(6);
  }
}

function groupIntegerPart(value: string): string {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${grouped}` : grouped;
}

export interface XrpFormatOptions {
  /** Maximum fraction digits kept. Default 6, the full drop precision. */
  maxDecimals?: number;
  /** Minimum fraction digits kept, zero-padded. Default 0. */
  minDecimals?: number;
  /** Prefix a `+` on positive values. */
  signed?: boolean;
}

/**
 * Raw drops -> the string shown on screen, e.g. `39000008` -> `39.000008`.
 * Trailing zeros beyond `minDecimals` are dropped so whole amounts stay readable.
 */
export function formatXrp(
  drops: string | number | null | undefined,
  options: XrpFormatOptions = {},
): string {
  const decimal = dropsToXrpDecimal(drops);
  if (decimal === null) {
    return EMPTY;
  }
  const maxDecimals = options.maxDecimals ?? 6;
  const minDecimals = options.minDecimals ?? 0;

  const negative = decimal.startsWith('-');
  const unsigned = negative ? decimal.slice(1) : decimal;
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.');

  let fraction = fractionRaw.slice(0, maxDecimals);
  while (fraction.length > minDecimals && fraction.endsWith('0')) {
    fraction = fraction.slice(0, -1);
  }
  while (fraction.length < minDecimals) {
    fraction += '0';
  }

  const body =
    fraction.length > 0
      ? `${groupIntegerPart(wholeRaw)}.${fraction}`
      : groupIntegerPart(wholeRaw);
  if (negative) {
    return `-${body}`;
  }
  return options.signed && body !== '0' ? `+${body}` : body;
}

/** Signed difference in drops, or null when either reading is missing. */
export function dropsDelta(
  fromDrops: string | null | undefined,
  toDrops: string | null | undefined,
): string | null {
  if (fromDrops === null || fromDrops === undefined || toDrops === null || toDrops === undefined) {
    return null;
  }
  try {
    return (BigInt(toDrops) - BigInt(fromDrops)).toString();
  } catch {
    return null;
  }
}

/** Difference of two raw drops readings, formatted with an explicit sign. */
export function formatXrpDelta(
  fromDrops: string | null | undefined,
  toDrops: string | null | undefined,
  options: XrpFormatOptions = {},
): string {
  const delta = dropsDelta(fromDrops, toDrops);
  return delta === null ? EMPTY : formatXrp(delta, { signed: true, ...options });
}

/**
 * Raw drops as a grouped integer, e.g. `78000000` -> `78,000,000 drops`.
 *
 * AC1 is judged in drops (`docs/decisions.md` D15): 60 seconds of interest on 39 XRP is
 * 8 drops, so rounding to XRP erases the very number the demo is about.
 */
export function formatDrops(
  drops: string | number | null | undefined,
  options: { signed?: boolean; unit?: boolean } = {},
): string {
  if (drops === null || drops === undefined || drops === '') {
    return EMPTY;
  }
  const raw = String(drops);
  if (!/^-?\d+$/.test(raw)) {
    return EMPTY;
  }
  const grouped = groupIntegerPart(raw);
  const signed = options.signed && !raw.startsWith('-') && raw !== '0' ? `+${grouped}` : grouped;
  return options.unit === false ? signed : `${signed} drops`;
}

/** `10000` (1/10th basis points) -> `10%`. */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return EMPTY;
  }
  const percent = (rate / RATE_SCALE_100_PERCENT) * 100;
  return `${Math.round(percent * 1000) / 1000}%`;
}

/** Seconds -> `m:ss`, the countdown format the mockups use. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Milliseconds -> `m분 s초`, used for the AC4 stopwatch line. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

/** Ripple seconds -> a local `HH:MM:SS` clock reading. */
export function formatRippleClock(rippleSeconds: number | null | undefined): string {
  if (
    rippleSeconds === null ||
    rippleSeconds === undefined ||
    !Number.isFinite(rippleSeconds) ||
    rippleSeconds === 0
  ) {
    return EMPTY;
  }
  const date = new Date(rippleToUnixMs(rippleSeconds));
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function shortAddress(address: string | null | undefined): string {
  if (!address) {
    return EMPTY;
  }
  return address.length <= 12 ? address : `${address.slice(0, 5)}…${address.slice(-4)}`;
}

export function shortHash(hash: string | null | undefined): string {
  if (!hash) {
    return EMPTY;
  }
  return hash.length <= 12 ? hash : `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

export function formatLedgerIndex(index: number | null | undefined): string {
  if (index === null || index === undefined || !Number.isFinite(index)) {
    return EMPTY;
  }
  return groupIntegerPart(String(Math.trunc(index)));
}

/** Read a ledger field as a string, or null when the field is absent. */
export function rawField(record: Record<string, unknown> | null, name: string): string | null {
  if (!record) {
    return null;
  }
  const value = record[name];
  return value === undefined || value === null ? null : String(value);
}

/** Read a ledger field as a number, or null when the field is absent. */
export function rawNumber(record: Record<string, unknown> | null, name: string): number | null {
  const value = rawField(record, name);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * An amount field that rippled omits when it is zero (`AssetsTotal`,
 * `CoverAvailable`, `LossUnrealized`, ...). Absent reads as `'0'` once the object
 * itself exists.
 */
export function amountField(record: Record<string, unknown> | null, name: string): string | null {
  if (!record) {
    return null;
  }
  return rawField(record, name) ?? '0';
}

/**
 * Vault shares as a bare grouped integer, e.g. `78000000` -> `78,000,000`.
 *
 * The ledger panel is 320px wide and a "이전 값 → 현재 값" diff prints the number twice,
 * so neither the `shares` unit nor the `(= N XRP)` tail that `formatShares` adds fits
 * there. The row key names the unit, and `Vault.AssetsTotal` sits a few rows above in
 * XRP, so nothing is lost.
 */
export function formatShareCount(shares: string | number | null | undefined): string {
  if (shares === null || shares === undefined || shares === '') {
    return EMPTY;
  }
  const raw = String(shares);
  if (!/^\d+$/.test(raw)) {
    return raw;
  }
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Vault share balance (MPT units; 1 share == 1 drop of the asset at issuance) ->
 * `78,000,000 shares (= 78 XRP)`. Keeps the raw unit visible next to the XRP-equivalent.
 */
export function formatShares(shares: string | number | null | undefined): string {
  if (shares === null || shares === undefined || shares === '') {
    return EMPTY;
  }
  const raw = String(shares);
  if (!/^\d+$/.test(raw)) {
    return raw;
  }
  const grouped = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped} shares (= ${formatXrp(raw)} XRP)`;
}
