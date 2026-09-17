/**
 * Ripple epoch (2000-01-01T00:00:00Z) <-> Unix epoch conversion.
 *
 * xrpl.js ships `rippleTimeToUnixTime` / `unixTimeToRippleTime`, but both work in
 * milliseconds. The ledger itself (`ledger_time`, `NextPaymentDueDate`, ...) always
 * carries *seconds* since the ripple epoch, so the countdown gate needs a
 * seconds-native API. These helpers are the single source of truth for that.
 */

/** Seconds between the Unix epoch and the Ripple epoch (0x386D4380). */
export const RIPPLE_EPOCH_OFFSET_SECONDS = 946_684_800;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, received ${String(value)}`);
  }
}

/** Ripple time (seconds) -> Unix time (seconds). */
export function rippleToUnixSeconds(rippleSeconds: number): number {
  assertFinite(rippleSeconds, 'rippleSeconds');
  return rippleSeconds + RIPPLE_EPOCH_OFFSET_SECONDS;
}

/** Unix time (seconds) -> Ripple time (seconds). */
export function unixToRippleSeconds(unixSeconds: number): number {
  assertFinite(unixSeconds, 'unixSeconds');
  return Math.round(unixSeconds) - RIPPLE_EPOCH_OFFSET_SECONDS;
}

/** Ripple time (seconds) -> Unix time (milliseconds), for `new Date(...)`. */
export function rippleToUnixMs(rippleSeconds: number): number {
  return rippleToUnixSeconds(rippleSeconds) * 1000;
}

/** Unix time (milliseconds, e.g. `Date.now()`) -> Ripple time (seconds). */
export function unixMsToRippleSeconds(unixMs: number): number {
  assertFinite(unixMs, 'unixMs');
  return Math.round(unixMs / 1000) - RIPPLE_EPOCH_OFFSET_SECONDS;
}

/** Ripple time (seconds) -> ISO-8601 string, for logs and raw panels. */
export function rippleToIso(rippleSeconds: number): string {
  return new Date(rippleToUnixMs(rippleSeconds)).toISOString();
}

/** Current wall clock as ripple time (seconds). Display only - never a gate input. */
export function nowRippleSeconds(): number {
  return unixMsToRippleSeconds(Date.now());
}
