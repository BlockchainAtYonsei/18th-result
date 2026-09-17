/**
 * Pure `LoanSet` / `LoanManage` / `LoanPay` builders (XLS-66 sections 3.8, 3.10, 3.11).
 *
 * `LoanSet` carries two signatures. The `Account` signs normally and the
 * `Counterparty` adds `CounterpartySignature`; one of the two must be the
 * `LoanBroker.Owner` or the transaction fails `tecNO_PERMISSION`. The demo uses the
 * borrower-initiated flow: Account = borrower, Counterparty = broker owner.
 *
 * The extra signature also raises the fee floor to two base fees. xrpl.js `autofill`
 * handles that for `LoanSet` (it looks the counterparty's signer list up), so no Fee
 * is set here.
 */
import { LoanManageFlags, LoanPayFlags } from 'xrpl';

export interface LoanSetParams {
  /** Submitting account. In the borrower-initiated flow, the borrower. */
  account: string;
  /** The other signer. Omitted means `LoanBroker.Owner` by protocol default. */
  counterparty: string;
  loanBrokerId: string;
  /** Requested principal, drops. */
  principalDrops: string;
  /** Annualised interest, 1/10th basis points (10000 == 10%). */
  interestRate: number;
  /** Seconds between payments. The protocol minimum is 60. */
  paymentInterval: number;
  /** Seconds after the due date before a default is allowed. 60 <= value <= interval. */
  gracePeriod: number;
  paymentTotal: number;
}

export function buildLoanSet(params: LoanSetParams): Record<string, unknown> {
  if (params.paymentInterval < 60) {
    throw new RangeError(`LoanSet PaymentInterval must be >= 60s, got ${params.paymentInterval}`);
  }
  if (params.gracePeriod < 60 || params.gracePeriod > params.paymentInterval) {
    throw new RangeError(
      `LoanSet GracePeriod must be between 60s and PaymentInterval, got ${params.gracePeriod}`,
    );
  }
  if (params.paymentTotal < 1) {
    throw new RangeError(`LoanSet PaymentTotal must be >= 1, got ${params.paymentTotal}`);
  }
  return {
    TransactionType: 'LoanSet',
    Account: params.account,
    Counterparty: params.counterparty,
    LoanBrokerID: params.loanBrokerId,
    PrincipalRequested: params.principalDrops,
    InterestRate: params.interestRate,
    PaymentInterval: params.paymentInterval,
    GracePeriod: params.gracePeriod,
    PaymentTotal: params.paymentTotal,
  };
}

export interface LoanManageParams {
  /** Must be the `LoanBroker.Owner`; anyone else gets `tecNO_PERMISSION`. */
  brokerOwner: string;
  loanId: string;
}

/**
 * Register a paper loss against the vault (`LossUnrealized`). Per devnet measurement
 * (docs/decisions.md D11) impairment does NOT move `NextPaymentDueDate`; it is only
 * accepted once the loan is overdue, otherwise `tecTOO_SOON`.
 */
export function buildLoanImpair(params: LoanManageParams): Record<string, unknown> {
  return {
    TransactionType: 'LoanManage',
    Account: params.brokerOwner,
    LoanID: params.loanId,
    Flags: LoanManageFlags.tfLoanImpair,
  };
}

/** Only valid once `NextPaymentDueDate + GracePeriod` has passed, else `tecTOO_SOON`. */
export function buildLoanDefault(params: LoanManageParams): Record<string, unknown> {
  return {
    TransactionType: 'LoanManage',
    Account: params.brokerOwner,
    LoanID: params.loanId,
    Flags: LoanManageFlags.tfLoanDefault,
  };
}

export function buildLoanUnimpair(params: LoanManageParams): Record<string, unknown> {
  return {
    TransactionType: 'LoanManage',
    Account: params.brokerOwner,
    LoanID: params.loanId,
    Flags: LoanManageFlags.tfLoanUnimpair,
  };
}

export type LoanPayKind = 'regular' | 'fullPayment' | 'latePayment' | 'overpayment';

export interface LoanPayParams {
  borrower: string;
  loanId: string;
  /** Drops. Must be at least the amount due or the ledger returns `tecINSUFFICIENT_PAYMENT`. */
  amountDrops: string;
  kind: LoanPayKind;
}

const PAY_FLAGS: Record<LoanPayKind, number | undefined> = {
  regular: undefined,
  fullPayment: LoanPayFlags.tfLoanFullPayment,
  latePayment: LoanPayFlags.tfLoanLatePayment,
  overpayment: LoanPayFlags.tfLoanOverpayment,
};

/**
 * `tfLoanFullPayment` is rejected with `tecKILLED` when `PaymentRemaining == 1`; the
 * final instalment must go through as a `regular` payment. Callers pick the kind from
 * the on-chain `Loan`, never from an assumption.
 */
export function buildLoanPay(params: LoanPayParams): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: 'LoanPay',
    Account: params.borrower,
    LoanID: params.loanId,
    Amount: params.amountDrops,
  };
  const flags = PAY_FLAGS[params.kind];
  if (flags !== undefined) {
    tx.Flags = flags;
  }
  return tx;
}
