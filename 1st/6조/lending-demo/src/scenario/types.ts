/**
 * Frozen scenario-engine contract (P0). See `docs/interfaces-frozen.md`.
 *
 * The engine is runtime-agnostic: the Node runner (`scripts/run-scenario.ts`) and the
 * browser app share every type here. The only injected difference is `SignerProvider`.
 */
import type { Client } from 'xrpl';
import type { Signer, SignerProvider } from '../wallet/types.ts';
import type { TxResult } from '../xrpl/submit.ts';

export type Role = 'depositor' | 'broker' | 'borrower';

export const ROLES: readonly Role[] = ['depositor', 'broker', 'borrower'];

/** Per-step lifecycle. `Resigning` is entered only after LastLedgerSequence expiry. */
export type StepState =
  | 'Pending'
  | 'Gated'
  | 'Signing'
  | 'Confirming'
  | 'Resigning'
  | 'Succeeded'
  | 'Failed';

export type EngineState = 'Landing' | 'Ready' | 'Running' | 'Done';

/**
 * Id of a stage flow path. P4 narrows this to a literal union once
 * `src/ui/stage/flowPaths.tsx` exists; the engine never dereferences it.
 */
export type FlowPathId = string;

/** Amounts are XRP drops as decimal strings; rates are rippled integer permille/percent. */
export interface ScenarioParams {
  /** VaultDeposit amount, drops. */
  depositDrops: string;
  /** LoanSet PrincipalRequested, drops. */
  principalDrops: string;
  /** LoanBrokerCoverDeposit amount, drops. */
  coverDrops: string;
  /** LoanBrokerSet CoverRateMinimum, 1/10 basis point (100_000 == 100%, docs/decisions.md D7). */
  coverRateMinimum: number;
  /** LoanBrokerSet CoverRateLiquidation, 1/10 basis point (100_000 == 100%). */
  coverRateLiquidation: number;
  /** LoanSet InterestRate, 1/10 basis point (100_000 == 100%). */
  interestRate: number;
  /** LoanSet PaymentInterval, seconds. */
  paymentInterval: number;
  /** LoanSet GracePeriod, seconds. */
  gracePeriod: number;
  /** LoanSet PaymentTotal, number of scheduled payments. */
  paymentTotal: number;
  /**
   * Seconds between VaultCreate and the vault's `SubscriptionDate`. Deposits are
   * only accepted inside this window (P1: `LendingProtocolV1_1` forces a
   * closed-ended vault, see `docs/decisions.md` D9).
   */
  subscriptionLeadSeconds: number;
  /**
   * `RedemptionDate - SubscriptionDate`. The protocol floor is 180s, and shares
   * cannot be redeemed until it elapses, so this dominates the demo's wall time.
   */
  investmentPeriodSeconds: number;
}

export interface TxLogEntry {
  /** Unix milliseconds, client clock. Display only. */
  at: number;
  level: 'info' | 'warn' | 'error';
  stepId: string;
  message: string;
  hash?: string;
  explorerUrl?: string | null;
  /** Raw rippled payload kept verbatim for the evidence panel. */
  raw?: unknown;
}

/**
 * A read-only view of the ledger. Every number is the raw rippled string; the app
 * never recomputes protocol values, it only displays them.
 */
export interface LedgerSnapshot {
  fetchedAtLedger: number;
  vault: Record<string, unknown> | null;
  loanBroker: Record<string, unknown> | null;
  loan: Record<string, unknown> | null;
  /** XRP balances in drops, keyed by role. */
  xrpBalances: Record<Role, string>;
  /** Vault share MPToken balances, keyed by role. */
  shareBalances: Record<Role, string>;
}

export interface ScenarioCtx {
  client: Client;
  signers: SignerProvider;
  accounts: Record<Role, string>;
  params: ScenarioParams;
  ids: { vault?: string; loanBroker?: string; loan?: string };
  /** Pre-funded localKeypair account used by the one-shot depositor downgrade. */
  fallbackDepositor: { address: string; seed: string };
  /** Replaced by the engine after each step's `after` hook. Never mutated in place. */
  snapshot: LedgerSnapshot | null;
  log(entry: TxLogEntry): void;
}

export interface StepGate {
  locked: boolean;
  /** Ripple time (seconds) at which the gate opens. Compared against validated close time. */
  unlockAtRipple?: number;
  /**
   * Ripple time (seconds) after which rippled will reject the step (e.g. VaultDeposit
   * once `SubscriptionDate` has passed → tecEXPIRED). The UI shows a countdown and stops
   * offering the step once the validated close time is past this instant.
   */
  deadlineRipple?: number;
}

export interface StepDef {
  id: string;
  label: string;
  description: string;
  signer: Role;
  /**
   * Second signer for a transaction that carries `CounterpartySignature`, i.e. LoanSet.
   * The engine wraps `signer` so the pair still travels the single `submit` gate.
   * Added in P1: XLS-66 requires two signatures on LoanSet (see `docs/decisions.md` D8).
   */
  coSigner?: Role;
  state: StepState;
  flowPath?: FlowPathId;
  build(ctx: ScenarioCtx): Promise<Record<string, unknown>>;
  /** Extract ids, freeze the depositor signer, and similar post-validation effects. */
  after?(ctx: ScenarioCtx, result: TxResult): Promise<void>;
  gate?(ctx: ScenarioCtx): StepGate;
  /** Returns a violation message for the tx log, or null when the invariant holds. */
  expect?(snapshot: LedgerSnapshot): string | null;
  recover?: StepDef[];
}

export type { Signer, SignerProvider, TxResult };
