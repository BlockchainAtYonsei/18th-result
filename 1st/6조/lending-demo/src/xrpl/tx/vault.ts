/**
 * Pure `VaultCreate` / `VaultDeposit` / `VaultWithdraw` builders (XLS-65).
 *
 * Field names come only from `node_modules/xrpl/dist/npm/models/transactions/vault*.d.ts`.
 * Nothing here talks to the network; `submit.ts` autofills Fee, Sequence and
 * LastLedgerSequence.
 */
import { VaultKind, VaultWithdrawalPolicy } from 'xrpl';
import type { MPTAmount } from 'xrpl';

export interface VaultCreateParams {
  owner: string;
  /**
   * Withdrawal strategy. Only `vaultStrategyFirstComeFirstServe` exists in xrpl.js,
   * and it is what the demo needs: any holder redeems any amount on demand.
   */
  withdrawalPolicy?: number;
  /**
   * Ripple seconds. Deposits are accepted up to and including this instant; after it
   * the vault is in its Investment phase and only lending happens.
   */
  subscriptionDate: number;
  /**
   * Ripple seconds. Redemption opens here. `RedemptionDate - SubscriptionDate` must
   * be at least `MIN_INVESTMENT_PERIOD_SECONDS`.
   */
  redemptionDate: number;
}

/**
 * Shortest legal Investment phase, from rippled `kMinInvestmentPeriod`. It is the
 * floor on how long a demo run can take: a loan cannot be originated before the
 * Subscription phase ends and shares cannot be redeemed before Redemption opens.
 */
export const MIN_INVESTMENT_PERIOD_SECONDS = 180;

/**
 * A closed-ended XRP vault.
 *
 * Closed-ended is not a choice: since `LendingProtocolV1_1` rippled rejects a
 * `LoanBrokerSet` against an open-ended vault with `tecNO_PERMISSION`, so a lending
 * demo has no other shape. `Scale` must stay absent for XRP (validateVaultCreate
 * rejects it), which fixes the share scale at 0: one share is one drop.
 */
export function buildVaultCreate(params: VaultCreateParams): Record<string, unknown> {
  const gap = params.redemptionDate - params.subscriptionDate;
  if (gap < MIN_INVESTMENT_PERIOD_SECONDS) {
    throw new RangeError(
      `RedemptionDate must be at least ${MIN_INVESTMENT_PERIOD_SECONDS}s after ` +
        `SubscriptionDate, got ${gap}s`,
    );
  }
  return {
    TransactionType: 'VaultCreate',
    Account: params.owner,
    Asset: { currency: 'XRP' },
    WithdrawalPolicy:
      params.withdrawalPolicy ?? VaultWithdrawalPolicy.vaultStrategyFirstComeFirstServe,
    VaultKind: VaultKind.vaultKindClosed,
    SubscriptionDate: params.subscriptionDate,
    RedemptionDate: params.redemptionDate,
  };
}

export interface VaultDepositParams {
  depositor: string;
  vaultId: string;
  /** XRP drops as a decimal string. */
  amountDrops: string;
}

export function buildVaultDeposit(params: VaultDepositParams): Record<string, unknown> {
  return {
    TransactionType: 'VaultDeposit',
    Account: params.depositor,
    VaultID: params.vaultId,
    Amount: params.amountDrops,
  };
}

export interface VaultWithdrawSharesParams {
  depositor: string;
  vaultId: string;
  shareMPTID: string;
  /** Share units to redeem. For an XRP vault one share is one drop. */
  shares: string;
}

/**
 * Redeem a share amount. Passing the *share* MPT (rather than an XRP drops amount)
 * is what makes "withdraw everything I hold" exact: the payout is derived from the
 * shares, so no leftover dust can strand the MPToken and its reserve.
 */
export function buildVaultWithdrawShares(
  params: VaultWithdrawSharesParams,
): Record<string, unknown> {
  const amount: MPTAmount = {
    mpt_issuance_id: params.shareMPTID,
    value: params.shares,
  };
  return {
    TransactionType: 'VaultWithdraw',
    Account: params.depositor,
    VaultID: params.vaultId,
    Amount: amount,
  };
}

export interface VaultWithdrawAssetParams {
  depositor: string;
  vaultId: string;
  amountDrops: string;
}

/** Withdraw an exact asset amount, burning however many shares that costs. */
export function buildVaultWithdrawAsset(
  params: VaultWithdrawAssetParams,
): Record<string, unknown> {
  return {
    TransactionType: 'VaultWithdraw',
    Account: params.depositor,
    VaultID: params.vaultId,
    Amount: params.amountDrops,
  };
}
