/**
 * `ledger_entry` reader for the `Vault` object (XLS-65).
 *
 * The object is addressed by its index; `ledger_entry` has no `vault` shortcut in
 * xrpl.js 5.1.0, so the id must come from `read/ids.ts`.
 */
import type { Client } from 'xrpl';

import { readLedgerEntry } from './entry.ts';

export interface VaultView {
  raw: Record<string, unknown>;
  /** Total assets backing the shares, drops for an XRP vault. */
  assetsTotal: string;
  /** Assets not currently lent out. */
  assetsAvailable: string;
  /** Paper loss registered by impairment. */
  lossUnrealized: string;
  /** MPT issuance id of the vault shares. */
  shareMPTID: string;
  account: string;
  owner: string;
  /** 0 open-ended, 1 closed-ended. Absent on pre-V1.1 vaults, read as 0. */
  vaultKind: number;
  /** Ripple seconds. 0 on an open-ended vault. */
  subscriptionDate: number;
  redemptionDate: number;
}

/**
 * Lifecycle phase of a closed-ended vault. Deposits are Subscription-only, loan
 * origination is Investment-only, and redemption waits for the Redemption phase; an
 * open-ended vault has no phase at all.
 */
export type VaultPhase = 'NoPhase' | 'Subscription' | 'Investment' | 'Redemption';

export const VAULT_KIND_OPEN_ENDED = 0;
export const VAULT_KIND_CLOSED_ENDED = 1;

/**
 * Phase at a given validated close time. The boundaries mirror rippled exactly:
 * Investment starts strictly after `SubscriptionDate`, Redemption starts at
 * `RedemptionDate` inclusive.
 */
export function vaultPhaseAt(vault: VaultView, closeTime: number): VaultPhase {
  if (vault.vaultKind !== VAULT_KIND_CLOSED_ENDED) {
    return 'NoPhase';
  }
  if (closeTime <= vault.subscriptionDate) {
    return 'Subscription';
  }
  return closeTime >= vault.redemptionDate ? 'Redemption' : 'Investment';
}

/** First ripple second at which the vault is certainly out of its Subscription phase. */
export function investmentOpensAtRipple(vault: VaultView): number {
  return vault.subscriptionDate + 1;
}

/** First ripple second at which redemption is allowed. */
export function redemptionOpensAtRipple(vault: VaultView): number {
  return vault.redemptionDate;
}

function str(record: Record<string, unknown>, field: string, fallback = '0'): string {
  const value = record[field];
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

export async function readVault(client: Client, vaultId: string): Promise<VaultView | null> {
  const node = await readLedgerEntry(client, vaultId);
  if (!node) {
    return null;
  }
  if (node.LedgerEntryType !== 'Vault') {
    throw new Error(`ledger entry ${vaultId} is a ${String(node.LedgerEntryType)}, not a Vault`);
  }
  const shareMPTID = node.ShareMPTID;
  if (typeof shareMPTID !== 'string') {
    throw new Error(`Vault ${vaultId} has no ShareMPTID; cannot locate the share MPToken`);
  }
  return {
    raw: node,
    assetsTotal: str(node, 'AssetsTotal'),
    assetsAvailable: str(node, 'AssetsAvailable'),
    lossUnrealized: str(node, 'LossUnrealized'),
    shareMPTID,
    account: str(node, 'Account', ''),
    owner: str(node, 'Owner', ''),
    vaultKind: Number(str(node, 'VaultKind')),
    subscriptionDate: Number(str(node, 'SubscriptionDate')),
    redemptionDate: Number(str(node, 'RedemptionDate')),
  };
}
