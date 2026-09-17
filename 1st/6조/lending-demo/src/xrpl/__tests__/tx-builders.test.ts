/**
 * Snapshot each pure tx builder against the P1 params actually used on devnet
 * (`.omc/artifacts/run-B.json` / `run-A.json` `.params`, and their `.ids`):
 *
 *   depositDrops "78000000", principalDrops "39000000", coverDrops "6000000",
 *   coverRateMinimum 10000 (10%), coverRateLiquidation 100000 (100%),
 *   interestRate 10000 (10%), paymentInterval 60, gracePeriod 60, paymentTotal 1.
 *
 * Per `docs/decisions.md` D7, the rate scale is 1/10th basis points: 100000 == 100%,
 * 10000 == 10% (NOT the `1_000_000_000 == 100%` that `scenario/types.ts`'s doc
 * comment still says - see the note at the bottom of this file).
 *
 * Builders never talk to the network; Fee/Sequence/LastLedgerSequence come from
 * `client.autofill` in `submit.ts`, so they are intentionally absent here.
 */
import { describe, expect, it } from 'vitest';
import { LoanManageFlags, LoanPayFlags } from 'xrpl';

import { percentToRate } from '../tx/loanBroker.ts';
import { buildLoanBrokerCoverDeposit, buildLoanBrokerSet } from '../tx/loanBroker.ts';
import { buildLoanDefault, buildLoanImpair, buildLoanPay, buildLoanSet, buildLoanUnimpair } from '../tx/loan.ts';
import {
  buildVaultCreate,
  buildVaultDeposit,
  buildVaultWithdrawAsset,
  buildVaultWithdrawShares,
} from '../tx/vault.ts';

// run-B.json / run-A.json .params (identical in both runs)
const PARAMS = {
  depositDrops: '78000000',
  principalDrops: '39000000',
  coverDrops: '6000000',
  coverRateMinimum: 10000,
  coverRateLiquidation: 100000,
  interestRate: 10000,
  paymentInterval: 60,
  gracePeriod: 60,
  paymentTotal: 1,
  subscriptionLeadSeconds: 45,
  investmentPeriodSeconds: 180,
} as const;

// run-B.json .ids and accounts
const VAULT_ID = '85AF433AC783DAB54A61E23C5543D7164A9BFB1915DF05067921B0A8C7D3CD08';
const LOAN_BROKER_ID = 'F049A3F0FA0A4FC769A2E30B0CC7ACC92DE9BA8A961C6AE4E44D8E4645642832';
const LOAN_ID = 'E49D8BB8F29E68D88F05316E451E172D09160FCBC8DA18920D3857B9D4640CF3';
const SHARE_MPT_ID = '00000001C024212CED97E9F2783E4A6371A2883E8BBFEE9A';
const BROKER = 'rPLrMbUnbGFuU5GjqgriHQKkbWNi3PM1ig';
const DEPOSITOR = 'rDEPOSITORxxxxxxxxxxxxxxxxxxxxxxxx';
const BORROWER = 'rfPPHHye6KookZ1yfGFcMqNeL4GwjUWXuQ';

// run-B.json vaultCreate step: SubscriptionDate 842379317, RedemptionDate 842379497
const SUBSCRIPTION_DATE = 842379317;
const REDEMPTION_DATE = 842379497;

describe('percentToRate (D7 rate scale)', () => {
  it('10% -> 10000 and 100% -> 100000, matching run-B.json/run-A.json', () => {
    expect(percentToRate(10)).toBe(10000);
    expect(percentToRate(100)).toBe(100000);
    expect(percentToRate(10)).toBe(PARAMS.coverRateMinimum);
    expect(percentToRate(100)).toBe(PARAMS.coverRateLiquidation);
    expect(percentToRate(10)).toBe(PARAMS.interestRate);
  });

  it('rejects a percentage outside 0..100', () => {
    expect(() => percentToRate(-1)).toThrow(RangeError);
    expect(() => percentToRate(101)).toThrow(RangeError);
  });
});

describe('buildVaultCreate', () => {
  it('matches the run-B.json VaultCreate NewFields (VaultKind 1, WithdrawalPolicy 1)', () => {
    const tx = buildVaultCreate({
      owner: BROKER,
      subscriptionDate: SUBSCRIPTION_DATE,
      redemptionDate: REDEMPTION_DATE,
    });
    expect(tx).toEqual({
      TransactionType: 'VaultCreate',
      Account: BROKER,
      Asset: { currency: 'XRP' },
      WithdrawalPolicy: 1,
      VaultKind: 1,
      SubscriptionDate: SUBSCRIPTION_DATE,
      RedemptionDate: REDEMPTION_DATE,
    });
  });

  it('rejects an investment period shorter than the 180s protocol floor', () => {
    expect(() =>
      buildVaultCreate({
        owner: BROKER,
        subscriptionDate: SUBSCRIPTION_DATE,
        redemptionDate: SUBSCRIPTION_DATE + 179,
      }),
    ).toThrow(RangeError);
  });

  it('accepts exactly the 180s protocol floor (run-B.json investmentPeriodSeconds)', () => {
    expect(() =>
      buildVaultCreate({
        owner: BROKER,
        subscriptionDate: SUBSCRIPTION_DATE,
        redemptionDate: SUBSCRIPTION_DATE + PARAMS.investmentPeriodSeconds,
      }),
    ).not.toThrow();
  });
});

describe('buildVaultDeposit', () => {
  it('matches the run-B.json VaultDeposit amount', () => {
    const tx = buildVaultDeposit({
      depositor: DEPOSITOR,
      vaultId: VAULT_ID,
      amountDrops: PARAMS.depositDrops,
    });
    expect(tx).toEqual({
      TransactionType: 'VaultDeposit',
      Account: DEPOSITOR,
      VaultID: VAULT_ID,
      Amount: '78000000',
    });
  });
});

describe('buildVaultWithdrawShares', () => {
  it('carries the share MPT amount, not a plain drops amount', () => {
    const tx = buildVaultWithdrawShares({
      depositor: DEPOSITOR,
      vaultId: VAULT_ID,
      shareMPTID: SHARE_MPT_ID,
      shares: PARAMS.depositDrops, // 1 share == 1 drop for an XRP vault
    });
    expect(tx).toEqual({
      TransactionType: 'VaultWithdraw',
      Account: DEPOSITOR,
      VaultID: VAULT_ID,
      Amount: { mpt_issuance_id: SHARE_MPT_ID, value: '78000000' },
    });
  });
});

describe('buildVaultWithdrawAsset', () => {
  it('carries a plain drops Amount, no MPT wrapper', () => {
    const tx = buildVaultWithdrawAsset({
      depositor: DEPOSITOR,
      vaultId: VAULT_ID,
      amountDrops: '1000000',
    });
    expect(tx).toEqual({
      TransactionType: 'VaultWithdraw',
      Account: DEPOSITOR,
      VaultID: VAULT_ID,
      Amount: '1000000',
    });
  });
});

describe('buildLoanBrokerSet', () => {
  it('matches the run-B.json LoanBrokerSet fields (create path, no LoanBrokerID)', () => {
    const tx = buildLoanBrokerSet({
      owner: BROKER,
      vaultId: VAULT_ID,
      coverRateMinimum: PARAMS.coverRateMinimum,
      coverRateLiquidation: PARAMS.coverRateLiquidation,
      managementFeeRate: 0,
    });
    expect(tx).toEqual({
      TransactionType: 'LoanBrokerSet',
      Account: BROKER,
      VaultID: VAULT_ID,
      CoverRateMinimum: 10000,
      CoverRateLiquidation: 100000,
      ManagementFeeRate: 0,
    });
  });

  it('omits DebtMaximum and LoanBrokerID when not supplied', () => {
    const tx = buildLoanBrokerSet({
      owner: BROKER,
      vaultId: VAULT_ID,
      coverRateMinimum: PARAMS.coverRateMinimum,
      coverRateLiquidation: PARAMS.coverRateLiquidation,
    });
    expect(tx).not.toHaveProperty('DebtMaximum');
    expect(tx).not.toHaveProperty('LoanBrokerID');
    expect(tx).not.toHaveProperty('ManagementFeeRate');
  });

  it('includes LoanBrokerID on the update path', () => {
    const tx = buildLoanBrokerSet({
      owner: BROKER,
      vaultId: VAULT_ID,
      loanBrokerId: LOAN_BROKER_ID,
      coverRateMinimum: PARAMS.coverRateMinimum,
      coverRateLiquidation: PARAMS.coverRateLiquidation,
    });
    expect(tx.LoanBrokerID).toBe(LOAN_BROKER_ID);
  });
});

describe('buildLoanBrokerCoverDeposit', () => {
  it('matches the run-B.json LoanBrokerCoverDeposit amount', () => {
    const tx = buildLoanBrokerCoverDeposit({
      owner: BROKER,
      loanBrokerId: LOAN_BROKER_ID,
      amountDrops: PARAMS.coverDrops,
    });
    expect(tx).toEqual({
      TransactionType: 'LoanBrokerCoverDeposit',
      Account: BROKER,
      LoanBrokerID: LOAN_BROKER_ID,
      Amount: '6000000',
    });
  });
});

describe('buildLoanSet', () => {
  it('matches the run-B.json/run-A.json LoanSet fields (borrower-initiated, Counterparty = broker)', () => {
    const tx = buildLoanSet({
      account: BORROWER,
      counterparty: BROKER,
      loanBrokerId: LOAN_BROKER_ID,
      principalDrops: PARAMS.principalDrops,
      interestRate: PARAMS.interestRate,
      paymentInterval: PARAMS.paymentInterval,
      gracePeriod: PARAMS.gracePeriod,
      paymentTotal: PARAMS.paymentTotal,
    });
    expect(tx).toEqual({
      TransactionType: 'LoanSet',
      Account: BORROWER,
      Counterparty: BROKER,
      LoanBrokerID: LOAN_BROKER_ID,
      PrincipalRequested: '39000000',
      InterestRate: 10000,
      PaymentInterval: 60,
      GracePeriod: 60,
      PaymentTotal: 1,
    });
  });

  it('rejects PaymentInterval below the 60s protocol minimum', () => {
    expect(() =>
      buildLoanSet({
        account: BORROWER,
        counterparty: BROKER,
        loanBrokerId: LOAN_BROKER_ID,
        principalDrops: PARAMS.principalDrops,
        interestRate: PARAMS.interestRate,
        paymentInterval: 59,
        gracePeriod: 60,
        paymentTotal: 1,
      }),
    ).toThrow(RangeError);
  });

  it('rejects GracePeriod below 60s or above PaymentInterval', () => {
    expect(() =>
      buildLoanSet({
        account: BORROWER,
        counterparty: BROKER,
        loanBrokerId: LOAN_BROKER_ID,
        principalDrops: PARAMS.principalDrops,
        interestRate: PARAMS.interestRate,
        paymentInterval: 60,
        gracePeriod: 59,
        paymentTotal: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      buildLoanSet({
        account: BORROWER,
        counterparty: BROKER,
        loanBrokerId: LOAN_BROKER_ID,
        principalDrops: PARAMS.principalDrops,
        interestRate: PARAMS.interestRate,
        paymentInterval: 60,
        gracePeriod: 61,
        paymentTotal: 1,
      }),
    ).toThrow(RangeError);
  });

  it('rejects a PaymentTotal below 1', () => {
    expect(() =>
      buildLoanSet({
        account: BORROWER,
        counterparty: BROKER,
        loanBrokerId: LOAN_BROKER_ID,
        principalDrops: PARAMS.principalDrops,
        interestRate: PARAMS.interestRate,
        paymentInterval: 60,
        gracePeriod: 60,
        paymentTotal: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe('buildLoanImpair / buildLoanDefault / buildLoanUnimpair', () => {
  it('impair carries LoanManageFlags.tfLoanImpair (131072, per interfaces-frozen.md)', () => {
    const tx = buildLoanImpair({ brokerOwner: BROKER, loanId: LOAN_ID });
    expect(tx).toEqual({
      TransactionType: 'LoanManage',
      Account: BROKER,
      LoanID: LOAN_ID,
      Flags: LoanManageFlags.tfLoanImpair,
    });
    expect(tx.Flags).toBe(131072);
  });

  it('default carries LoanManageFlags.tfLoanDefault (65536)', () => {
    const tx = buildLoanDefault({ brokerOwner: BROKER, loanId: LOAN_ID });
    expect(tx).toEqual({
      TransactionType: 'LoanManage',
      Account: BROKER,
      LoanID: LOAN_ID,
      Flags: LoanManageFlags.tfLoanDefault,
    });
    expect(tx.Flags).toBe(65536);
  });

  it('unimpair carries LoanManageFlags.tfLoanUnimpair (262144)', () => {
    const tx = buildLoanUnimpair({ brokerOwner: BROKER, loanId: LOAN_ID });
    expect(tx).toEqual({
      TransactionType: 'LoanManage',
      Account: BROKER,
      LoanID: LOAN_ID,
      Flags: LoanManageFlags.tfLoanUnimpair,
    });
  });
});

describe('buildLoanPay', () => {
  it('run-A.json final instalment: kind "regular" carries no Flags field', () => {
    // run-A.json txLog: "amount due read from the ledger: TotalValueOutstanding=39000008
    // PeriodicPayment=39000007.42000677218 PaymentRemaining=1 ... kind=regular"
    const tx = buildLoanPay({
      borrower: BORROWER,
      loanId: LOAN_ID,
      amountDrops: '39000008',
      kind: 'regular',
    });
    expect(tx).toEqual({
      TransactionType: 'LoanPay',
      Account: BORROWER,
      LoanID: LOAN_ID,
      Amount: '39000008',
    });
    expect(tx).not.toHaveProperty('Flags');
  });

  it('kind "fullPayment" carries LoanPayFlags.tfLoanFullPayment (131072)', () => {
    const tx = buildLoanPay({
      borrower: BORROWER,
      loanId: LOAN_ID,
      amountDrops: '39000008',
      kind: 'fullPayment',
    });
    expect(tx.Flags).toBe(LoanPayFlags.tfLoanFullPayment);
    expect(tx.Flags).toBe(131072);
  });

  it('kind "latePayment" carries LoanPayFlags.tfLoanLatePayment (262144)', () => {
    const tx = buildLoanPay({
      borrower: BORROWER,
      loanId: LOAN_ID,
      amountDrops: '39000008',
      kind: 'latePayment',
    });
    expect(tx.Flags).toBe(LoanPayFlags.tfLoanLatePayment);
    expect(tx.Flags).toBe(262144);
  });

  it('kind "overpayment" carries LoanPayFlags.tfLoanOverpayment (65536)', () => {
    const tx = buildLoanPay({
      borrower: BORROWER,
      loanId: LOAN_ID,
      amountDrops: '50000000',
      kind: 'overpayment',
    });
    expect(tx.Flags).toBe(LoanPayFlags.tfLoanOverpayment);
    expect(tx.Flags).toBe(65536);
  });
});

/**
 * NOTE for the src owners (p4-wire): `src/scenario/types.ts`'s `ScenarioParams` doc
 * comments for `coverRateMinimum` / `coverRateLiquidation` / `interestRate` still say
 * "rippled scale (1_000_000_000 == 100%)". `docs/decisions.md` D7 supersedes that:
 * the real scale is 1/10th basis points, 100000 == 100%. The runtime values used
 * throughout this codebase (10000, 100000, `RATE_SCALE_100_PERCENT` in
 * `xrpl/tx/loanBroker.ts`) already use the correct D7 scale - only the doc comment in
 * `types.ts` is stale. Not fixed here per the P6 boundary (no src edits); flagging
 * for whoever owns `src/scenario/types.ts` next.
 */
