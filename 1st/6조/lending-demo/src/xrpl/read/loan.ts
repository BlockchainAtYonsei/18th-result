/** `ledger_entry` reader for the `Loan` object (XLS-66 section 3.2). */
import type { Client } from 'xrpl';

import { readLedgerEntry } from './entry.ts';

/** `Loan.Flags` bits, from xrpl.js `LoanFlags`. */
export const LSF_LOAN_DEFAULT = 0x00010000;
export const LSF_LOAN_IMPAIRED = 0x00020000;
export const LSF_LOAN_OVERPAYMENT = 0x00040000;

export interface LoanView {
  raw: Record<string, unknown>;
  principalOutstanding: string;
  /** Principal + scheduled interest + management fee still owed. */
  totalValueOutstanding: string;
  managementFeeOutstanding: string;
  periodicPayment: string;
  /** Ripple seconds. Not changed by impairment (docs/decisions.md D11). */
  nextPaymentDueDate: number;
  previousPaymentDueDate: number;
  startDate: number;
  paymentInterval: number;
  gracePeriod: number;
  paymentRemaining: number;
  flags: number;
  impaired: boolean;
  defaulted: boolean;
  borrower: string;
  loanBrokerId: string;
}

function str(record: Record<string, unknown>, field: string, fallback = '0'): string {
  const value = record[field];
  return value === undefined || value === null ? fallback : String(value);
}

function num(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export async function readLoan(client: Client, loanId: string): Promise<LoanView | null> {
  const node = await readLedgerEntry(client, loanId);
  if (!node) {
    return null;
  }
  if (node.LedgerEntryType !== 'Loan') {
    throw new Error(`ledger entry ${loanId} is a ${String(node.LedgerEntryType)}, not a Loan`);
  }
  const flags = num(node, 'Flags');
  return {
    raw: node,
    principalOutstanding: str(node, 'PrincipalOutstanding'),
    totalValueOutstanding: str(node, 'TotalValueOutstanding'),
    managementFeeOutstanding: str(node, 'ManagementFeeOutstanding'),
    periodicPayment: str(node, 'PeriodicPayment'),
    nextPaymentDueDate: num(node, 'NextPaymentDueDate'),
    previousPaymentDueDate: num(node, 'PreviousPaymentDueDate'),
    startDate: num(node, 'StartDate'),
    paymentInterval: num(node, 'PaymentInterval'),
    gracePeriod: num(node, 'GracePeriod'),
    paymentRemaining: num(node, 'PaymentRemaining'),
    flags,
    impaired: (flags & LSF_LOAN_IMPAIRED) === LSF_LOAN_IMPAIRED,
    defaulted: (flags & LSF_LOAN_DEFAULT) === LSF_LOAN_DEFAULT,
    borrower: str(node, 'Borrower', ''),
    loanBrokerId: str(node, 'LoanBrokerID', ''),
  };
}
