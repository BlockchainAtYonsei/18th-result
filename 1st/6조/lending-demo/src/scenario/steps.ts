/**
 * The step factories scenarios A and B share.
 *
 * Steps are data: `build` returns a transaction, `after` records what the ledger
 * decided, `expect` reports a violated invariant as a warning string. No step reads
 * the network for display purposes - the engine's snapshot refresh does that.
 */
import { buildLoanBrokerCoverDeposit,
  buildLoanBrokerCoverWithdraw, buildLoanBrokerSet } from '../xrpl/tx/loanBroker.ts';
import {
  buildLoanDefault,
  buildLoanImpair,
  buildLoanPay,
  buildLoanSet,
} from '../xrpl/tx/loan.ts';
import {
  buildVaultCreate,
  buildVaultDeposit,
  buildVaultWithdrawShares,
} from '../xrpl/tx/vault.ts';
import { assertIdMatchesMeta, deriveLoanBrokerId, deriveLoanId, deriveVaultId } from '../xrpl/read/ids.ts';
import { readLoan } from '../xrpl/read/loan.ts';
import { readLoanBroker } from '../xrpl/read/loanBroker.ts';
import { readVault } from '../xrpl/read/vault.ts';

import { refreshSnapshot, requireId, requireSnapshot, setId } from './ctx.ts';
import { defaultUnlockAtRipple } from './countdown.ts';
import type { LedgerSnapshot, ScenarioCtx, StepDef, StepGate } from './types.ts';

function field(record: Record<string, unknown> | null, name: string): string | null {
  if (!record) {
    return null;
  }
  const value = record[name];
  return value === undefined || value === null ? null : String(value);
}

function numField(record: Record<string, unknown> | null, name: string): number | null {
  const raw = field(record, name);
  return raw === null ? null : Number(raw);
}

/**
 * B1 / A1. The broker owns the vault; XLS-65 requires the broker to be its creator.
 *
 * The vault must be closed-ended: since `LendingProtocolV1_1`, `LoanBrokerSet`
 * refuses an open-ended vault outright. That imposes the whole run's shape -
 * deposits close at `SubscriptionDate`, the loan lives inside the Investment phase,
 * and redemption waits for `RedemptionDate`.
 */
export function stepVaultCreate(): StepDef {
  let schedule: { subscriptionDate: number; redemptionDate: number } | null = null;

  return {
    id: 'vaultCreate',
    label: 'VaultCreate',
    description: 'Broker opens a closed-ended XRP vault; shares are issued one per drop.',
    signer: 'broker',
    state: 'Pending',
    async build(ctx: ScenarioCtx) {
      // A new vault starts a new object family: whatever vault/loanBroker/loan ids a
      // previous attempt left behind (missed deposit window, timed-out submit that
      // validated late, retry after a failure) must not survive, or `setId` refuses
      // the fresh id ("vault id already set … refusing to overwrite", D24).
      ctx.ids = {};
      // Anchor the schedule to validated ledger time, not the local clock: every
      // phase boundary is judged against ledger close times.
      const closeTime = await validatedCloseTime(ctx);
      const subscriptionDate = closeTime + ctx.params.subscriptionLeadSeconds;
      const redemptionDate = subscriptionDate + ctx.params.investmentPeriodSeconds;
      schedule = { subscriptionDate, redemptionDate };
      ctx.log({
        at: Date.now(),
        level: 'info',
        stepId: 'vaultCreate',
        message:
          `vault schedule: SubscriptionDate=${subscriptionDate} ` +
          `RedemptionDate=${redemptionDate} (ledger close ${closeTime})`,
      });
      return buildVaultCreate({
        owner: ctx.accounts.broker,
        subscriptionDate,
        redemptionDate,
      });
    },
    async after(ctx, result) {
      // hashVault(owner, Sequence) uses the Sequence the ledger actually applied, so
      // it is read back off the validated result rather than guessed before signing.
      const derived = deriveVaultId(ctx.accounts.broker, result.sequence);
      assertIdMatchesMeta('Vault', derived, result.meta);
      setId(ctx, 'vault', derived);
    },
    expect(snapshot: LedgerSnapshot) {
      if (!snapshot.vault) {
        return 'VaultCreate succeeded but no Vault object is readable at the derived id';
      }
      const total = field(snapshot.vault, 'AssetsTotal') ?? '0';
      if (total !== '0') {
        return `new Vault reports AssetsTotal ${total}, expected 0`;
      }
      const kind = numField(snapshot.vault, 'VaultKind');
      if (kind !== 1) {
        return `Vault.VaultKind is ${String(kind)}, expected 1 (closed-ended)`;
      }
      const onChain = numField(snapshot.vault, 'SubscriptionDate');
      if (schedule && onChain !== schedule.subscriptionDate) {
        return `Vault.SubscriptionDate is ${String(onChain)}, requested ${schedule.subscriptionDate}`;
      }
      return null;
    },
  };
}

/** B2 / A2. Also the wallet-support verdict in the browser: success freezes the signer. */
export function stepVaultDeposit(): StepDef {
  return {
    id: 'vaultDeposit',
    label: 'VaultDeposit',
    description: 'Depositor supplies liquidity and receives vault shares.',
    signer: 'depositor',
    state: 'Pending',
    gate(ctx): StepGate {
      // Closed-ended vault: deposits are accepted only until `SubscriptionDate`. A live
      // run on 2026-09-11 clicked 83s late and got tecEXPIRED (docs/decisions.md D22),
      // so the deadline is surfaced as a countdown and the button closes at the instant.
      const vault = requireSnapshot(ctx).vault;
      const subscriptionDate = numField(vault, 'SubscriptionDate');
      if (subscriptionDate === null) {
        throw new Error('cannot gate VaultDeposit: the Vault has no SubscriptionDate');
      }
      return { locked: false, deadlineRipple: subscriptionDate };
    },
    async build(ctx) {
      return buildVaultDeposit({
        depositor: ctx.accounts.depositor,
        vaultId: requireId(ctx, 'vault'),
        amountDrops: ctx.params.depositDrops,
      });
    },
    async after(ctx) {
      ctx.signers.freeze();
    },
    expect(snapshot) {
      const total = field(snapshot.vault, 'AssetsTotal');
      const shares = snapshot.shareBalances.depositor;
      if (total === null) {
        return 'VaultDeposit succeeded but the Vault object is unreadable';
      }
      if (shares === '0') {
        return 'VaultDeposit succeeded but the depositor holds no share MPToken';
      }
      return null;
    },
  };
}

/** B3 / A3. Creates the broker: `LoanBrokerID` is omitted so the ledger allocates one. */
export function stepLoanBrokerSet(): StepDef {
  return {
    id: 'loanBrokerSet',
    label: 'LoanBrokerSet',
    description: 'Broker publishes its cover requirements and opens for lending.',
    signer: 'broker',
    state: 'Pending',
    async build(ctx) {
      return buildLoanBrokerSet({
        owner: ctx.accounts.broker,
        vaultId: requireId(ctx, 'vault'),
        coverRateMinimum: ctx.params.coverRateMinimum,
        coverRateLiquidation: ctx.params.coverRateLiquidation,
        managementFeeRate: 0,
      });
    },
    async after(ctx, result) {
      const derived = deriveLoanBrokerId(ctx.accounts.broker, result.sequence);
      assertIdMatchesMeta('LoanBroker', derived, result.meta);
      setId(ctx, 'loanBroker', derived);
    },
    expect(snapshot) {
      if (!snapshot.loanBroker) {
        return 'LoanBrokerSet succeeded but no LoanBroker object is readable at the derived id';
      }
      return null;
    },
  };
}

/** B4 / A4. First-loss capital. Without it LoanSet fails `tecINSUFFICIENT_FUNDS`. */
export function stepCoverDeposit(): StepDef {
  return {
    id: 'coverDeposit',
    label: 'LoanBrokerCoverDeposit',
    description: 'Broker posts first-loss capital that absorbs part of any default.',
    signer: 'broker',
    state: 'Pending',
    async build(ctx) {
      return buildLoanBrokerCoverDeposit({
        owner: ctx.accounts.broker,
        loanBrokerId: requireId(ctx, 'loanBroker'),
        amountDrops: ctx.params.coverDrops,
      });
    },
    expect(snapshot) {
      const cover = field(snapshot.loanBroker, 'CoverAvailable');
      if (cover === null || cover === '0') {
        return `LoanBrokerCoverDeposit succeeded but CoverAvailable reads ${String(cover)}`;
      }
      return null;
    },
  };
}

/**
 * A7 (after LoanPay). The broker takes its first-loss capital back. Only possible once
 * `DebtTotal` is 0: rippled enforces `CoverAvailable - Amount >= DebtTotal × CoverRateMinimum`.
 * Amount is read from the ledger at build time so it is always the exact remaining cover.
 */
export function stepCoverWithdraw(): StepDef {
  return {
    id: 'coverWithdraw',
    label: 'LoanBrokerCoverWithdraw',
    description: 'Loan repaid, DebtTotal is 0: the broker withdraws its whole cover.',
    signer: 'broker',
    state: 'Pending',
    async build(ctx) {
      const loanBrokerId = requireId(ctx, 'loanBroker');
      const snapshot = await refreshSnapshot(ctx);
      const cover = field(snapshot.loanBroker, 'CoverAvailable');
      const debt = field(snapshot.loanBroker, 'DebtTotal') ?? '0';
      if (cover === null || cover === '0') {
        throw new Error(`LoanBrokerCoverWithdraw: CoverAvailable reads ${String(cover)}`);
      }
      if (debt !== '0') {
        throw new Error(`LoanBrokerCoverWithdraw: DebtTotal is ${debt}, cover is still locked`);
      }
      return buildLoanBrokerCoverWithdraw({
        owner: ctx.accounts.broker,
        loanBrokerId,
        amountDrops: cover,
      });
    },
    expect(snapshot) {
      const cover = field(snapshot.loanBroker, 'CoverAvailable') ?? '0';
      if (cover !== '0') {
        return `LoanBrokerCoverWithdraw succeeded but CoverAvailable is ${cover}, expected 0`;
      }
      return null;
    },
  };
}

/**
 * B5 / A5. Two signatures: the borrower signs as `Account`, the broker owner adds the
 * `CounterpartySignature`. The Loan id needs `LoanBroker.LoanSequence` as it stood
 * *before* this transaction, so it is captured at build time.
 */
/** rippled `kLoanRedemptionBuffer` (docs/decisions.md D9). */
const LOAN_REDEMPTION_BUFFER_SECONDS = 60;
/** Two ledger closes of slack between clicking and validation. */
const LOAN_SET_VALIDATION_SLACK_SECONDS = 8;

export function stepLoanSet(): StepDef {
  let loanSequenceAtBuild: number | null = null;

  return {
    id: 'loanSet',
    label: 'LoanSet',
    description: 'Borrower and broker jointly originate the loan; the vault funds it.',
    signer: 'borrower',
    coSigner: 'broker',
    state: 'Pending',
    gate(ctx): StepGate {
      // A loan can only be originated in the Investment phase: rippled answers
      // tecTOO_SOON during Subscription and tecEXPIRED once Redemption opens.
      const vault = requireSnapshot(ctx).vault;
      const subscriptionDate = numField(vault, 'SubscriptionDate');
      if (subscriptionDate === null) {
        throw new Error('cannot gate LoanSet: the Vault has no SubscriptionDate');
      }
      // rippled also requires the loan to mature inside the Investment phase:
      //   StartDate + PaymentInterval × PaymentTotal + kLoanRedemptionBuffer(60) <= RedemptionDate
      // (docs/decisions.md D9), else tecNO_PERMISSION. StartDate is the validation
      // close time, so the last safe submission instant is that bound minus a ledger
      // or two of validation slack.
      const redemptionDate = numField(vault, 'RedemptionDate');
      const { paymentInterval, paymentTotal } = ctx.params;
      const deadlineRipple =
        redemptionDate === null
          ? undefined
          : redemptionDate - (paymentInterval * paymentTotal + LOAN_REDEMPTION_BUFFER_SECONDS) - LOAN_SET_VALIDATION_SLACK_SECONDS;
      return { locked: true, unlockAtRipple: subscriptionDate + 1, deadlineRipple };
    },
    async build(ctx) {
      const broker = await readLoanBroker(ctx.client, requireId(ctx, 'loanBroker'));
      if (!broker) {
        throw new Error('LoanBroker disappeared between CoverDeposit and LoanSet');
      }
      loanSequenceAtBuild = broker.loanSequence;
      return buildLoanSet({
        account: ctx.accounts.borrower,
        counterparty: ctx.accounts.broker,
        loanBrokerId: requireId(ctx, 'loanBroker'),
        principalDrops: ctx.params.principalDrops,
        interestRate: ctx.params.interestRate,
        paymentInterval: ctx.params.paymentInterval,
        gracePeriod: ctx.params.gracePeriod,
        paymentTotal: ctx.params.paymentTotal,
      });
    },
    async after(ctx, result) {
      if (loanSequenceAtBuild === null) {
        throw new Error('LoanSet after hook ran without a captured LoanSequence');
      }
      const derived = deriveLoanId(requireId(ctx, 'loanBroker'), loanSequenceAtBuild);
      assertIdMatchesMeta('Loan', derived, result.meta);
      setId(ctx, 'loan', derived);
    },
    expect(snapshot) {
      const principal = field(snapshot.loan, 'PrincipalOutstanding');
      if (principal === null) {
        return 'LoanSet succeeded but no Loan object is readable at the derived id';
      }
      const debt = field(snapshot.loanBroker, 'DebtTotal');
      if (debt === null || debt === '0') {
        return `LoanSet succeeded but LoanBroker.DebtTotal reads ${String(debt)}`;
      }
      return null;
    },
  };
}

/**
 * B6. Impairment books the loan's exposure as an unrealized loss against the vault.
 *
 * It is gated on the payment actually being late: since `fixCleanup3_4_0`, rippled
 * rejects impairing a current loan with `tecTOO_SOON`, and it no longer moves
 * `NextPaymentDueDate` either. So impairment cannot be used to shorten the wait; the
 * demo waits out `PaymentInterval` for real (see `docs/decisions.md` D11).
 */
export function stepLoanImpair(): StepDef {
  return {
    id: 'loanImpair',
    label: 'LoanManage (tfLoanImpair)',
    description: 'Broker flags the overdue loan as impaired, booking an unrealized loss.',
    signer: 'broker',
    state: 'Pending',
    gate(ctx): StepGate {
      const due = numField(requireSnapshot(ctx).loan, 'NextPaymentDueDate');
      if (due === null) {
        throw new Error('cannot gate the impairment: the Loan has no NextPaymentDueDate');
      }
      // rippled compares exclusively, so the first legal second is due + 1.
      return { locked: true, unlockAtRipple: due + 1 };
    },
    async build(ctx) {
      return buildLoanImpair({
        brokerOwner: ctx.accounts.broker,
        loanId: requireId(ctx, 'loan'),
      });
    },
    expect(snapshot) {
      const loss = field(snapshot.vault, 'LossUnrealized');
      if (loss === null || loss === '0') {
        return `Impair succeeded but Vault.LossUnrealized reads ${String(loss)}`;
      }
      const flags = numField(snapshot.loan, 'Flags') ?? 0;
      if ((flags & 0x00020000) === 0) {
        return `Impair succeeded but Loan.Flags ${flags} has no lsfLoanImpaired bit`;
      }
      return null;
    },
  };
}

/**
 * B7. Gated on the ledger's own clock: `NextPaymentDueDate + GracePeriod` must have
 * passed or the ledger answers `tecTOO_SOON`.
 */
export function stepLoanDefault(): StepDef {
  let assetsTotalBefore: string | null = null;

  return {
    id: 'loanDefault',
    label: 'LoanManage (tfLoanDefault)',
    description: 'Broker defaults the loan; cover absorbs part, the vault takes the rest.',
    signer: 'broker',
    state: 'Pending',
    gate(ctx): StepGate {
      const snapshot = requireSnapshot(ctx);
      const due = numField(snapshot.loan, 'NextPaymentDueDate');
      const grace = numField(snapshot.loan, 'GracePeriod');
      if (due === null || grace === null) {
        throw new Error('cannot gate the default: the Loan has no NextPaymentDueDate/GracePeriod');
      }
      return { locked: true, unlockAtRipple: defaultUnlockAtRipple(due, grace) };
    },
    async build(ctx) {
      assetsTotalBefore = field(requireSnapshot(ctx).vault, 'AssetsTotal');
      return buildLoanDefault({
        brokerOwner: ctx.accounts.broker,
        loanId: requireId(ctx, 'loan'),
      });
    },
    expect(snapshot) {
      const after = field(snapshot.vault, 'AssetsTotal');
      if (after === null || assetsTotalBefore === null) {
        return 'default succeeded but AssetsTotal could not be compared before and after';
      }
      if (BigInt(after) >= BigInt(assetsTotalBefore)) {
        return `AC2 violated: AssetsTotal did not fall (${assetsTotalBefore} -> ${after})`;
      }
      return null;
    },
  };
}

/**
 * A6. The exact amount comes off the Loan object, never from a local recomputation.
 * `tfLoanFullPayment` is illegal on the final instalment (`tecKILLED` when
 * `PaymentRemaining == 1`), so the kind is chosen from the ledger state, and a payment
 * that is already past its due date must carry `tfLoanLatePayment` or it gets
 * `tecEXPIRED`.
 */
export function stepLoanPay(options: { forceLate?: boolean } = {}): StepDef {
  const step: StepDef = {
    id: options.forceLate ? 'loanPayLate' : 'loanPay',
    label: options.forceLate ? 'LoanPay (tfLoanLatePayment)' : 'LoanPay',
    description: 'Borrower repays the loan in full; principal and interest return to the vault.',
    signer: 'borrower',
    state: 'Pending',
    async build(ctx) {
      const loanId = requireId(ctx, 'loan');
      const loan = await readLoan(ctx.client, loanId);
      if (!loan) {
        throw new Error(`Loan ${loanId} is not readable; cannot compute the amount due`);
      }
      const closeTime = await validatedCloseTime(ctx);
      const late = options.forceLate || closeTime > loan.nextPaymentDueDate;
      const finalInstalment = loan.paymentRemaining <= 1;
      const kind = late ? 'latePayment' : finalInstalment ? 'regular' : 'fullPayment';

      ctx.log({
        at: Date.now(),
        level: 'info',
        stepId: step.id,
        message:
          `amount due read from the ledger: TotalValueOutstanding=${loan.totalValueOutstanding} ` +
          `PeriodicPayment=${loan.periodicPayment} PaymentRemaining=${loan.paymentRemaining} ` +
          `NextPaymentDueDate=${loan.nextPaymentDueDate} closeTime=${closeTime} kind=${kind}`,
      });

      return buildLoanPay({
        borrower: ctx.accounts.borrower,
        loanId,
        amountDrops: loan.totalValueOutstanding,
        kind,
      });
    },
    expect(snapshot) {
      const remaining = numField(snapshot.loan, 'PaymentRemaining');
      if (remaining !== null && remaining !== 0) {
        return `LoanPay succeeded but PaymentRemaining is ${remaining}, expected 0`;
      }
      return null;
    },
  };
  if (!options.forceLate) {
    // If the payment slipped past the due date between build and validation, retry
    // once with the late-payment flag rather than failing the run.
    step.recover = [stepLoanPay({ forceLate: true })];
  }
  return step;
}

/** B8 / A7. Redeem every share the depositor holds, so no dust MPToken is left behind. */
export function stepVaultWithdrawAll(): StepDef {
  return {
    id: 'vaultWithdraw',
    label: 'VaultWithdraw',
    description: 'Depositor redeems all shares and sees what the vault is actually worth.',
    signer: 'depositor',
    state: 'Pending',
    gate(ctx): StepGate {
      // Redemption is blocked for the whole Investment phase (tecTOO_SOON).
      const vault = requireSnapshot(ctx).vault;
      const redemptionDate = numField(vault, 'RedemptionDate');
      if (redemptionDate === null) {
        throw new Error('cannot gate VaultWithdraw: the Vault has no RedemptionDate');
      }
      return { locked: true, unlockAtRipple: redemptionDate };
    },
    async build(ctx) {
      const vaultId = requireId(ctx, 'vault');
      const vault = await readVault(ctx.client, vaultId);
      if (!vault) {
        throw new Error(`Vault ${vaultId} is not readable; cannot redeem shares`);
      }
      const shares = requireSnapshot(ctx).shareBalances.depositor;
      if (shares === '0') {
        throw new Error('depositor holds no shares to redeem');
      }
      return buildVaultWithdrawShares({
        depositor: ctx.accounts.depositor,
        vaultId,
        shareMPTID: vault.shareMPTID,
        shares,
      });
    },
    expect(snapshot) {
      const shares = snapshot.shareBalances.depositor;
      return shares === '0'
        ? null
        : `VaultWithdraw succeeded but the depositor still holds ${shares} shares`;
    },
  };
}

async function validatedCloseTime(ctx: ScenarioCtx): Promise<number> {
  const response = await ctx.client.request({ command: 'ledger', ledger_index: 'validated' });
  const closeTime = (response.result.ledger as unknown as Record<string, unknown>).close_time;
  if (typeof closeTime !== 'number') {
    throw new Error('validated ledger carries no numeric close_time');
  }
  return closeTime;
}
