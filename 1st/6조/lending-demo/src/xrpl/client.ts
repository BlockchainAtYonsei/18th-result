/**
 * The single xrpl Client for the whole app plus the ledger anchor it publishes.
 *
 * Countdown display interpolates from an anchor (`ledgerTime` + `perfNow`) instead of
 * the wall clock, so a skewed browser clock cannot move a gate. The gate itself is
 * decided elsewhere, against the validated close time only.
 */
import { Client } from 'xrpl';
import type { LedgerStream } from 'xrpl';

export const DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233';
export const DEVNET_FAUCET_URL = 'https://faucet.devnet.rippletest.net/accounts';

export interface LedgerAnchor {
  /** Close time of the ledger, ripple seconds. Field name measured in P0: `ledger_time`. */
  ledgerTime: number;
  ledgerIndex: number;
  /** `performance.now()` sampled when the event arrived, for monotonic interpolation. */
  perfNow: number;
}

export type LedgerAnchorListener = (anchor: LedgerAnchor) => void;

let instance: Client | null = null;
let instanceUrl: string | null = null;
let pending: Promise<Client> | null = null;
let latestAnchor: LedgerAnchor | null = null;

const listeners = new Set<LedgerAnchorListener>();

function publishAnchor(ledger: LedgerStream): void {
  const anchor: LedgerAnchor = {
    ledgerTime: ledger.ledger_time,
    ledgerIndex: ledger.ledger_index,
    perfNow: performance.now(),
  };
  latestAnchor = anchor;
  for (const listener of listeners) {
    listener(anchor);
  }
}

async function subscribeLedger(client: Client): Promise<void> {
  await client.request({ command: 'subscribe', streams: ['ledger'] });
}

/**
 * Connect (or reuse) the singleton client and start the ledger subscription.
 * Calling it with a different URL than the live connection is a programming error.
 */
export async function getClient(url: string = DEVNET_WSS): Promise<Client> {
  if (instance && instance.isConnected()) {
    if (instanceUrl !== url) {
      throw new Error(`Client already connected to ${String(instanceUrl)}, refusing ${url}`);
    }
    return instance;
  }
  if (pending) {
    return pending;
  }

  pending = (async () => {
    const client = new Client(url, { timeout: 20_000 });
    client.on('ledgerClosed', publishAnchor);
    // rippled drops subscriptions across a reconnect, so re-arm on every connect.
    client.on('connected', () => {
      void subscribeLedger(client).catch(() => {
        /* the next connect retries; a missing anchor degrades display, not the gate */
      });
    });
    await client.connect();
    await subscribeLedger(client);
    instance = client;
    instanceUrl = url;
    return client;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/** Most recent ledger anchor, or null before the first `ledgerClosed` event. */
export function getLatestAnchor(): LedgerAnchor | null {
  return latestAnchor;
}

/** Subscribe to ledger anchors. Returns an unsubscribe function. */
export function onLedgerAnchor(listener: LedgerAnchorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tear the singleton down. Used by the Node runner and by test teardown. */
export async function disconnectClient(): Promise<void> {
  const client = instance;
  instance = null;
  instanceUrl = null;
  latestAnchor = null;
  listeners.clear();
  if (client?.isConnected()) {
    await client.disconnect();
  }
}
