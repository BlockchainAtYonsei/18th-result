/**
 * Assembles the `LedgerSnapshot` the engine hands to `expect` hooks and the UI.
 *
 * Every field is the raw rippled value. Nothing here recomputes a protocol number:
 * `AssetsTotal`, `DebtTotal` and friends are copied through as strings.
 */
import type { Client } from 'xrpl';

import type { LedgerSnapshot, Role } from '../../scenario/types.ts';
import { ROLES } from '../../scenario/types.ts';

import { readAccount } from './account.ts';
import { readLoan } from './loan.ts';
import { readLoanBroker } from './loanBroker.ts';
import { readShareBalance } from './shares.ts';
import { readVault } from './vault.ts';

export * from './account.ts';
export * from './entry.ts';
export * from './ids.ts';
export * from './loan.ts';
export * from './loanBroker.ts';
export * from './shares.ts';
export * from './vault.ts';

export interface SnapshotRequest {
  accounts: Record<Role, string>;
  ids: { vault?: string; loanBroker?: string; loan?: string };
}

/**
 * One consistent read of everything the demo displays. Called by the engine right
 * after each step's `after` hook, never by an individual step or by the UI.
 */
export async function readLedgerSnapshot(
  client: Client,
  request: SnapshotRequest,
): Promise<LedgerSnapshot> {
  const fetchedAtLedger = await client.getLedgerIndex();

  const vault = request.ids.vault ? await readVault(client, request.ids.vault) : null;
  const loanBroker = request.ids.loanBroker
    ? await readLoanBroker(client, request.ids.loanBroker)
    : null;
  const loan = request.ids.loan ? await readLoan(client, request.ids.loan) : null;

  const xrpBalances = {} as Record<Role, string>;
  const shareBalances = {} as Record<Role, string>;
  for (const role of ROLES) {
    const address = request.accounts[role];
    xrpBalances[role] = (await readAccount(client, address)).balanceDrops;
    shareBalances[role] = vault ? await readShareBalance(client, vault.shareMPTID, address) : '0';
  }

  return {
    fetchedAtLedger,
    vault: vault?.raw ?? null,
    loanBroker: loanBroker?.raw ?? null,
    loan: loan?.raw ?? null,
    xrpBalances,
    shareBalances,
  };
}
