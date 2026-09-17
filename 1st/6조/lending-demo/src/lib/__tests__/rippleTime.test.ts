/**
 * Ripple epoch <-> Unix epoch round trips.
 *
 * Fixture timestamps are the real `StartDate` / `NextPaymentDueDate` measured on
 * devnet in `.omc/artifacts/run-B.json` (scenario B, latest run): `StartDate`
 * 842379331, `NextPaymentDueDate` 842379391 (`GracePeriod`/`PaymentInterval` 60s
 * apart, matching the loan's own arithmetic). RIPPLE_EPOCH_OFFSET_SECONDS is the
 * seconds between 1970-01-01 and 2000-01-01 (946684800), verified against the
 * known ripple epoch instant 2000-01-01T00:00:00Z.
 */
import { describe, expect, it } from 'vitest';
import {
  RIPPLE_EPOCH_OFFSET_SECONDS,
  nowRippleSeconds,
  rippleToIso,
  rippleToUnixMs,
  rippleToUnixSeconds,
  unixMsToRippleSeconds,
  unixToRippleSeconds,
} from '../rippleTime.ts';

const RUN_B_START_DATE = 842379331;
const RUN_B_NEXT_PAYMENT_DUE_DATE = 842379391;

describe('RIPPLE_EPOCH_OFFSET_SECONDS', () => {
  it('is exactly the gap between the Unix epoch and 2000-01-01T00:00:00Z', () => {
    const rippleEpochUnixMs = Date.UTC(2000, 0, 1, 0, 0, 0);
    expect(RIPPLE_EPOCH_OFFSET_SECONDS).toBe(rippleEpochUnixMs / 1000);
  });
});

describe('rippleToUnixSeconds / unixToRippleSeconds round trip', () => {
  it('round-trips ripple second 0 (the ripple epoch instant)', () => {
    const unix = rippleToUnixSeconds(0);
    expect(unix).toBe(RIPPLE_EPOCH_OFFSET_SECONDS);
    expect(unixToRippleSeconds(unix)).toBe(0);
  });

  it('round-trips run-B.json StartDate', () => {
    const unix = rippleToUnixSeconds(RUN_B_START_DATE);
    expect(unixToRippleSeconds(unix)).toBe(RUN_B_START_DATE);
  });

  it('round-trips run-B.json NextPaymentDueDate', () => {
    const unix = rippleToUnixSeconds(RUN_B_NEXT_PAYMENT_DUE_DATE);
    expect(unixToRippleSeconds(unix)).toBe(RUN_B_NEXT_PAYMENT_DUE_DATE);
  });

  it('recovers PaymentInterval (60s) as a difference across the round trip', () => {
    const startUnix = rippleToUnixSeconds(RUN_B_START_DATE);
    const dueUnix = rippleToUnixSeconds(RUN_B_NEXT_PAYMENT_DUE_DATE);
    expect(dueUnix - startUnix).toBe(60);
    const startBack = unixToRippleSeconds(startUnix);
    const dueBack = unixToRippleSeconds(dueUnix);
    expect(dueBack - startBack).toBe(60);
  });

  it('throws RangeError on non-finite input', () => {
    expect(() => rippleToUnixSeconds(Number.NaN)).toThrow(RangeError);
    expect(() => unixToRippleSeconds(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('rippleToUnixMs / unixMsToRippleSeconds round trip', () => {
  it('round-trips run-B.json StartDate through milliseconds', () => {
    const ms = rippleToUnixMs(RUN_B_START_DATE);
    expect(ms).toBe(rippleToUnixSeconds(RUN_B_START_DATE) * 1000);
    expect(unixMsToRippleSeconds(ms)).toBe(RUN_B_START_DATE);
  });

  it('rounds sub-second millisecond input to the nearest ripple second', () => {
    const ms = rippleToUnixMs(RUN_B_NEXT_PAYMENT_DUE_DATE) + 400;
    expect(unixMsToRippleSeconds(ms)).toBe(RUN_B_NEXT_PAYMENT_DUE_DATE);
  });
});

describe('rippleToIso', () => {
  it('renders run-B.json NextPaymentDueDate as the ISO string recorded in the run log', () => {
    // .omc/artifacts/run-B.json literally logs this as
    // "Loan.NextPaymentDueDate    842379391 (2026-09-10T18:16:31.000Z)"
    expect(rippleToIso(RUN_B_NEXT_PAYMENT_DUE_DATE)).toBe('2026-09-10T18:16:31.000Z');
  });

  it('renders ripple second 0 as the ripple epoch instant', () => {
    expect(rippleToIso(0)).toBe('2000-01-01T00:00:00.000Z');
  });
});

describe('nowRippleSeconds', () => {
  it('is display-only wall-clock time, consistent with unixMsToRippleSeconds(Date.now())', () => {
    const before = unixMsToRippleSeconds(Date.now());
    const now = nowRippleSeconds();
    const after = unixMsToRippleSeconds(Date.now());
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
