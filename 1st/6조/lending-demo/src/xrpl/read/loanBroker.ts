/** `ledger_entry` reader for the `LoanBroker` object (XLS-66 section 3.1). */
import type { Client } from 'xrpl';

import { readLedgerEntry } from './entry.ts';

export interface LoanBrokerView {
  raw: Record<string, unknown>;
  /** Principal + interest currently owed to the vault by all live loans. */
  debtTotal: string;
  /** First-loss capital available to absorb a default. */
  coverAvailable: string;
  /** 1/10th basis points, 0..100000 == 0..100%. */
  coverRateMinimum: number;
  coverRateLiquidation: number;
  managementFeeRate: number;
  /** Next loan index; `deriveLoanId` needs this value read *before* the LoanSet. */
  loanSequence: number;
  vaultId: string;
  owner: string;
  account: string;
}

function str(record: Record<string, unknown>, field: string, fallback = '0'): string {
  const value = record[field];
  return value === undefined || value === null ? fallback : String(value);
}

function num(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export async function readLoanBroker(
  client: Client,
  loanBrokerId: string,
): Promise<LoanBrokerView | null> {
  const node = await readLedgerEntry(client, loanBrokerId);
  if (!node) {
    return null;
  }
  if (node.LedgerEntryType !== 'LoanBroker') {
    throw new Error(
      `ledger entry ${loanBrokerId} is a ${String(node.LedgerEntryType)}, not a LoanBroker`,
    );
  }
  return {
    raw: node,
    debtTotal: str(node, 'DebtTotal'),
    coverAvailable: str(node, 'CoverAvailable'),
    coverRateMinimum: num(node, 'CoverRateMinimum'),
    coverRateLiquidation: num(node, 'CoverRateLiquidation'),
    managementFeeRate: num(node, 'ManagementFeeRate'),
    loanSequence: num(node, 'LoanSequence'),
    vaultId: str(node, 'VaultID', ''),
    owner: str(node, 'Owner', ''),
    account: str(node, 'Account', ''),
  };
}
