/**
 * `ScenarioCtx` construction and the small mutations the engine is allowed to make.
 *
 * Steps read the context and write only through these helpers, so the rules that
 * matter (ids are set once, the snapshot is replaced not patched) live in one place.
 */
import type { Client } from 'xrpl';

import { readLedgerSnapshot } from '../xrpl/read/index.ts';

import type {
  LedgerSnapshot,
  Role,
  ScenarioCtx,
  ScenarioParams,
  SignerProvider,
  TxLogEntry,
} from './types.ts';

export interface CreateCtxOptions {
  client: Client;
  signers: SignerProvider;
  accounts: Record<Role, string>;
  params: ScenarioParams;
  fallbackDepositor: { address: string; seed: string };
  log(entry: TxLogEntry): void;
}

export function createScenarioCtx(options: CreateCtxOptions): ScenarioCtx {
  return {
    client: options.client,
    signers: options.signers,
    accounts: { ...options.accounts },
    params: options.params,
    ids: {},
    fallbackDepositor: options.fallbackDepositor,
    snapshot: null,
    log: options.log,
  };
}

/** Set an object id exactly once. Re-setting it would silently retarget every read. */
export function setId(ctx: ScenarioCtx, key: 'vault' | 'loanBroker' | 'loan', id: string): void {
  const existing = ctx.ids[key];
  if (existing !== undefined && existing !== id) {
    throw new Error(`${key} id already set to ${existing}, refusing to overwrite with ${id}`);
  }
  ctx.ids[key] = id;
}

/** Re-read the ledger and replace `ctx.snapshot`. Called by the engine only. */
export async function refreshSnapshot(ctx: ScenarioCtx): Promise<LedgerSnapshot> {
  const snapshot = await readLedgerSnapshot(ctx.client, {
    accounts: ctx.accounts,
    ids: ctx.ids,
  });
  ctx.snapshot = snapshot;
  return snapshot;
}

/** The snapshot, asserted present. Steps that need it run after at least one refresh. */
export function requireSnapshot(ctx: ScenarioCtx): LedgerSnapshot {
  if (!ctx.snapshot) {
    throw new Error('no LedgerSnapshot yet; the engine refreshes it after every step');
  }
  return ctx.snapshot;
}

export function requireId(ctx: ScenarioCtx, key: 'vault' | 'loanBroker' | 'loan'): string {
  const id = ctx.ids[key];
  if (!id) {
    throw new Error(`${key} id is not set; the step that creates it has not succeeded yet`);
  }
  return id;
}
