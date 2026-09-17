/**
 * The single gate for every transaction: autofill -> sign -> submit -> wait for
 * validation -> recover from LastLedgerSequence expiry -> normalise the result.
 *
 * Nothing else in the app may call `submit`, `submitAndWait` or `tx` directly. Keeping
 * one gate is what makes the wallet path and the localKeypair path behave identically.
 *
 * Expiry recovery never re-submits the old blob. `LastLedgerSequence` is a signed
 * field, so the only correct recovery is re-autofill -> re-sign -> new submission,
 * and it is attempted exactly once.
 */
import type { Client, SubmittableTransaction } from 'xrpl';
import type { StepState } from '../scenario/types.ts';
import type { Signer } from '../wallet/types.ts';

export interface TxResult {
  hash: string;
  engineResult: string;
  validated: boolean;
  ledgerIndex: number;
  sequence: number;
  lastLedgerSequence: number;
  explorerUrl: string | null;
  meta: unknown;
}

export interface SubmitOptions {
  client: Client;
  explorerTxUrl?: (hash: string) => string | null;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  onNotice?: (message: string) => void;
}

export class TxSubmitError extends Error {
  readonly engineResult: string;
  readonly hash: string | null;
  constructor(engineResult: string, hash: string | null, message: string) {
    super(message);
    this.name = 'TxSubmitError';
    this.engineResult = engineResult;
    this.hash = hash;
  }
}

export class TxExpiredError extends Error {
  readonly hash: string;
  readonly lastLedgerSequence: number;
  constructor(hash: string, lastLedgerSequence: number, message: string) {
    super(message);
    this.name = 'TxExpiredError';
    this.hash = hash;
    this.lastLedgerSequence = lastLedgerSequence;
  }
}

export class TxTimeoutError extends Error {
  readonly hash: string;
  constructor(hash: string, message: string) {
    super(message);
    this.name = 'TxTimeoutError';
    this.hash = hash;
  }
}

interface TxLookup {
  validated: boolean;
  ledgerIndex: number;
  engineResult: string;
  sequence: number;
  lastLedgerSequence: number;
  meta: unknown;
}

interface SentTx {
  hash: string;
  sequence: number;
  lastLedgerSequence: number;
  provisionalEngineResult: string;
}

type WaitOutcome =
  | { status: 'validated'; lookup: TxLookup }
  | { status: 'expired' }
  | { status: 'timeout' };

const RECONCILE_WINDOW_MS = 10_000;
const RECONCILE_POLL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function toInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rippledErrorCode(error: unknown): string | null {
  const data = asRecord(asRecord(error)?.data);
  const code = data?.error;
  return typeof code === 'string' ? code : null;
}

function isImmediateFailure(engineResult: string): boolean {
  return (
    engineResult.startsWith('tem') ||
    engineResult.startsWith('tef') ||
    engineResult.startsWith('tel')
  );
}

async function lookupTx(client: Client, hash: string): Promise<TxLookup | null> {
  let response: unknown;
  try {
    response = await client.request({ command: 'tx', transaction: hash });
  } catch (error) {
    if (rippledErrorCode(error) === 'txnNotFound') {
      return null;
    }
    throw error;
  }

  const result = asRecord(asRecord(response)?.result);
  if (!result) {
    return null;
  }
  const txJson = asRecord(result.tx_json) ?? result;
  const meta = result.meta ?? result.meta_blob ?? null;
  const metaRecord = asRecord(meta);
  const engineResult = typeof metaRecord?.TransactionResult === 'string'
    ? metaRecord.TransactionResult
    : '';

  return {
    validated: result.validated === true,
    ledgerIndex: toInt(result.ledger_index),
    engineResult,
    sequence: toInt(txJson.Sequence),
    lastLedgerSequence: toInt(txJson.LastLedgerSequence),
    meta,
  };
}

async function reconcileSubmitted(
  client: Client,
  hash: string,
  fallback: { sequence: number; lastLedgerSequence: number },
  onNotice: (message: string) => void,
): Promise<SentTx> {
  const deadline = Date.now() + RECONCILE_WINDOW_MS;
  for (;;) {
    const found = await lookupTx(client, hash);
    if (found && found.lastLedgerSequence > 0) {
      return {
        hash,
        sequence: found.sequence,
        lastLedgerSequence: found.lastLedgerSequence,
        provisionalEngineResult: found.engineResult,
      };
    }
    if (Date.now() >= deadline) {
      onNotice(
        `tx ${hash} not visible ${RECONCILE_WINDOW_MS}ms after the wallet reported submission; ` +
          `falling back to the app-side LastLedgerSequence ${fallback.lastLedgerSequence}`,
      );
      return { hash, ...fallback, provisionalEngineResult: '' };
    }
    await sleep(RECONCILE_POLL_MS);
  }
}

async function signAndSend(
  tx: Record<string, unknown>,
  signer: Signer,
  opts: Required<Pick<SubmitOptions, 'client'>> & { onNotice: (message: string) => void },
): Promise<SentTx> {
  const prepared = await opts.client.autofill({ ...tx } as unknown as SubmittableTransaction);
  const preparedRecord = prepared as unknown as Record<string, unknown>;
  const fallback = {
    sequence: toInt(preparedRecord.Sequence),
    lastLedgerSequence: toInt(preparedRecord.LastLedgerSequence),
  };

  const outcome = await signer.sign(preparedRecord);

  if (outcome.mode === 'submitted') {
    return reconcileSubmitted(opts.client, outcome.hash, fallback, opts.onNotice);
  }

  const response = await opts.client.request({
    command: 'submit',
    tx_blob: outcome.txBlob,
  });
  const engineResult = response.result.engine_result;
  if (isImmediateFailure(engineResult)) {
    throw new TxSubmitError(
      engineResult,
      outcome.hash,
      `rippled rejected the submission: ${engineResult} ${response.result.engine_result_message}`,
    );
  }

  return { hash: outcome.hash, ...fallback, provisionalEngineResult: engineResult };
}

async function waitForValidation(
  client: Client,
  sent: SentTx,
  pollIntervalMs: number,
  maxWaitMs: number,
): Promise<WaitOutcome> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const found = await lookupTx(client, sent.hash);
    if (found?.validated) {
      return { status: 'validated', lookup: found };
    }

    const currentLedger = await client.getLedgerIndex();
    if (sent.lastLedgerSequence > 0 && currentLedger > sent.lastLedgerSequence) {
      const settled = await lookupTx(client, sent.hash);
      return settled?.validated ? { status: 'validated', lookup: settled } : { status: 'expired' };
    }

    if (Date.now() >= deadline) {
      const settled = await lookupTx(client, sent.hash);
      return settled?.validated ? { status: 'validated', lookup: settled } : { status: 'timeout' };
    }

    await sleep(pollIntervalMs);
  }
}

function toResult(
  sent: SentTx,
  lookup: TxLookup,
  explorerTxUrl: (hash: string) => string | null,
): TxResult {
  return {
    hash: sent.hash,
    engineResult: lookup.engineResult || sent.provisionalEngineResult,
    validated: lookup.validated,
    ledgerIndex: lookup.ledgerIndex,
    sequence: lookup.sequence || sent.sequence,
    lastLedgerSequence: lookup.lastLedgerSequence || sent.lastLedgerSequence,
    explorerUrl: explorerTxUrl(sent.hash),
    meta: lookup.meta,
  };
}

export async function submit(
  tx: Record<string, unknown>,
  signer: Signer,
  onState: (state: StepState) => void,
  opts: SubmitOptions,
): Promise<TxResult> {
  const client = opts.client;
  const explorerTxUrl = opts.explorerTxUrl ?? (() => null);
  const pollIntervalMs = opts.pollIntervalMs ?? 1_000;
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  const onNotice = opts.onNotice ?? (() => undefined);

  onState('Signing');
  const first = await signAndSend(tx, signer, { client, onNotice });

  onState('Confirming');
  const firstWait = await waitForValidation(client, first, pollIntervalMs, maxWaitMs);
  if (firstWait.status === 'validated') {
    return toResult(first, firstWait.lookup, explorerTxUrl);
  }
  if (firstWait.status === 'timeout') {
    throw new TxTimeoutError(
      first.hash,
      `tx ${first.hash} neither validated nor expired within ${maxWaitMs}ms; not re-signing`,
    );
  }

  onState('Resigning');
  const second = await signAndSend(tx, signer, { client, onNotice });

  onState('Confirming');
  const secondWait = await waitForValidation(client, second, pollIntervalMs, maxWaitMs);
  if (secondWait.status === 'validated') {
    return toResult(second, secondWait.lookup, explorerTxUrl);
  }
  if (secondWait.status === 'timeout') {
    throw new TxTimeoutError(
      second.hash,
      `re-signed tx ${second.hash} neither validated nor expired within ${maxWaitMs}ms`,
    );
  }

  throw new TxExpiredError(
    second.hash,
    second.lastLedgerSequence,
    `tx expired twice; last attempt ${second.hash} passed LastLedgerSequence ${second.lastLedgerSequence}`,
  );
}
