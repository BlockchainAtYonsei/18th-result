/**
 * Frozen wallet contract (P0). See `docs/interfaces-frozen.md`.
 *
 * A Signer only signs. Submission, validation waiting, expiry recovery and result
 * normalisation all belong to `src/xrpl/submit.ts` - that boundary is what lets the
 * Node runner and the browser share one engine.
 */
import type { Role, ScenarioCtx } from '../scenario/types.ts';

export type SignerKind = 'crossmark' | 'gemwallet' | 'localKeypair';

/**
 * Two shapes exist because some browser wallets submit the transaction themselves.
 * - `blob`: the wallet returned a signed blob and the app submits it.
 * - `submitted`: the wallet already submitted; the app must reconcile Sequence and
 *   LastLedgerSequence by looking the hash up with the `tx` command before it may
 *   judge expiry, because the wallet may have run its own autofill.
 */
export type SignOutcome =
  | { mode: 'blob'; txBlob: string; hash: string }
  | { mode: 'submitted'; hash: string };

export interface Signer {
  kind: SignerKind;
  address: string;
  /**
   * Sign an already-autofilled transaction.
   * Rejection, an unsupported transaction type, or 30s of silence must all surface
   * as `SignRejectedError`.
   */
  sign(tx: Record<string, unknown>): Promise<SignOutcome>;
}

export interface SignerProvider {
  for(role: Role): Signer;
  /**
   * One-shot depositor downgrade. Switches the signer *and* `ctx.accounts.depositor`
   * to the pre-funded fallback localKeypair account at the same time, so shares and
   * the withdrawal signer can never diverge. Throws once frozen or once already used.
   */
  downgradeDepositorOnce(ctx: ScenarioCtx): void;
  /** Called right after the deposit step succeeds. Locks the depositor signer. */
  freeze(): void;
  isFrozen(): boolean;
}

/** Thrown by a Signer when the user declines, the wallet cannot sign, or it times out. */
export class SignRejectedError extends Error {
  readonly kind: SignerKind;
  readonly reason: 'rejected' | 'unsupported' | 'timeout' | 'unavailable';

  constructor(
    kind: SignerKind,
    reason: 'rejected' | 'unsupported' | 'timeout' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'SignRejectedError';
    this.kind = kind;
    this.reason = reason;
  }
}
