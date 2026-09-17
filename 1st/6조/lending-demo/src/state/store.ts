/**
 * The browser's application state.
 *
 * A plain module store read through `useSyncExternalStore`. Everything React renders
 * lives in one immutable `AppState`; the objects that must not be copied per render -
 * the xrpl `Client`, the `ScenarioCtx`, the `SignerProvider`, the mutable `StepDef`s -
 * stay in module-scoped variables beside it.
 *
 * The engine is the same one `scripts/run-scenario.ts` drives. The only differences are
 * the injected `SignerProvider` and that the browser runs one step per click, so a gate
 * is judged twice: the UI keeps the button disabled until the validated close time
 * passes it, and `runStep` re-checks it before building the transaction.
 */
import { useSyncExternalStore } from 'react';
import type { Client } from 'xrpl';

import { DEVNET_WSS, getClient, getLatestAnchor, onLedgerAnchor } from '../xrpl/client.ts';
import type { LedgerAnchor } from '../xrpl/client.ts';
import { createScenarioCtx, refreshSnapshot } from '../scenario/ctx.ts';
import { runStepWithRecovery } from '../scenario/engine.ts';
import type { EngineOptions } from '../scenario/engine.ts';
import { buildScenarioA } from '../scenario/scenarioA.ts';
import { buildScenarioB } from '../scenario/scenarioB.ts';
import { EngineMachine } from '../scenario/machine.ts';
import type {
  EngineState,
  LedgerSnapshot,
  Role,
  ScenarioCtx,
  ScenarioParams,
  StepDef,
  StepState,
  TxLogEntry,
} from '../scenario/types.ts';
import { createBrowserSignerProvider } from '../wallet/provider.ts';
import type { SignerKind, SignerProvider } from '../wallet/types.ts';
import { dropsDelta } from '../ui/format.ts';

import { clearAccountCache, provisionAccounts } from './accounts.ts';
import {
  DEFAULT_PARAMS,
  EXPLORER_TX_URL,
  stepLabel,
  RECOVERY_SUBSCRIPTION_LEAD_SECONDS,
} from './scenarioConfig.ts';
import type { ScenarioId } from './scenarioConfig.ts';

// ---------------------------------------------------------------------------
// state shape
// ---------------------------------------------------------------------------

/**
 * Which top-level screen is on show. Orthogonal to `engineState`.
 * There is no wallet interstitial: the landing screen leads straight into the run
 * (`docs/decisions.md` D20).
 */
export type Screen = 'landing' | 'main';

export type SetupState = 'idle' | 'running' | 'done' | 'failed';

/** One rendered row of the transaction log. */
export interface TxRow {
  key: string;
  /** Submission number, or `·` for a note row that carries no transaction. */
  n: string;
  level: 'info' | 'warn' | 'error';
  stepId: string;
  txType: string;
  message: string;
  hash: string | null;
  engineResult: string | null;
  explorerUrl: string | null;
  raw: unknown;
  /** True while the transaction is signed/submitted but not yet validated. */
  pending: boolean;
}

/** A rail row backed by an engine step. */
export interface StepView {
  id: string;
  label: string;
  state: StepState;
  signer: Role;
  /** Second signer for a co-signed transaction, i.e. LoanSet (`docs/decisions.md` D8). */
  coSigner: Role | null;
  /** Set while a `recover` alternative runs in place of the original step. */
  activeLabel: string | null;
}

export interface GateInfo {
  stepId: string;
  /** Present for steps that open at an instant (LoanSet, Impair, Default, Withdraw). */
  unlockAtRipple?: number;
  /** Present for steps that close at an instant (VaultDeposit until SubscriptionDate). */
  deadlineRipple?: number;
}

export interface DepositorInfo {
  address: string | null;
  /** Always `localKeypair` now that the wallet path is gone (D20). */
  kind: SignerKind | null;
  frozen: boolean;
}

/** Raw balance readings kept so the result screen never recomputes anything. */
export interface Evidence {
  /** Depositor drops immediately before `VaultDeposit`. */
  beforeDepositDrops: string | null;
  /** Depositor drops right after `VaultDeposit` validated. */
  afterDepositDrops: string | null;
  /** Depositor drops right after `VaultWithdraw` validated. */
  afterWithdrawDrops: string | null;
  /** `Vault.AssetsTotal` immediately before the withdrawal, i.e. what the shares back. */
  assetsBeforeWithdrawDrops: string | null;
  /** `LoanBroker` / `Vault` readings either side of the default, for the loss split. */
  beforeDefault: { debtTotal: string; coverAvailable: string; assetsTotal: string } | null;
  afterDefault: { coverAvailable: string; assetsTotal: string } | null;
}

export interface AppState {
  screen: Screen;
  engineState: EngineState;
  scenarioId: ScenarioId | null;
  params: ScenarioParams;

  connected: boolean;
  anchor: LedgerAnchor | null;
  /**
   * Latest known ledger index, for display only. Seeded from `getLedgerIndex` at
   * connect time so the top bar is populated before the first `ledgerClosed` arrives,
   * then kept current by the anchor stream. Gates never read it - they need a
   * validated close time, which only a real anchor carries.
   */
  ledgerIndex: number | null;
  /** Bumped once a second so an interpolated countdown re-renders. */
  tick: number;

  setupState: SetupState;
  setupMessage: string | null;
  faucetCalls: number;

  accounts: Record<Role, string> | null;
  depositor: DepositorInfo;

  steps: StepView[];
  currentIndex: number;
  busy: boolean;
  gate: GateInfo | null;

  snapshot: LedgerSnapshot | null;
  /**
   * The snapshot as it stood *before* the step that most recently succeeded. Every
   * "이전 값 → 현재 값" diff on screen is this paired with `snapshot`; it moves forward
   * one step at a time and is null until the first step succeeds.
   */
  prevSnapshot: LedgerSnapshot | null;
  txRows: TxRow[];
  evidence: Evidence;

  error: string | null;
  /** `Date.now()` when the scenario start button was pressed (AC4 stopwatch start). */
  startedAtMs: number | null;
  /** `Date.now()` when the final step validated (AC4 stopwatch stop). */
  finishedAtMs: number | null;
}

const EMPTY_EVIDENCE: Evidence = {
  beforeDepositDrops: null,
  afterDepositDrops: null,
  afterWithdrawDrops: null,
  assetsBeforeWithdrawDrops: null,
  beforeDefault: null,
  afterDefault: null,
};

function initialState(params: ScenarioParams = DEFAULT_PARAMS): AppState {
  return {
    screen: 'landing',
    engineState: 'Landing',
    scenarioId: null,
    params,
    connected: false,
    anchor: getLatestAnchor(),
    ledgerIndex: getLatestAnchor()?.ledgerIndex ?? null,
    tick: 0,
    setupState: 'idle',
    setupMessage: null,
    faucetCalls: 0,
    accounts: null,
    depositor: {
      address: null,
      kind: null,
      frozen: false,
    },
    steps: [],
    currentIndex: 0,
    busy: false,
    gate: null,
    snapshot: null,
    prevSnapshot: null,
    txRows: [],
    evidence: EMPTY_EVIDENCE,
    error: null,
    startedAtMs: null,
    finishedAtMs: null,
  };
}

// ---------------------------------------------------------------------------
// store plumbing
// ---------------------------------------------------------------------------

let state: AppState = initialState();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---------------------------------------------------------------------------
// module-scoped runtime objects (never copied into AppState)
// ---------------------------------------------------------------------------

let client: Client | null = null;
let ctx: ScenarioCtx | null = null;
let provider: SignerProvider | null = null;
let engineSteps: StepDef[] = [];
let machine = new EngineMachine();
let unsubscribeAnchor: (() => void) | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let rowSeq = 0;
let submissionSeq = 0;

const SUBMIT_OPTIONS: NonNullable<EngineOptions['submit']> = {
  explorerTxUrl: EXPLORER_TX_URL,
  pollIntervalMs: 1_000,
  maxWaitMs: 180_000,
};

// ---------------------------------------------------------------------------
// tx log
// ---------------------------------------------------------------------------

function pushRow(row: Omit<TxRow, 'key'>): TxRow {
  rowSeq += 1;
  const created: TxRow = { ...row, key: `row-${rowSeq}` };
  set({ txRows: [created, ...state.txRows] });
  return created;
}

function updateRow(key: string, patch: Partial<TxRow>): void {
  set({
    txRows: state.txRows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
  });
}

/**
 * `ctx.log` sink. The engine's own success entry is dropped because the store already
 * owns a richer row for that submission (see `runStepInternal`); every note, `expect`
 * violation and error is kept verbatim.
 */
function handleEngineLog(entry: TxLogEntry): void {
  if (entry.level === 'info' && entry.hash) {
    return;
  }
  pushRow({
    n: '·',
    level: entry.level,
    stepId: entry.stepId,
    txType: stepLabel(entry.stepId, state.params),
    message: entry.message,
    hash: entry.hash ?? null,
    engineResult: null,
    explorerUrl: entry.explorerUrl ?? null,
    raw: entry.raw ?? null,
    pending: false,
  });
}

function pushNote(stepId: string, message: string, level: TxRow['level'] = 'info'): void {
  pushRow({
    n: '·',
    level,
    stepId,
    txType: stepId === 'setup' ? '계정 준비' : stepLabel(stepId, state.params),
    message,
    hash: null,
    engineResult: null,
    explorerUrl: null,
    raw: null,
    pending: false,
  });
}

// ---------------------------------------------------------------------------
// connection + ledger anchor
// ---------------------------------------------------------------------------

async function ensureConnected(): Promise<Client> {
  if (client?.isConnected()) {
    return client;
  }
  client = await getClient(DEVNET_WSS);
  set({ connected: true, anchor: getLatestAnchor() });

  unsubscribeAnchor?.();
  unsubscribeAnchor = onLedgerAnchor((anchor) => {
    set({ anchor, ledgerIndex: anchor.ledgerIndex });
  });

  // Devnet closes a ledger every few seconds, so the first anchor is a moment away.
  // Read the index directly for the top bar rather than showing an em dash until then.
  try {
    set({ ledgerIndex: await client.getLedgerIndex() });
  } catch {
    // Display only; the anchor stream fills it in shortly.
  }
  if (!tickTimer) {
    tickTimer = setInterval(() => {
      set({ tick: state.tick + 1 });
    }, 1_000);
  }
  return client;
}

// ---------------------------------------------------------------------------
// step bookkeeping
// ---------------------------------------------------------------------------

function currentStep(): StepDef | null {
  return engineSteps[state.currentIndex] ?? null;
}

function setStepState(index: number, next: StepState, activeLabel: string | null): void {
  set({
    steps: state.steps.map((step, i) =>
      i === index ? { ...step, state: next, activeLabel } : step,
    ),
  });
}

/**
 * Re-evaluate the current step's gate against the live context. The gate is cleared
 * when the step has none, when it is already open, or when the ledger fields it needs
 * are not readable yet - in which case the button stays enabled and `runStep` decides.
 */
function recomputeGate(): void {
  const step = currentStep();
  if (!step?.gate || !ctx) {
    set({ gate: null });
    return;
  }
  try {
    const gate = step.gate(ctx);
    const unlockAtRipple = gate.locked ? gate.unlockAtRipple : undefined;
    if (unlockAtRipple === undefined && gate.deadlineRipple === undefined) {
      set({ gate: null });
      return;
    }
    set({ gate: { stepId: step.id, unlockAtRipple, deadlineRipple: gate.deadlineRipple } });
  } catch {
    set({ gate: null });
  }
}

function recordEvidence(
  stepId: string,
  before: LedgerSnapshot | null,
  after: LedgerSnapshot,
): void {
  const evidence = { ...state.evidence };
  switch (stepId) {
    case 'vaultDeposit':
      evidence.beforeDepositDrops = before?.xrpBalances.depositor ?? null;
      evidence.afterDepositDrops = after.xrpBalances.depositor;
      break;
    case 'loanDefault':
      evidence.beforeDefault = before
        ? {
            debtTotal: String(before.loanBroker?.DebtTotal ?? '0'),
            coverAvailable: String(before.loanBroker?.CoverAvailable ?? '0'),
            assetsTotal: String(before.vault?.AssetsTotal ?? '0'),
          }
        : null;
      evidence.afterDefault = {
        coverAvailable: String(after.loanBroker?.CoverAvailable ?? '0'),
        assetsTotal: String(after.vault?.AssetsTotal ?? '0'),
      };
      break;
    case 'vaultWithdraw':
      evidence.assetsBeforeWithdrawDrops = String(before?.vault?.AssetsTotal ?? '0');
      evidence.afterWithdrawDrops = after.xrpBalances.depositor;
      break;
    default:
      break;
  }
  set({ evidence });
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

/**
 * Open the devnet connection without starting a scenario, so the landing screen shows
 * a live ledger index and a failure to reach devnet surfaces before the first click.
 */
export function connect(): void {
  void ensureConnected().catch((error: unknown) => {
    set({ error: describe(error) });
  });
}

export function setParams(params: ScenarioParams): void {
  if (state.engineState !== 'Landing') {
    return;
  }
  set({ params });
}

/**
 * Landing -> the run itself. The AC4 stopwatch starts here, on the button the
 * acceptance criterion names ("시나리오 시작 버튼 클릭부터 Result 화면"). There is no
 * wallet interstitial any more (`docs/decisions.md` D20), so this goes straight into
 * faucet account provisioning.
 */
export async function startScenario(scenarioId: ScenarioId): Promise<void> {
  if (state.setupState === 'running') {
    return;
  }
  set({
    scenarioId,
    error: null,
    startedAtMs: Date.now(),
    finishedAtMs: null,
  });
  await beginSetup();
}

/**
 * Recovery for a VaultDeposit that validated `tecEXPIRED`: the closed-ended vault's
 * subscription window closed before the deposit landed, e.g. because the presenter
 * paused between clicks. A new vault with a
 * longer window is the only way forward (SubscriptionDate is fixed at VaultCreate), so
 * rewind to VaultCreate with a longer lead and keep everything else (accounts, signer).
 */
export function restartFromVaultCreate(): void {
  const activeCtx = ctx;
  if (state.busy || !activeCtx) {
    return;
  }
  const createIndex = engineSteps.findIndex((step) => step.id === 'vaultCreate');
  if (createIndex < 0) {
    return;
  }
  // Only a missed deposit window is cured by a longer subscription lead. A missed
  // LoanSet window (loan must mature before RedemptionDate) just needs a fresh vault.
  const missedDeposit = currentStep()?.id === 'vaultDeposit';
  const lead = missedDeposit
    ? Math.max(state.params.subscriptionLeadSeconds * 2, RECOVERY_SUBSCRIPTION_LEAD_SECONDS)
    : state.params.subscriptionLeadSeconds;
  const params = { ...state.params, subscriptionLeadSeconds: lead };
  activeCtx.params.subscriptionLeadSeconds = lead;
  for (let i = createIndex; i < engineSteps.length; i += 1) {
    engineSteps[i].state = 'Pending';
  }
  // A fresh vault means fresh object ids: `setId` refuses to overwrite an existing id
  // (a live rerun failed with "vault id already set … refusing to overwrite"), and the
  // LoanBroker/Loan ids of the abandoned vault must not leak into the new run either.
  activeCtx.ids = {};
  // Rebuild the step objects too so per-step closures (e.g. the VaultCreate schedule,
  // the LoanSet sequence capture) start clean.
  const fresh = state.scenarioId === 'B' ? buildScenarioB() : buildScenarioA();
  for (let i = createIndex; i < engineSteps.length; i += 1) {
    engineSteps[i] = fresh[i];
  }
  set({
    params,
    error: null,
    currentIndex: createIndex,
    // The vault is being rebuilt from scratch, so the old pair would diff against an
    // object that no longer exists.
    snapshot: null,
    prevSnapshot: null,
    gate: null,
    steps: state.steps.map((step, i) => (i >= createIndex ? { ...step, state: 'Pending', activeLabel: null } : step)),
  });
  pushNote(
    currentStep()?.id ?? 'vaultCreate',
    missedDeposit
      ? `예치 마감을 넘겼습니다. 예치 창 ${lead}초로 Vault를 다시 만듭니다.`
      : '대출 실행 마감(만기 + 60초가 RedemptionDate 안에 들어와야 함)을 넘겼습니다. 새 Vault로 다시 시작합니다.',
    'warn',
  );
  recomputeGate();
}

async function beginSetup(): Promise<void> {
  const scenarioId = state.scenarioId;
  if (!scenarioId || state.setupState === 'running') {
    return;
  }

  const params = state.params;
  engineSteps = scenarioId === 'B' ? buildScenarioB() : buildScenarioA();
  machine = new EngineMachine();
  submissionSeq = 0;

  set({
    screen: 'main',
    setupState: 'running',
    setupMessage: 'devnet 연결 중…',
    error: null,
    txRows: [],
    evidence: EMPTY_EVIDENCE,
    currentIndex: 0,
    snapshot: null,
    prevSnapshot: null,
    gate: null,
    steps: engineSteps.map((step) => ({
      id: step.id,
      label: stepLabel(step.id, params),
      state: step.state,
      signer: step.signer,
      coSigner: step.coSigner ?? null,
      activeLabel: null,
    })),
  });

  try {
    const connected = await ensureConnected();

    set({ setupMessage: 'faucet 계정 준비 중…' });
    const provisioned = await provisionAccounts(connected, (message) => {
      set({ setupMessage: message });
      pushNote('setup', message);
    });

    const depositorAccount = provisioned.accounts.depositor;

    provider = createBrowserSignerProvider({
      depositorSeed: depositorAccount.seed,
      brokerSeed: provisioned.accounts.broker.seed,
      borrowerSeed: provisioned.accounts.borrower.seed,
    });

    const accounts: Record<Role, string> = {
      depositor: depositorAccount.address,
      broker: provisioned.accounts.broker.address,
      borrower: provisioned.accounts.borrower.address,
    };

    ctx = createScenarioCtx({
      client: connected,
      signers: provider,
      accounts,
      params,
      // `fallbackDepositor` stays in the frozen `ScenarioCtx` contract but has nothing
      // to point at now that every role is a local keypair: `downgradeDepositorOnce`
      // throws rather than switching accounts (D20).
      fallbackDepositor: { address: depositorAccount.address, seed: depositorAccount.seed },
      log: handleEngineLog,
    });

    const snapshot = await refreshSnapshot(ctx);

    machine.to('Ready');
    set({
      engineState: machine.state,
      setupState: 'done',
      setupMessage: null,
      faucetCalls: provisioned.faucetCalls,
      accounts,
      snapshot,
      depositor: {
        address: depositorAccount.address,
        kind: provider.for('depositor').kind,
        frozen: provider.isFrozen(),
      },
    });
    recomputeGate();
  } catch (error) {
    set({ setupState: 'failed', setupMessage: null, error: describe(error) });
    pushNote('setup', describe(error), 'error');
  }
}

/** Re-run account provisioning after a faucet or connection failure. */
export async function retrySetup(): Promise<void> {
  if (state.setupState === 'running') {
    return;
  }
  set({ setupState: 'idle' });
  await beginSetup();
}

/** Run the step the rail points at. One click, one step. */
export async function runCurrentStep(): Promise<void> {
  const step = currentStep();
  if (!ctx || !provider || !step || state.busy || state.setupState !== 'done') {
    return;
  }

  const index = state.currentIndex;
  set({ busy: true, error: null });
  if (state.engineState === 'Ready') {
    machine.to('Running');
    set({ engineState: machine.state });
  }

  try {
    await runStepInternal(step, index);
    advance(index);
  } catch (error) {
    setStepState(index, 'Failed', null);
    set({ busy: false, error: describe(error) });
  }
}

/** Re-run a step that failed. `runStepWithRecovery` already tried its alternatives. */
export async function retryCurrentStep(): Promise<void> {
  if (state.busy) {
    return;
  }
  set({ error: null });
  await runCurrentStep();
}

function advance(index: number): void {
  const nextIndex = index + 1;
  const done = nextIndex >= engineSteps.length;
  set({ busy: false, currentIndex: done ? index : nextIndex });
  if (done) {
    machine.to('Done');
    set({ engineState: machine.state, gate: null, finishedAtMs: Date.now() });
  } else {
    recomputeGate();
  }
}

async function runStepInternal(step: StepDef, index: number): Promise<void> {
  const activeCtx = ctx;
  if (!activeCtx) {
    throw new Error('ScenarioCtx is not ready');
  }

  const before = activeCtx.snapshot;
  submissionSeq += 1;
  const row = pushRow({
    n: String(submissionSeq),
    level: 'info',
    stepId: step.id,
    txType: stepLabel(step.id, state.params),
    message: '서명 대기',
    hash: null,
    engineResult: null,
    explorerUrl: null,
    raw: null,
    pending: true,
  });

  const options: EngineOptions = {
    submit: SUBMIT_OPTIONS,
    gatePollMs: 1_000,
    hooks: {
      onStepStart: (active) => {
        setStepState(index, active.state, active.id === step.id ? null : active.label);
      },
      onStepState: (active, nextState) => {
        setStepState(index, nextState, active.id === step.id ? null : active.label);
        if (nextState === 'Resigning') {
          updateRow(row.key, { message: '만료 후 재서명 대기' });
        }
      },
      onGateTick: (active, _remaining, unlockAtRipple) => {
        set({ gate: { stepId: active.id, unlockAtRipple } });
      },
      onSnapshot: (snapshot) => {
        set({ snapshot });
      },
    },
  };

  try {
    const outcome = await runStepWithRecovery(activeCtx, step, options);
    updateRow(row.key, {
      txType: stepLabel(outcome.step.id, state.params),
      message: outcome.step.label,
      hash: outcome.result.hash,
      engineResult: outcome.result.engineResult,
      explorerUrl: outcome.result.explorerUrl,
      raw: outcome.result.meta,
      pending: false,
    });
    recordEvidence(step.id, before, outcome.snapshot);
    setStepState(index, 'Succeeded', null);
    // `before` is the snapshot this step started from. Pairing it with the new one is
    // what the screen renders as "이전 값 → 현재 값"; it stays put until the next step
    // succeeds, at which point the pair moves forward together.
    set({
      snapshot: outcome.snapshot,
      prevSnapshot: before,
      depositor: { ...state.depositor, frozen: provider?.isFrozen() ?? false },
    });
  } catch (error) {
    updateRow(row.key, {
      level: 'error',
      message: describe(error),
      engineResult: 'failed',
      pending: false,
    });
    throw error;
  }
}

/**
 * Back to the landing screen with a fresh engine and a fresh signer provider, so the
 * depositor freeze resets and the next run creates a new Vault/LoanBroker/Loan. The
 * diff baseline (`prevSnapshot`) is cleared with it. Accounts are deliberately kept:
 * `provisionAccounts` reuses them and calls the faucet again only when a balance has
 * fallen below what is needed.
 */
export function resetAll(): void {
  ctx = null;
  provider = null;
  engineSteps = [];
  machine = new EngineMachine();
  submissionSeq = 0;
  state = {
    ...initialState(state.params),
    connected: state.connected,
    anchor: state.anchor,
    ledgerIndex: state.ledgerIndex,
  };
  emit();
}

/** Drop the cached faucet accounts as well, forcing brand-new ones on the next run. */
export function resetAllAndForgetAccounts(): void {
  clearAccountCache();
  resetAll();
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// selectors
// ---------------------------------------------------------------------------

/** The engine step the action button will run. */
export function selectCurrentStepId(s: AppState): string | null {
  return s.steps[s.currentIndex]?.id ?? null;
}

export function selectAllSucceeded(s: AppState): boolean {
  return s.steps.length > 0 && s.steps.every((step) => step.state === 'Succeeded');
}

/** Net drops the depositor's account moved across the whole run. */
export function selectNetDepositorDrops(s: AppState): string | null {
  return dropsDelta(s.evidence.beforeDepositDrops, s.evidence.afterWithdrawDrops);
}
