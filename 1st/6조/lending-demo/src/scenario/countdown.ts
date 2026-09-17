/**
 * Gate timing (R5).
 *
 * The gate and the display are deliberately separate. A gate opens only on a
 * validated ledger close time, so a skewed browser clock can never unlock a step
 * early. The countdown a user watches is interpolated from a ledger anchor plus
 * `performance.now()`, which is monotonic and needs no wall clock at all.
 */

export interface DisplayAnchor {
  /** Close time of the anchoring ledger, ripple seconds. */
  ledgerTime: number;
  /** `performance.now()` sampled when that ledger arrived. */
  perfNow: number;
}

/**
 * Is the gate open? `validatedCloseTime` must come from a validated ledger; passing
 * a wall-clock reading here would defeat the whole design.
 */
export function gateUnlocked(unlockAtRipple: number, validatedCloseTime: number): boolean {
  return validatedCloseTime >= unlockAtRipple;
}

/**
 * Seconds left until the gate opens, interpolated from the anchor. Never negative:
 * zero means "waiting on the next ledger close to confirm".
 */
export function displayRemaining(
  anchor: DisplayAnchor,
  unlockAtRipple: number,
  perfNow: number = performance.now(),
): number {
  const elapsedSeconds = Math.max(0, (perfNow - anchor.perfNow) / 1000);
  const estimatedNow = anchor.ledgerTime + elapsedSeconds;
  return Math.max(0, unlockAtRipple - estimatedNow);
}

/**
 * First ripple second at which a loan can be defaulted.
 *
 * rippled requires `NextPaymentDueDate + GracePeriod` to have *strictly* passed
 * (`ExpiryComparison::Exclusive` since `fixCleanup3_4_0`), hence the `+ 1`. Both
 * inputs are read off the Loan object, never computed locally.
 */
export function defaultUnlockAtRipple(
  nextPaymentDueDate: number,
  gracePeriod: number,
): number {
  return nextPaymentDueDate + gracePeriod + 1;
}
