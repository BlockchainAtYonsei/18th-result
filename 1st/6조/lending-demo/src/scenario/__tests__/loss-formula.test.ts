/**
 * Pure check of the default-loss formula against the measured scenario B values.
 *
 * `docs/decisions.md` D12 records:
 *   DefaultCovered = min(DebtTotal x CoverRateMinimum x CoverRateLiquidation, DefaultAmount, CoverAvailable)
 *   VaultLoss = DebtTotal - DefaultCovered
 *
 * The codebase has **no such helper**: `grep -rn "DefaultCovered\|VaultLoss" src/`
 * finds only a hardcoded example string in `src/ui/dummy.ts` (mock display data), no
 * computation. Per the plan, the app only ever displays `ledger_entry` raw values and
 * never recomputes protocol math, so this file tests the D12 formula directly against
 * the raw numbers `.omc/artifacts/run-B.json` measured on devnet, and documents that
 * absence (below) rather than inventing a helper to import.
 *
 * run-B.json measured values (drops):
 *   DebtTotal 39000000, CoverAvailable (before default) 6000000,
 *   CoverRateMinimum 10000 (10%), CoverRateLiquidation 100000 (100%),
 *   AssetsTotal 78000000 -> 42900000, CoverAvailable (after default) 2100000.
 */
import { describe, expect, it } from 'vitest';

const RATE_SCALE_100_PERCENT = 100_000; // D7: 1/10th basis points, 100000 == 100%

/** D12 formula, reimplemented here only as a test oracle - not imported from src/. */
function defaultCovered(
  debtTotal: bigint,
  coverRateMinimum: number,
  coverRateLiquidation: number,
  defaultAmount: bigint,
  coverAvailable: bigint,
): bigint {
  const minimumCover = (debtTotal * BigInt(coverRateMinimum)) / BigInt(RATE_SCALE_100_PERCENT);
  const liquidatable = (minimumCover * BigInt(coverRateLiquidation)) / BigInt(RATE_SCALE_100_PERCENT);
  const candidates = [liquidatable, defaultAmount, coverAvailable];
  return candidates.reduce((min, value) => (value < min ? value : min));
}

function vaultLoss(debtTotal: bigint, covered: bigint): bigint {
  return debtTotal - covered;
}

// .omc/artifacts/run-B.json measured values, all drops.
const DEBT_TOTAL = 39_000_000n;
const COVER_AVAILABLE_BEFORE = 6_000_000n;
const COVER_RATE_MINIMUM = 10_000; // 10%
const COVER_RATE_LIQUIDATION = 100_000; // 100%
const DEFAULT_AMOUNT = 39_000_000n; // run-B.json: DefaultAmount == DebtTotal (PrincipalOutstanding)
const ASSETS_TOTAL_BEFORE = 78_000_000n;
const ASSETS_TOTAL_AFTER = 42_900_000n;
const COVER_AVAILABLE_AFTER = 2_100_000n;

describe('D12 default-loss formula: no such helper exists in src/', () => {
  it('is absent from src/scenario/steps.ts (grep confirms only a dummy-data mention in ui/dummy.ts)', async () => {
    const steps = await import('../steps.ts');
    const moduleExports = Object.keys(steps);
    expect(moduleExports).not.toContain('defaultCovered');
    expect(moduleExports).not.toContain('vaultLoss');
    expect(moduleExports).not.toContain('DefaultCovered');
    expect(moduleExports).not.toContain('VaultLoss');
  });
});

describe('DefaultCovered = min(DebtTotal x CoverRateMinimum x CoverRateLiquidation, DefaultAmount, CoverAvailable)', () => {
  it('matches run-B.json: min(3_900_000, 39_000_000, 6_000_000) = 3_900_000', () => {
    const covered = defaultCovered(
      DEBT_TOTAL,
      COVER_RATE_MINIMUM,
      COVER_RATE_LIQUIDATION,
      DEFAULT_AMOUNT,
      COVER_AVAILABLE_BEFORE,
    );
    expect(covered).toBe(3_900_000n);
  });

  it('the minimum-cover leg alone is DebtTotal x 10% x 100% = 3_900_000', () => {
    const minimumCover = (DEBT_TOTAL * BigInt(COVER_RATE_MINIMUM)) / BigInt(RATE_SCALE_100_PERCENT);
    expect(minimumCover).toBe(3_900_000n);
    const liquidatable = (minimumCover * BigInt(COVER_RATE_LIQUIDATION)) / BigInt(RATE_SCALE_100_PERCENT);
    expect(liquidatable).toBe(3_900_000n);
  });

  it('is bounded above by CoverAvailable when cover is scarce', () => {
    const scarceCover = 1_000_000n;
    const covered = defaultCovered(DEBT_TOTAL, COVER_RATE_MINIMUM, COVER_RATE_LIQUIDATION, DEFAULT_AMOUNT, scarceCover);
    expect(covered).toBe(scarceCover);
  });

  it('is bounded above by DefaultAmount when the debt exceeds it', () => {
    const covered = defaultCovered(DEBT_TOTAL, COVER_RATE_MINIMUM, COVER_RATE_LIQUIDATION, 1_000_000n, COVER_AVAILABLE_BEFORE);
    expect(covered).toBe(1_000_000n);
  });
});

describe('VaultLoss = DebtTotal - DefaultCovered', () => {
  it('matches run-B.json: 39_000_000 - 3_900_000 = 35_100_000', () => {
    const covered = defaultCovered(
      DEBT_TOTAL,
      COVER_RATE_MINIMUM,
      COVER_RATE_LIQUIDATION,
      DEFAULT_AMOUNT,
      COVER_AVAILABLE_BEFORE,
    );
    expect(vaultLoss(DEBT_TOTAL, covered)).toBe(35_100_000n);
  });
});

describe('the formula reproduces run-B.json Vault.AssetsTotal and LoanBroker.CoverAvailable exactly (D12)', () => {
  it('AssetsTotal before - VaultLoss == AssetsTotal after', () => {
    const covered = defaultCovered(
      DEBT_TOTAL,
      COVER_RATE_MINIMUM,
      COVER_RATE_LIQUIDATION,
      DEFAULT_AMOUNT,
      COVER_AVAILABLE_BEFORE,
    );
    const loss = vaultLoss(DEBT_TOTAL, covered);
    expect(ASSETS_TOTAL_BEFORE - loss).toBe(ASSETS_TOTAL_AFTER);
  });

  it('CoverAvailable before - DefaultCovered == CoverAvailable after', () => {
    const covered = defaultCovered(
      DEBT_TOTAL,
      COVER_RATE_MINIMUM,
      COVER_RATE_LIQUIDATION,
      DEFAULT_AMOUNT,
      COVER_AVAILABLE_BEFORE,
    );
    expect(COVER_AVAILABLE_BEFORE - covered).toBe(COVER_AVAILABLE_AFTER);
  });
});
