/**
 * `gateUnlocked` boundary behaviour, `displayRemaining` interpolation with a fake
 * `perfNow`, and `defaultUnlockAtRipple` against the real Loan object measured on
 * devnet in `.omc/artifacts/run-B.json` (`NextPaymentDueDate` 842379391,
 * `GracePeriod` 60). Per `docs/decisions.md` D11, rippled compares strictly, so the
 * gate opens only at `due + grace + 1`, never at `due + grace` itself.
 */
import { describe, expect, it } from 'vitest';
import { defaultUnlockAtRipple, displayRemaining, gateUnlocked } from '../countdown.ts';

describe('gateUnlocked', () => {
  const unlockAt = 1_000;

  it('is locked one second before the unlock time', () => {
    expect(gateUnlocked(unlockAt, unlockAt - 1)).toBe(false);
  });

  it('is unlocked exactly at the unlock time (inclusive boundary)', () => {
    expect(gateUnlocked(unlockAt, unlockAt)).toBe(true);
  });

  it('is unlocked one second after the unlock time', () => {
    expect(gateUnlocked(unlockAt, unlockAt + 1)).toBe(true);
  });

  it('gates the run-B.json default step using defaultUnlockAtRipple (due + grace + 1)', () => {
    const dueDate = 842379391; // run-B.json Loan.NextPaymentDueDate
    const gracePeriod = 60; // run-B.json Loan.GracePeriod
    const unlock = defaultUnlockAtRipple(dueDate, gracePeriod);
    expect(gateUnlocked(unlock, unlock - 1)).toBe(false);
    expect(gateUnlocked(unlock, unlock)).toBe(true);
  });
});

describe('displayRemaining', () => {
  const anchor = { ledgerTime: 1_000, perfNow: 5_000 };

  it('returns the full remaining time at the anchor instant', () => {
    expect(displayRemaining(anchor, 1_060, anchor.perfNow)).toBe(60);
  });

  it('interpolates using a fake perfNow that has advanced by 10 real seconds', () => {
    const fakePerfNow = anchor.perfNow + 10_000; // +10s of wall-clock progress
    expect(displayRemaining(anchor, 1_060, fakePerfNow)).toBe(50);
  });

  it('never goes negative once the unlock instant has passed', () => {
    const fakePerfNow = anchor.perfNow + 120_000; // +120s, well past the 60s target
    expect(displayRemaining(anchor, 1_060, fakePerfNow)).toBe(0);
  });

  it('treats a perfNow before the anchor as zero elapsed, not negative elapsed', () => {
    const fakePerfNow = anchor.perfNow - 5_000; // clock skew / stale anchor
    expect(displayRemaining(anchor, 1_060, fakePerfNow)).toBe(60);
  });

  it('is exactly zero at the unlock instant', () => {
    const fakePerfNow = anchor.perfNow + 60_000;
    expect(displayRemaining(anchor, 1_060, fakePerfNow)).toBe(0);
  });
});

describe('defaultUnlockAtRipple', () => {
  it('is due + grace + 1, using the run-B.json Loan object', () => {
    const dueDate = 842379391;
    const gracePeriod = 60;
    expect(defaultUnlockAtRipple(dueDate, gracePeriod)).toBe(dueDate + gracePeriod + 1);
    expect(defaultUnlockAtRipple(dueDate, gracePeriod)).toBe(842379452);
  });
});
