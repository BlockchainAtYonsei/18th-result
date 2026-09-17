/**
 * P0 environment probe.
 *
 * Measures every fact the XLS-65/66 demo depends on against live devnet and asserts the
 * ones the plan calls blocking. Exits 1 if any required check fails. Nothing here is
 * guessed: xrpl.js names come from the shipped typings, ledger facts come from rippled.
 *
 *   npx tsx scripts/probe-env.ts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Client,
  LoanManageFlags,
  LoanPayFlags,
  LoanSetFlags,
  VaultCreateFlags,
  VaultWithdrawalPolicy,
  Wallet,
  combineLoanSetCounterpartySigners,
  dropsToXrp,
  hashes,
  signLoanSetByCounterparty,
  xrpToDrops,
} from 'xrpl';
import type { LedgerStream } from 'xrpl';

const DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233';
const DEVNET_FAUCET_URL = 'https://faucet.devnet.rippletest.net/accounts';
/** Well-known Amendments singleton object id (xrpl.js: models/ledger/Amendments AMENDMENTS_ID). */
const AMENDMENTS_INDEX = '7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4';
const REQUIRED_AMENDMENTS = ['SingleAssetVault', 'LendingProtocol'] as const;
/**
 * Fallback control for the name -> id hashing, used only when the `feature` command is
 * unavailable. Devnet resets change which amendments are enabled, so this list is
 * deliberately tiny and the check only needs one hit.
 */
const CONTROL_AMENDMENTS = ['Flow', 'AMM', 'MPTokensV1', 'DID'] as const;
/** Minimum `feature` entries required before its cross-validation is considered meaningful. */
const MIN_FEATURE_ENTRIES_FOR_VALIDATION = 20;
const LEDGER_EVENTS_TO_CAPTURE = 10;
const CONNECT_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// check registry
// ---------------------------------------------------------------------------

type Severity = 'required' | 'advisory';

interface CheckRow {
  id: string;
  severity: Severity;
  ok: boolean;
  detail: string;
}

const checks: CheckRow[] = [];

function check(id: string, severity: Severity, ok: boolean, detail: string): boolean {
  checks.push({ id, severity, ok, detail });
  const badge = ok ? 'PASS' : severity === 'required' ? 'FAIL' : 'WARN';
  console.log(`[${badge}] ${id} :: ${detail}`);
  return ok;
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    setTimeout(r, ms);
  });
}

function errText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function rippledErrorCode(error: unknown): string | null {
  const data = (error as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === 'string' ? data.error : null;
}

/** rippled derives an amendment id as sha512half(featureName) over ASCII bytes. */
function amendmentId(name: string): string {
  return createHash('sha512').update(Buffer.from(name, 'ascii')).digest('hex').slice(0, 64).toUpperCase();
}

// ---------------------------------------------------------------------------
// measurements
// ---------------------------------------------------------------------------

interface Measurements {
  probedAt: string;
  endpoint: { wss: string; faucet: string; buildVersion: string | null; networkId: number | null };
  amendments: {
    ledgerEntryIndex: string;
    enabledCount: number;
    hashingValidation: {
      method: 'feature-cross-check' | 'control-list' | 'none';
      matched: number;
      mismatched: number;
      mismatchSamples: string[];
    };
    required: Record<string, { id: string; enabled: boolean }>;
    featureCommand: {
      available: boolean;
      error: string | null;
      totalEntries: number;
      entries: Record<string, boolean>;
    };
    malformedVaultCreate: { attempted: boolean; engineResult: string | null; note: string };
  };
  xrplExports: {
    counterpartySigner: Record<string, string>;
    hashHelpers: Record<string, string>;
    flagEnums: Record<string, Record<string, number>>;
  };
  faucet: { attempts: number; address: string | null; grantedXrp: number | null; elapsedMs: number | null };
  reserves: {
    source: string;
    baseXrp: number | null;
    ownerIncrementXrp: number | null;
    assumptions: Record<string, string>;
  };
  ledgerStream: {
    closeTimeField: string;
    samples: Array<{ ledgerIndex: number; ledgerTime: number; perfNow: number }>;
    intervalsSeconds: number[];
    averageSeconds: number | null;
    maxSeconds: number | null;
  };
  vaultInfo: { exists: boolean; errorCode: string | null };
  rescale: RescaleResult | null;
  checks: CheckRow[];
}

interface RescaleResult {
  inputs: {
    faucetXrp: number;
    baseReserveXrp: number;
    ownerIncrementXrp: number;
    objectReserveUpperBoundXrp: number;
    feeMarginXrp: number;
    coverRateMinimumPercent: number;
    coverRateLiquidationPercent: number;
    interestRatePercent: number;
  };
  proposal: { depositXrp: number; principalXrp: number; coverXrp: number; interestDueXrp: number };
  drops: { depositDrops: string; principalDrops: string; coverDrops: string };
  funding: Record<string, { needXrp: number; haveXrp: number; ok: boolean }>;
  inequalities: {
    loanSetFeasible: { lhs: number; rhs: number; ok: boolean; expression: string };
    vaultLossOccurs: { lhs: number; rhs: number; ok: boolean; expression: string };
  };
}

const measurements: Measurements = {
  probedAt: new Date().toISOString(),
  endpoint: { wss: DEVNET_WSS, faucet: DEVNET_FAUCET_URL, buildVersion: null, networkId: null },
  amendments: {
    ledgerEntryIndex: AMENDMENTS_INDEX,
    enabledCount: 0,
    hashingValidation: { method: 'none', matched: 0, mismatched: 0, mismatchSamples: [] },
    required: {},
    featureCommand: { available: false, error: null, totalEntries: 0, entries: {} },
    malformedVaultCreate: { attempted: false, engineResult: null, note: '' },
  },
  xrplExports: { counterpartySigner: {}, hashHelpers: {}, flagEnums: {} },
  faucet: { attempts: 0, address: null, grantedXrp: null, elapsedMs: null },
  reserves: { source: 'server_info.info.validated_ledger', baseXrp: null, ownerIncrementXrp: null, assumptions: {} },
  ledgerStream: {
    closeTimeField: 'ledger_time',
    samples: [],
    intervalsSeconds: [],
    averageSeconds: null,
    maxSeconds: null,
  },
  vaultInfo: { exists: false, errorCode: null },
  rescale: null,
  checks,
};

// ---------------------------------------------------------------------------
// (b) xrpl.js surface - no network needed
// ---------------------------------------------------------------------------

function probeXrplExports(): void {
  section('b. xrpl.js exports and flag constants');

  const fns: Record<string, unknown> = {
    signLoanSetByCounterparty,
    combineLoanSetCounterpartySigners,
  };
  for (const [name, value] of Object.entries(fns)) {
    measurements.xrplExports.counterpartySigner[name] = typeof value;
    check(`export.${name}`, 'required', typeof value === 'function', `typeof === ${typeof value}`);
  }

  for (const name of ['hashVault', 'hashLoanBroker', 'hashLoan'] as const) {
    const value = (hashes as unknown as Record<string, unknown>)[name];
    measurements.xrplExports.hashHelpers[name] = typeof value;
    check(
      `export.hashes.${name}`,
      'required',
      typeof value === 'function',
      `typeof === ${typeof value} (deterministic object id, preferred over meta scraping)`,
    );
  }

  const enums: Record<string, Record<string, unknown>> = {
    LoanManageFlags: LoanManageFlags as unknown as Record<string, unknown>,
    LoanPayFlags: LoanPayFlags as unknown as Record<string, unknown>,
    LoanSetFlags: LoanSetFlags as unknown as Record<string, unknown>,
    VaultCreateFlags: VaultCreateFlags as unknown as Record<string, unknown>,
    VaultWithdrawalPolicy: VaultWithdrawalPolicy as unknown as Record<string, unknown>,
  };
  for (const [enumName, enumValue] of Object.entries(enums)) {
    const numeric: Record<string, number> = {};
    for (const [key, value] of Object.entries(enumValue)) {
      if (typeof value === 'number') {
        numeric[key] = value;
      }
    }
    measurements.xrplExports.flagEnums[enumName] = numeric;
  }

  const requiredFlags: Array<[string, Record<string, number>, string]> = [
    ['LoanManageFlags.tfLoanDefault', measurements.xrplExports.flagEnums.LoanManageFlags, 'tfLoanDefault'],
    ['LoanManageFlags.tfLoanImpair', measurements.xrplExports.flagEnums.LoanManageFlags, 'tfLoanImpair'],
    ['LoanManageFlags.tfLoanUnimpair', measurements.xrplExports.flagEnums.LoanManageFlags, 'tfLoanUnimpair'],
    ['LoanPayFlags.tfLoanFullPayment', measurements.xrplExports.flagEnums.LoanPayFlags, 'tfLoanFullPayment'],
    ['LoanPayFlags.tfLoanOverpayment', measurements.xrplExports.flagEnums.LoanPayFlags, 'tfLoanOverpayment'],
  ];
  for (const [label, table, key] of requiredFlags) {
    const value = table[key];
    check(label, 'required', typeof value === 'number', `= ${String(value)}`);
  }

  // Plan section 3 P0 item 2: a missing tfLoanLatePayment is a warning, not a blocker,
  // because it only changes which A7 recovery path is used.
  const latePayment = measurements.xrplExports.flagEnums.LoanPayFlags.tfLoanLatePayment;
  check(
    'LoanPayFlags.tfLoanLatePayment',
    'advisory',
    typeof latePayment === 'number',
    typeof latePayment === 'number'
      ? `= ${latePayment} (A7 primary path available)`
      : 'absent - activate the A7 alternative path (PaymentInterval raise)',
  );
}

// ---------------------------------------------------------------------------
// (a) amendments
// ---------------------------------------------------------------------------

async function probeAmendments(client: Client, wallet: Wallet | null): Promise<void> {
  section('a. amendments');

  const response = await client.request({
    command: 'ledger_entry',
    index: AMENDMENTS_INDEX,
    ledger_index: 'validated',
  });
  const node = (response.result as unknown as { node?: { Amendments?: string[] } }).node;
  const enabled = new Set(node?.Amendments ?? []);
  measurements.amendments.enabledCount = enabled.size;

  // Secondary source. Admin-only on many nodes; a rejection is ignored, but when it does
  // answer it gives the authoritative id -> name table, which validates our hashing.
  let featureTable: Record<string, { enabled: boolean; name: string }> | null = null;
  try {
    const feature = await client.request({ command: 'feature' });
    featureTable =
      (feature.result as unknown as { features?: Record<string, { enabled: boolean; name: string }> })
        .features ?? null;
    measurements.amendments.featureCommand.available = true;
    if (featureTable) {
      measurements.amendments.featureCommand.totalEntries = Object.keys(featureTable).length;
      for (const info of Object.values(featureTable)) {
        if ((REQUIRED_AMENDMENTS as readonly string[]).includes(info.name)) {
          measurements.amendments.featureCommand.entries[info.name] = info.enabled;
        }
      }
    }
    check(
      'amendment.featureCommand',
      'advisory',
      true,
      `available, ${measurements.amendments.featureCommand.totalEntries} features; ` +
        `${JSON.stringify(measurements.amendments.featureCommand.entries)}`,
    );
  } catch (error) {
    measurements.amendments.featureCommand.error = rippledErrorCode(error) ?? errText(error);
    check(
      'amendment.featureCommand',
      'advisory',
      false,
      `unavailable (${measurements.amendments.featureCommand.error}) - ignored, the ledger entry is the pass criterion`,
    );
  }

  // Prove sha512half(name) really is the amendment id before trusting the lookup above.
  const validation = measurements.amendments.hashingValidation;
  if (featureTable && Object.keys(featureTable).length >= MIN_FEATURE_ENTRIES_FOR_VALIDATION) {
    validation.method = 'feature-cross-check';
    for (const [id, info] of Object.entries(featureTable)) {
      if (amendmentId(info.name) === id.toUpperCase()) {
        validation.matched += 1;
      } else {
        validation.mismatched += 1;
        if (validation.mismatchSamples.length < 5) {
          validation.mismatchSamples.push(`${info.name} -> ${id}`);
        }
      }
    }
    check(
      'amendment.hashing',
      'required',
      validation.mismatched === 0 && validation.matched > 0,
      `sha512half(name) reproduced ${validation.matched}/${validation.matched + validation.mismatched} ` +
        `feature ids, ${validation.mismatched} mismatches`,
    );
  } else {
    validation.method = 'control-list';
    // Which amendments are *enabled* changes across devnet resets, so one hit is enough
    // to prove the hashing; it cannot match by accident.
    const hits = CONTROL_AMENDMENTS.filter((name) => enabled.has(amendmentId(name)));
    validation.matched = hits.length;
    check(
      'amendment.hashing',
      'required',
      hits.length >= 1,
      `feature command unavailable; sha512half(name) matched enabled controls: ${hits.join(', ') || 'none'}`,
    );
  }

  for (const name of REQUIRED_AMENDMENTS) {
    const id = amendmentId(name);
    const isEnabled = enabled.has(id);
    measurements.amendments.required[name] = { id, enabled: isEnabled };
    check(`amendment.${name}`, 'required', isEnabled, `${id} enabled=${String(isEnabled)}`);
  }

  // Reference only: a deliberately malformed VaultCreate separates "amendment off"
  // (temDISABLED) from "amendment on, fields wrong" (temMALFORMED).
  if (wallet) {
    measurements.amendments.malformedVaultCreate.attempted = true;
    try {
      const submitted = await client.submit(
        {
          TransactionType: 'VaultCreate',
          Account: wallet.classicAddress,
          Asset: { currency: 'XRP' },
          // 99 is not a defined VaultWithdrawalPolicy; xrpl.js accepts any number.
          WithdrawalPolicy: 99,
        },
        { wallet, autofill: true, failHard: true },
      );
      const engineResult = submitted.result.engine_result;
      measurements.amendments.malformedVaultCreate.engineResult = engineResult;
      measurements.amendments.malformedVaultCreate.note =
        engineResult === 'temDISABLED'
          ? 'amendment NOT active'
          : 'amendment active (field-level rejection)';
      check(
        'amendment.malformedVaultCreate',
        'advisory',
        engineResult !== 'temDISABLED',
        `${engineResult} - ${measurements.amendments.malformedVaultCreate.note}`,
      );
    } catch (error) {
      measurements.amendments.malformedVaultCreate.note = errText(error);
      check('amendment.malformedVaultCreate', 'advisory', false, `probe failed: ${errText(error)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// (c) faucet
// ---------------------------------------------------------------------------

async function probeFaucet(client: Client): Promise<Wallet | null> {
  section('c. faucet');
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    measurements.faucet.attempts = attempt;
    const startedAt = Date.now();
    try {
      const funded = await client.fundWallet();
      measurements.faucet.elapsedMs = Date.now() - startedAt;
      measurements.faucet.address = funded.wallet.classicAddress;
      measurements.faucet.grantedXrp = funded.balance;
      check(
        'faucet.fundWallet',
        'required',
        funded.balance > 0,
        `${funded.wallet.classicAddress} funded with ${funded.balance} XRP in ${measurements.faucet.elapsedMs}ms`,
      );
      return funded.wallet;
    } catch (error) {
      lastError = errText(error);
      console.log(`  faucet attempt ${attempt}/3 failed: ${lastError}`);
      if (attempt < 3) {
        await sleep(attempt * 4_000);
      }
    }
  }
  check('faucet.fundWallet', 'required', false, `3 attempts failed, last error: ${lastError}`);
  return null;
}

// ---------------------------------------------------------------------------
// (d) reserves
// ---------------------------------------------------------------------------

async function probeReserves(client: Client): Promise<void> {
  section('d. reserves');
  const info = await client.request({ command: 'server_info' });
  const validated = info.result.info.validated_ledger;
  const baseXrp = validated?.reserve_base_xrp ?? null;
  const incXrp = validated?.reserve_inc_xrp ?? null;
  measurements.reserves.baseXrp = baseXrp;
  measurements.reserves.ownerIncrementXrp = incXrp;
  measurements.reserves.assumptions = {
    shareMPToken: 'holding the Vault share MPToken costs 1 owner reserve increment (assumption, confirm in P1)',
    vaultObject: 'Vault owner reserve increment unmeasured; conservative upper bound 2 XRP until P1',
    loanBrokerObject: 'LoanBroker owner reserve increment unmeasured; conservative upper bound 2 XRP until P1',
    loanObject: 'Loan owner reserve increment unmeasured; conservative upper bound 2 XRP until P1',
  };
  check(
    'reserve.base',
    'required',
    typeof baseXrp === 'number' && baseXrp > 0,
    `reserve_base_xrp = ${String(baseXrp)} XRP`,
  );
  check(
    'reserve.increment',
    'required',
    typeof incXrp === 'number' && incXrp > 0,
    `reserve_inc_xrp = ${String(incXrp)} XRP`,
  );
}

// ---------------------------------------------------------------------------
// (e) ledger stream
// ---------------------------------------------------------------------------

async function probeLedgerStream(client: Client): Promise<void> {
  section('e. ledgerClosed stream');
  const samples: Array<{ ledgerIndex: number; ledgerTime: number; perfNow: number }> = [];

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      cleanup();
      rejectPromise(new Error(`only ${samples.length}/${LEDGER_EVENTS_TO_CAPTURE} ledger events in 120s`));
    }, 120_000);

    function onLedger(ledger: LedgerStream): void {
      samples.push({
        ledgerIndex: ledger.ledger_index,
        ledgerTime: ledger.ledger_time,
        perfNow: performance.now(),
      });
      console.log(
        `  ledgerClosed #${ledger.ledger_index} ledger_time=${ledger.ledger_time} (${samples.length}/${LEDGER_EVENTS_TO_CAPTURE})`,
      );
      if (samples.length >= LEDGER_EVENTS_TO_CAPTURE) {
        cleanup();
        resolvePromise();
      }
    }

    function cleanup(): void {
      clearTimeout(timer);
      client.off('ledgerClosed', onLedger);
    }

    client.on('ledgerClosed', onLedger);
    client
      .request({ command: 'subscribe', streams: ['ledger'] })
      .catch((error: unknown) => {
        cleanup();
        rejectPromise(error instanceof Error ? error : new Error(String(error)));
      });
  });

  await client.request({ command: 'unsubscribe', streams: ['ledger'] });

  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    intervals.push(samples[i].ledgerTime - samples[i - 1].ledgerTime);
  }
  const average = intervals.length
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : null;
  const max = intervals.length ? Math.max(...intervals) : null;

  measurements.ledgerStream.samples = samples;
  measurements.ledgerStream.intervalsSeconds = intervals;
  measurements.ledgerStream.averageSeconds = average;
  measurements.ledgerStream.maxSeconds = max;

  const hasCloseTime = samples.every((s) => Number.isFinite(s.ledgerTime) && s.ledgerTime > 0);
  check(
    'ledgerStream.closeTimeField',
    'required',
    hasCloseTime,
    `field name is "ledger_time" (ripple seconds); ${samples.length} samples all populated`,
  );
  check(
    'ledgerStream.interval',
    'required',
    average !== null,
    `avg ${average === null ? 'n/a' : average.toFixed(2)}s, max ${max === null ? 'n/a' : String(max)}s over ${intervals.length} gaps`,
  );
}

// ---------------------------------------------------------------------------
// (f) vault_info
// ---------------------------------------------------------------------------

async function probeVaultInfo(client: Client): Promise<void> {
  section('f. vault_info RPC');
  const dummyVaultId = '0'.repeat(64);
  try {
    await client.request({ command: 'vault_info', vault_id: dummyVaultId });
    measurements.vaultInfo.exists = true;
    check('vaultInfo.method', 'advisory', true, 'vault_info answered a dummy id without error');
  } catch (error) {
    const code = rippledErrorCode(error);
    measurements.vaultInfo.errorCode = code;
    const exists = code !== null && code !== 'unknownCmd';
    measurements.vaultInfo.exists = exists;
    check(
      'vaultInfo.method',
      'advisory',
      exists,
      exists
        ? `method exists; dummy id returned "${String(code)}" (expected entryNotFound)`
        : `method missing (${String(code)}) - ledger_entry stays the only source`,
    );
  }
}

// ---------------------------------------------------------------------------
// (g) rescale
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeRescale(): RescaleResult | null {
  section('g. amount rescale');
  const faucetXrp = measurements.faucet.grantedXrp;
  const baseReserveXrp = measurements.reserves.baseXrp;
  const ownerIncrementXrp = measurements.reserves.ownerIncrementXrp;
  if (faucetXrp === null || baseReserveXrp === null || ownerIncrementXrp === null) {
    check('rescale', 'required', false, 'cannot rescale without faucet amount and reserves');
    return null;
  }

  const objectReserveUpperBoundXrp = 2; // Vault / LoanBroker / Loan, per plan until P1 measures them
  const feeMarginXrp = 1;
  const coverRateMinimumPercent = 10;
  const coverRateLiquidationPercent = 100;
  const interestRatePercent = 10;

  // Worst-case account overheads. The broker owns the Vault and the LoanBroker; the
  // borrower owns the Loan; the depositor holds one share MPToken.
  const overheadBroker = baseReserveXrp + 2 * objectReserveUpperBoundXrp + feeMarginXrp;
  const overheadDepositor = baseReserveXrp + ownerIncrementXrp + feeMarginXrp;
  const overheadBorrower = baseReserveXrp + objectReserveUpperBoundXrp + feeMarginXrp;

  // Depositor can spend what is left after its own overhead; keep 20% slack.
  const depositXrp = Math.max(1, Math.floor((faucetXrp - overheadDepositor) * 0.8));
  // The vault must still hold assets after the loan is drawn, so the principal is half.
  const principalXrp = Math.max(1, Math.floor(depositXrp * 0.5));
  const interestDueXrp = round2(principalXrp * (interestRatePercent / 100));
  const minimumCoverXrp = round2((principalXrp + interestDueXrp) * (coverRateMinimumPercent / 100));
  // One extra XRP of headroom keeps (i) satisfied against rounding in rippled's own maths.
  const coverXrp = Math.ceil(minimumCoverXrp) + 1;
  const defaultAmountXrp = round2(principalXrp + interestDueXrp);
  const liquidationCapXrp = round2(minimumCoverXrp * (coverRateLiquidationPercent / 100));

  const funding: RescaleResult['funding'] = {
    depositor: {
      needXrp: round2(depositXrp + overheadDepositor),
      haveXrp: faucetXrp,
      ok: depositXrp + overheadDepositor <= faucetXrp,
    },
    broker: {
      needXrp: round2(coverXrp + overheadBroker),
      haveXrp: faucetXrp,
      ok: coverXrp + overheadBroker <= faucetXrp,
    },
    borrower: { needXrp: round2(overheadBorrower), haveXrp: faucetXrp, ok: overheadBorrower <= faucetXrp },
  };

  const loanSetLhs = coverXrp;
  const loanSetRhs = minimumCoverXrp;
  const vaultLossLhs = Math.min(coverXrp, liquidationCapXrp);
  const vaultLossRhs = defaultAmountXrp;

  const result: RescaleResult = {
    inputs: {
      faucetXrp,
      baseReserveXrp,
      ownerIncrementXrp,
      objectReserveUpperBoundXrp,
      feeMarginXrp,
      coverRateMinimumPercent,
      coverRateLiquidationPercent,
      interestRatePercent,
    },
    proposal: { depositXrp, principalXrp, coverXrp, interestDueXrp },
    drops: {
      depositDrops: xrpToDrops(depositXrp),
      principalDrops: xrpToDrops(principalXrp),
      coverDrops: xrpToDrops(coverXrp),
    },
    funding,
    inequalities: {
      loanSetFeasible: {
        lhs: loanSetLhs,
        rhs: loanSetRhs,
        ok: loanSetLhs >= loanSetRhs,
        expression: 'cover >= (DebtTotal + Principal + InterestDue) x CoverRateMinimum, DebtTotal = 0',
      },
      vaultLossOccurs: {
        lhs: vaultLossLhs,
        rhs: vaultLossRhs,
        ok: vaultLossLhs < vaultLossRhs,
        expression: 'min(cover, MinimumCover x CoverRateLiquidation) < DefaultAmount',
      },
    },
  };

  console.log(
    `  proposal: deposit D=${depositXrp} XRP, principal P=${principalXrp} XRP, cover C=${coverXrp} XRP` +
      ` (interestDue ~= ${interestDueXrp} XRP, MinimumCover ~= ${minimumCoverXrp} XRP)`,
  );
  for (const [role, row] of Object.entries(funding)) {
    check(`rescale.funding.${role}`, 'required', row.ok, `needs ${row.needXrp} XRP, faucet grants ${row.haveXrp} XRP`);
  }
  check(
    'rescale.loanSetFeasible',
    'required',
    result.inequalities.loanSetFeasible.ok,
    `${loanSetLhs} >= ${loanSetRhs} (${result.inequalities.loanSetFeasible.expression})`,
  );
  check(
    'rescale.vaultLossOccurs',
    'required',
    result.inequalities.vaultLossOccurs.ok,
    `${vaultLossLhs} < ${vaultLossRhs} (${result.inequalities.vaultLossOccurs.expression})`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// driver
// ---------------------------------------------------------------------------

async function connectWithRetry(): Promise<Client> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
    const client = new Client(DEVNET_WSS, { timeout: 20_000 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      console.log(`  connect attempt ${attempt}/${CONNECT_ATTEMPTS} failed: ${errText(error)}`);
      try {
        await client.disconnect();
      } catch {
        /* the connection never came up; nothing to close */
      }
      if (attempt < CONNECT_ATTEMPTS) {
        await sleep(attempt * 3_000);
      }
    }
  }
  throw new Error(`could not connect to ${DEVNET_WSS}: ${errText(lastError)}`);
}

function printSummary(): void {
  section('summary');
  const m = measurements;
  const rows: Array<[string, string]> = [
    ['rippled build', `${String(m.endpoint.buildVersion)} (networkID ${String(m.endpoint.networkId)})`],
    [
      'amendment hashing',
      `${m.amendments.hashingValidation.method} (${m.amendments.hashingValidation.matched} ok, ${m.amendments.hashingValidation.mismatched} bad)`,
    ],
    ['SingleAssetVault', String(m.amendments.required.SingleAssetVault?.enabled)],
    ['LendingProtocol', String(m.amendments.required.LendingProtocol?.enabled)],
    ['malformed VaultCreate', String(m.amendments.malformedVaultCreate.engineResult)],
    ['faucet grant', `${String(m.faucet.grantedXrp)} XRP`],
    ['reserve_base_xrp', `${String(m.reserves.baseXrp)} XRP`],
    ['reserve_inc_xrp', `${String(m.reserves.ownerIncrementXrp)} XRP`],
    ['close interval avg/max', `${m.ledgerStream.averageSeconds?.toFixed(2) ?? 'n/a'}s / ${String(m.ledgerStream.maxSeconds)}s`],
    ['close time field', m.ledgerStream.closeTimeField],
    ['vault_info', m.vaultInfo.exists ? `exists (${String(m.vaultInfo.errorCode)})` : 'missing'],
    ['tfLoanLatePayment', String(m.xrplExports.flagEnums.LoanPayFlags?.tfLoanLatePayment)],
  ];
  if (m.rescale) {
    rows.push(
      ['deposit D', `${m.rescale.proposal.depositXrp} XRP (${m.rescale.drops.depositDrops} drops)`],
      ['principal P', `${m.rescale.proposal.principalXrp} XRP (${m.rescale.drops.principalDrops} drops)`],
      ['cover C', `${m.rescale.proposal.coverXrp} XRP (${m.rescale.drops.coverDrops} drops)`],
      ['inequality (i)', m.rescale.inequalities.loanSetFeasible.ok ? 'PASS' : 'FAIL'],
      ['inequality (ii)', m.rescale.inequalities.vaultLossOccurs.ok ? 'PASS' : 'FAIL'],
    );
  }

  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) {
    console.log(`  ${label.padEnd(width)} | ${value}`);
  }

  const failed = checks.filter((c) => !c.ok && c.severity === 'required');
  const warned = checks.filter((c) => !c.ok && c.severity === 'advisory');
  console.log(`\n  checks: ${checks.length} total, ${failed.length} required failures, ${warned.length} advisories`);
  for (const row of failed) {
    console.log(`  FAIL ${row.id}: ${row.detail}`);
  }
  for (const row of warned) {
    console.log(`  WARN ${row.id}: ${row.detail}`);
  }
}

function writeArtifact(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, '..', '.omc', 'artifacts', 'probe-env.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(measurements, null, 2)}\n`, 'utf8');
  return outPath;
}

async function main(): Promise<void> {
  probeXrplExports();

  const client = await connectWithRetry();
  measurements.endpoint.buildVersion = client.buildVersion ?? null;
  measurements.endpoint.networkId = client.networkID ?? null;
  console.log(
    `\nconnected to ${DEVNET_WSS} (rippled ${String(client.buildVersion)}, networkID ${String(client.networkID)})`,
  );

  try {
    await probeReserves(client);
    const wallet = await probeFaucet(client);
    if (wallet) {
      const drops = await client.request({
        command: 'account_info',
        account: wallet.classicAddress,
        ledger_index: 'validated',
      });
      console.log(
        `  on-ledger balance: ${dropsToXrp(drops.result.account_data.Balance)} XRP (${drops.result.account_data.Balance} drops)`,
      );
    }
    await probeAmendments(client, wallet);
    await probeVaultInfo(client);
    await probeLedgerStream(client);
    measurements.rescale = computeRescale();
  } finally {
    await client.disconnect();
  }

  printSummary();
  const outPath = writeArtifact();
  console.log(`\n  measurements written to ${outPath}`);

  const failures = checks.filter((c) => !c.ok && c.severity === 'required');
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\nprobe aborted: ${errText(error)}`);
  check('probe.completed', 'required', false, errText(error));
  try {
    printSummary();
    writeArtifact();
  } catch {
    /* the artifact is best-effort once the probe has already failed */
  }
  process.exit(1);
});
