/**
 * P1 devnet spike runner.
 *
 *   npm run scenario -- --scenario B
 *   npm run scenario -- --scenario A
 *
 * Runs the real scenario against devnet with three local-keypair accounts and prints,
 * for every step, the transaction type, hash, engine result and the raw ledger values
 * the demo will display. The full log plus every `TxResult` lands in
 * `.omc/artifacts/run-<scenario>.json` so later phases can diff against it.
 *
 * Nothing is assumed: unverified facts assert and fail the run.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dropsToXrp } from 'xrpl';

import { DEVNET_WSS, disconnectClient, getClient } from '../src/xrpl/client.ts';
import { ensureAccounts } from '../src/xrpl/faucet.ts';
import type { AccountCache } from '../src/xrpl/faucet.ts';
import { readAccount, readReserves } from '../src/xrpl/read/account.ts';
import { readLoan } from '../src/xrpl/read/loan.ts';
import { readLoanBroker } from '../src/xrpl/read/loanBroker.ts';
import { readShareBalance, readShareIssuance } from '../src/xrpl/read/shares.ts';
import { readVault } from '../src/xrpl/read/vault.ts';
import { createScenarioCtx, refreshSnapshot } from '../src/scenario/ctx.ts';
import { runStepWithRecovery } from '../src/scenario/engine.ts';
import type { StepOutcome } from '../src/scenario/engine.ts';
import { buildScenarioA } from '../src/scenario/scenarioA.ts';
import { buildScenarioB } from '../src/scenario/scenarioB.ts';
import type { LedgerSnapshot, Role, ScenarioParams, StepDef, TxLogEntry } from '../src/scenario/types.ts';
import { ROLES } from '../src/scenario/types.ts';
import { NodeSignerProvider } from '../src/wallet/nodeProvider.ts';
import { percentToRate } from '../src/xrpl/tx/loanBroker.ts';
import { rippleToIso } from '../src/lib/rippleTime.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = resolve(HERE, '..', '.omc', 'artifacts');
const ACCOUNTS_CACHE = resolve(ARTIFACTS, 'accounts.json');
const EXPLORER_TX = (hash: string): string => `https://devnet.xrpl.org/transactions/${hash}`;

/** P0 rescale (`docs/interfaces-frozen.md` section 7), with the rate scale fixed in P1. */
const PARAMS: ScenarioParams = {
  depositDrops: '78000000',
  principalDrops: '39000000',
  coverDrops: '6000000',
  coverRateMinimum: percentToRate(10),
  coverRateLiquidation: percentToRate(100),
  interestRate: percentToRate(10),
  paymentInterval: 60,
  gracePeriod: 60,
  paymentTotal: 1,
  // Closed-ended schedule (P1 finding D9). The lead has to cover VaultCreate through
  // LoanBrokerCoverDeposit, and 180s is rippled's floor on the Investment phase.
  subscriptionLeadSeconds: 45,
  investmentPeriodSeconds: 180,
};

/** Faucet floor per role: what the scenario spends plus reserves plus fee headroom. */
const MIN_BALANCE_DROPS: Record<Role, string> = {
  depositor: '82000000',
  broker: '12000000',
  borrower: '4000000',
};

// ---------------------------------------------------------------------------
// output helpers
// ---------------------------------------------------------------------------

function xrp(drops: string | null | undefined): string {
  if (drops === null || drops === undefined) {
    return '-';
  }
  try {
    return `${dropsToXrp(drops).toString()} XRP`;
  } catch {
    return String(drops);
  }
}

function field(record: Record<string, unknown> | null, name: string): string | null {
  if (!record) {
    return null;
  }
  const value = record[name];
  return value === undefined || value === null ? null : String(value);
}

/**
 * Everything printed is also kept, so the artifact carries the human-readable run log
 * next to the structured results rather than living only in a terminal scrollback.
 */
const transcript: string[] = [];
const consoleLog = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  transcript.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  consoleLog(...args);
};

function line(label: string, value: string): void {
  console.log(`    ${label.padEnd(26)} ${value}`);
}

function printSnapshot(snapshot: LedgerSnapshot): void {
  const vault = snapshot.vault;
  const broker = snapshot.loanBroker;
  const loan = snapshot.loan;

  console.log('    -- ledger --');
  if (vault) {
    line('Vault.AssetsTotal', `${field(vault, 'AssetsTotal') ?? '0'} (${xrp(field(vault, 'AssetsTotal') ?? '0')})`);
    line('Vault.AssetsAvailable', `${field(vault, 'AssetsAvailable') ?? '0'} (${xrp(field(vault, 'AssetsAvailable') ?? '0')})`);
    line('Vault.LossUnrealized', `${field(vault, 'LossUnrealized') ?? '0'} (${xrp(field(vault, 'LossUnrealized') ?? '0')})`);
    line('Vault.ShareMPTID', field(vault, 'ShareMPTID') ?? '-');
    const sub = Number(field(vault, 'SubscriptionDate') ?? '0');
    const red = Number(field(vault, 'RedemptionDate') ?? '0');
    line('Vault.VaultKind', `${field(vault, 'VaultKind') ?? '0'} (1 = closed-ended)`);
    line('Vault.SubscriptionDate', sub > 0 ? `${sub} (${rippleToIso(sub)})` : '0');
    line('Vault.RedemptionDate', red > 0 ? `${red} (${rippleToIso(red)})` : '0');
  }
  if (broker) {
    line('LoanBroker.DebtTotal', `${field(broker, 'DebtTotal') ?? '0'} (${xrp(field(broker, 'DebtTotal') ?? '0')})`);
    line('LoanBroker.CoverAvailable', `${field(broker, 'CoverAvailable') ?? '0'} (${xrp(field(broker, 'CoverAvailable') ?? '0')})`);
  }
  if (loan) {
    line('Loan.PrincipalOutstanding', `${field(loan, 'PrincipalOutstanding') ?? '0'} (${xrp(field(loan, 'PrincipalOutstanding') ?? '0')})`);
    line('Loan.TotalValueOutstanding', `${field(loan, 'TotalValueOutstanding') ?? '0'} (${xrp(field(loan, 'TotalValueOutstanding') ?? '0')})`);
    const due = Number(field(loan, 'NextPaymentDueDate') ?? '0');
    line('Loan.NextPaymentDueDate', due > 0 ? `${due} (${rippleToIso(due)})` : '0');
    line('Loan.PaymentRemaining', field(loan, 'PaymentRemaining') ?? '-');
    line('Loan.Flags', `${field(loan, 'Flags') ?? '0'} (impaired=${(Number(field(loan, 'Flags') ?? '0') & 0x00020000) !== 0}, defaulted=${(Number(field(loan, 'Flags') ?? '0') & 0x00010000) !== 0})`);
  }
  line('depositor XRP', `${snapshot.xrpBalances.depositor} (${xrp(snapshot.xrpBalances.depositor)})`);
  line('depositor shares', snapshot.shareBalances.depositor);
  line('broker XRP', `${snapshot.xrpBalances.broker} (${xrp(snapshot.xrpBalances.broker)})`);
  line('borrower XRP', `${snapshot.xrpBalances.borrower} (${xrp(snapshot.xrpBalances.borrower)})`);
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

interface OwnerCountProbe {
  label: string;
  role: Role;
  before: { ownerCount: number; balanceDrops: string };
  after: { ownerCount: number; balanceDrops: string };
}

function parseScenario(argv: readonly string[]): 'A' | 'B' {
  const index = argv.indexOf('--scenario');
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (value === 'A' || value === 'B') {
    return value;
  }
  throw new Error('usage: npm run scenario -- --scenario B|A');
}

function loadCache(): AccountCache | null {
  try {
    return JSON.parse(readFileSync(ACCOUNTS_CACHE, 'utf8')) as AccountCache;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const scenarioId = parseScenario(process.argv.slice(2));
  const startedAt = Date.now();
  console.log(`XLS-65/66 scenario ${scenarioId} on ${DEVNET_WSS}`);

  const client = await getClient(DEVNET_WSS);
  const reserves = await readReserves(client);
  console.log(
    `reserves: base ${reserves.baseDrops} drops, owner increment ${reserves.incrementDrops} drops`,
  );

  const provisioning = await ensureAccounts(client, {
    names: ROLES,
    minBalanceDrops: MIN_BALANCE_DROPS,
    cache: loadCache(),
    onProgress: (message) => {
      console.log(`  faucet: ${message}`);
    },
  });
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(ACCOUNTS_CACHE, `${JSON.stringify(provisioning.cache, null, 2)}\n`);

  const accounts = {
    depositor: provisioning.accounts.depositor!.address,
    broker: provisioning.accounts.broker!.address,
    borrower: provisioning.accounts.borrower!.address,
  } satisfies Record<Role, string>;
  const seeds = {
    depositor: provisioning.accounts.depositor!.seed,
    broker: provisioning.accounts.broker!.seed,
    borrower: provisioning.accounts.borrower!.seed,
  } satisfies Record<Role, string>;

  for (const role of ROLES) {
    console.log(`  ${role.padEnd(9)} ${accounts[role]}`);
  }

  const txLog: TxLogEntry[] = [];
  const ctx = createScenarioCtx({
    client,
    signers: new NodeSignerProvider({ seeds }),
    accounts,
    params: PARAMS,
    // The Node runner has no downgrade path; the field is required by the frozen type.
    fallbackDepositor: { address: accounts.depositor, seed: seeds.depositor },
    log: (entry) => {
      txLog.push(entry);
    },
  });

  await refreshSnapshot(ctx);
  console.log('\ninitial state');
  printSnapshot(ctx.snapshot!);

  const steps: StepDef[] = scenarioId === 'B' ? buildScenarioB() : buildScenarioA();
  const outcomes: StepOutcome[] = [];
  const ownerProbes: OwnerCountProbe[] = [];
  const stepTimings: { id: string; ms: number; gateMs: number }[] = [];

  for (const step of steps) {
    console.log(`\n[${step.id}] ${step.label}`);
    console.log(`    ${step.description}`);

    const probeRole: Role = step.signer;
    const before = await readAccount(client, accounts[probeRole]);
    const t0 = Date.now();

    const outcome = await runStepWithRecovery(ctx, step, {
      submit: { explorerTxUrl: EXPLORER_TX, pollIntervalMs: 1_000, maxWaitMs: 180_000 },
      gatePollMs: 2_000,
      hooks: {
        onStepState: (_step, state) => {
          console.log(`    state -> ${state}`);
        },
        onGateTick: (_step, remaining, unlockAt) => {
          console.log(
            `    gate closed: ${remaining.toFixed(0)}s remaining ` +
              `(unlocks at ripple ${unlockAt} = ${rippleToIso(unlockAt)})`,
          );
        },
        onNotice: (message) => {
          console.log(`    notice: ${message}`);
        },
        onExpectViolation: (_step, message) => {
          console.log(`    WARN  ${message}`);
        },
      },
    });

    const after = await readAccount(client, accounts[probeRole]);
    ownerProbes.push({
      label: step.label,
      role: probeRole,
      before: { ownerCount: before.ownerCount, balanceDrops: before.balanceDrops },
      after: { ownerCount: after.ownerCount, balanceDrops: after.balanceDrops },
    });
    stepTimings.push({ id: step.id, ms: Date.now() - t0, gateMs: outcome.gateWaitedMs });

    line('type', step.label);
    line('hash', outcome.result.hash);
    line('engineResult', outcome.result.engineResult);
    line('validated', String(outcome.result.validated));
    line('ledgerIndex', String(outcome.result.ledgerIndex));
    line('explorer', outcome.result.explorerUrl ?? '-');
    line('ownerCount', `${before.ownerCount} -> ${after.ownerCount} (${probeRole})`);
    printSnapshot(outcome.snapshot);

    outcomes.push(outcome);
  }

  // -------------------------------------------------------------------------
  // measurements the plan asks P1 to freeze
  // -------------------------------------------------------------------------
  const finalVault = ctx.ids.vault ? await readVault(client, ctx.ids.vault) : null;
  const finalBroker = ctx.ids.loanBroker ? await readLoanBroker(client, ctx.ids.loanBroker) : null;
  const finalLoan = ctx.ids.loan ? await readLoan(client, ctx.ids.loan) : null;
  const shareIssuance = finalVault ? await readShareIssuance(client, finalVault.shareMPTID) : null;
  const finalDepositorShares = finalVault
    ? await readShareBalance(client, finalVault.shareMPTID, accounts.depositor)
    : '0';

  const depositorStart = BigInt(provisioning.accounts.depositor!.balanceDrops);
  const depositorEnd = BigInt((await readAccount(client, accounts.depositor)).balanceDrops);

  console.log('\n=== measurements ===');
  line('depositor XRP start', `${depositorStart} (${xrp(depositorStart.toString())})`);
  line('depositor XRP end', `${depositorEnd} (${xrp(depositorEnd.toString())})`);
  line('depositor net (drops)', (depositorEnd - depositorStart).toString());
  line('deposit principal', `${PARAMS.depositDrops} (${xrp(PARAMS.depositDrops)})`);
  line('shares outstanding', shareIssuance?.outstandingAmount ?? '-');
  line('depositor shares left', finalDepositorShares);
  if (finalVault) {
    line('final AssetsTotal', `${finalVault.assetsTotal} (${xrp(finalVault.assetsTotal)})`);
    line('final AssetsAvailable', `${finalVault.assetsAvailable} (${xrp(finalVault.assetsAvailable)})`);
    line('final LossUnrealized', `${finalVault.lossUnrealized} (${xrp(finalVault.lossUnrealized)})`);
  }
  if (finalBroker) {
    line('final DebtTotal', finalBroker.debtTotal);
    line('final CoverAvailable', `${finalBroker.coverAvailable} (${xrp(finalBroker.coverAvailable)})`);
  }

  console.log('\n  owner reserve deltas (ownerCount change per step)');
  for (const probe of ownerProbes) {
    const delta = probe.after.ownerCount - probe.before.ownerCount;
    const spent = BigInt(probe.before.balanceDrops) - BigInt(probe.after.balanceDrops);
    console.log(
      `    ${probe.label.padEnd(30)} ${probe.role.padEnd(9)} ownerCount ${delta >= 0 ? '+' : ''}${delta}` +
        `  balance -${spent.toString()} drops`,
    );
  }

  console.log('\n  step timings');
  for (const timing of stepTimings) {
    console.log(
      `    ${timing.id.padEnd(18)} ${(timing.ms / 1000).toFixed(1)}s` +
        (timing.gateMs > 0 ? ` (gate ${(timing.gateMs / 1000).toFixed(1)}s)` : ''),
    );
  }
  console.log(`  total ${(Date.now() - startedAt) / 1000}s`);

  const artifact = {
    scenario: scenarioId,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    endpoint: DEVNET_WSS,
    params: PARAMS,
    reserves,
    accounts,
    ids: ctx.ids,
    faucetCalls: provisioning.faucetCalls,
    startingBalances: Object.fromEntries(
      ROLES.map((role) => [role, provisioning.accounts[role]!.balanceDrops]),
    ),
    steps: outcomes.map((outcome) => ({
      id: outcome.step.id,
      label: outcome.step.label,
      signer: outcome.step.signer,
      coSigner: outcome.step.coSigner ?? null,
      state: outcome.step.state,
      warnings: outcome.warnings,
      gateWaitedMs: outcome.gateWaitedMs,
      result: outcome.result,
      snapshot: outcome.snapshot,
    })),
    ownerProbes,
    stepTimings,
    final: {
      vault: finalVault?.raw ?? null,
      loanBroker: finalBroker?.raw ?? null,
      loan: finalLoan?.raw ?? null,
      shareIssuance: shareIssuance?.raw ?? null,
      depositorShares: finalDepositorShares,
      depositorStartDrops: depositorStart.toString(),
      depositorEndDrops: depositorEnd.toString(),
      depositorNetDrops: (depositorEnd - depositorStart).toString(),
    },
    txLog,
    transcript,
  };
  const artifactPath = resolve(ARTIFACTS, `run-${scenarioId}.json`);
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`\nwrote ${artifactPath}`);
}

main()
  .then(async () => {
    await disconnectClient();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('\nRUN FAILED');
    console.error(error);
    await disconnectClient().catch(() => undefined);
    process.exit(1);
  });
