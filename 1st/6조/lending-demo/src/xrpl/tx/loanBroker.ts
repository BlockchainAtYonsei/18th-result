/**
 * Pure `LoanBrokerSet` / `LoanBrokerCoverDeposit` builders (XLS-66 sections 3.3, 3.5).
 *
 * Rate scale (measured against the shipped validators, see `docs/decisions.md` D7):
 * rates are 1/10th basis points, valid 0..100000, so 100000 == 100% and 10000 == 10%.
 * `ManagementFeeRate` caps at 10000 == 10%.
 */

/** 1/10th basis points that represent 100%. */
export const RATE_SCALE_100_PERCENT = 100_000;

/** Percent -> 1/10th basis points. `percentToRate(10)` is `10000`. */
export function percentToRate(percent: number): number {
  const rate = Math.round((percent / 100) * RATE_SCALE_100_PERCENT);
  if (rate < 0 || rate > RATE_SCALE_100_PERCENT) {
    throw new RangeError(`rate ${percent}% is outside the protocol range 0..100%`);
  }
  return rate;
}

export interface LoanBrokerSetParams {
  owner: string;
  vaultId: string;
  /** Present only when updating an existing broker; omit to create one. */
  loanBrokerId?: string;
  /**
   * Both cover rates must be zero together or non-zero together
   * (`validateLoanBrokerSet`), so they are one required pair here.
   */
  coverRateMinimum: number;
  coverRateLiquidation: number;
  managementFeeRate?: number;
  /** Debt ceiling in drops. Omitted means no ceiling. */
  debtMaximumDrops?: string;
}

export function buildLoanBrokerSet(params: LoanBrokerSetParams): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: 'LoanBrokerSet',
    Account: params.owner,
    VaultID: params.vaultId,
    CoverRateMinimum: params.coverRateMinimum,
    CoverRateLiquidation: params.coverRateLiquidation,
  };
  if (params.loanBrokerId !== undefined) {
    tx.LoanBrokerID = params.loanBrokerId;
  }
  if (params.managementFeeRate !== undefined) {
    tx.ManagementFeeRate = params.managementFeeRate;
  }
  if (params.debtMaximumDrops !== undefined) {
    tx.DebtMaximum = params.debtMaximumDrops;
  }
  return tx;
}

export interface LoanBrokerCoverDepositParams {
  owner: string;
  loanBrokerId: string;
  amountDrops: string;
}

export function buildLoanBrokerCoverDeposit(
  params: LoanBrokerCoverDepositParams,
): Record<string, unknown> {
  return {
    TransactionType: 'LoanBrokerCoverDeposit',
    Account: params.owner,
    LoanBrokerID: params.loanBrokerId,
    Amount: params.amountDrops,
  };
}

export interface LoanBrokerCoverWithdrawParams {
  owner: string;
  loanBrokerId: string;
  amountDrops: string;
}

/**
 * Fields per `node_modules/xrpl/dist/npm/models/transactions/loanBrokerCoverWithdraw.d.ts`:
 * `LoanBrokerID`, `Amount` (Destination optional; omitted → owner). rippled rejects the
 * withdrawal unless `CoverAvailable - Amount >= DebtTotal × CoverRateMinimum`, so with
 * DebtTotal 0 (loan fully repaid) the whole cover can leave.
 */
export function buildLoanBrokerCoverWithdraw(
  params: LoanBrokerCoverWithdrawParams,
): Record<string, unknown> {
  return {
    TransactionType: 'LoanBrokerCoverWithdraw',
    Account: params.owner,
    LoanBrokerID: params.loanBrokerId,
    Amount: params.amountDrops,
  };
}
