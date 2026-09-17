/**
 * Scenario A and B step lists: expected ids/order, signer roles, and the LoanSet
 * `coSigner` (D8 in `docs/decisions.md`: LoanSet is borrower-initiated with the
 * broker owner as `Counterparty`). Cross-checked against the real step sequence
 * recorded in `.omc/artifacts/run-A.json` / `run-B.json` `.steps[].id`.
 */
import { describe, expect, it } from 'vitest';
import { buildScenarioA, SCENARIO_A_ID } from '../scenarioA.ts';
import { buildScenarioB, SCENARIO_B_ID } from '../scenarioB.ts';
import type { Role } from '../types.ts';

// .omc/artifacts/run-A.json .steps[].id, in order
const RUN_A_STEP_IDS = [
  'vaultCreate',
  'vaultDeposit',
  'loanBrokerSet',
  'coverDeposit',
  'loanSet',
  'loanPay',
  // added 2026-09-11 (after the run-A.json capture): broker recovers its cover before redemption
  'coverWithdraw',
  'vaultWithdraw',
];

// .omc/artifacts/run-B.json .steps[].id, in order
const RUN_B_STEP_IDS = [
  'vaultCreate',
  'vaultDeposit',
  'loanBrokerSet',
  'coverDeposit',
  'loanSet',
  'loanImpair',
  'loanDefault',
  'vaultWithdraw',
];

describe('buildScenarioA', () => {
  it('has 8 steps: the run-A.json order plus coverWithdraw before redemption', () => {
    const steps = buildScenarioA();
    expect(steps.map((s) => s.id)).toEqual(RUN_A_STEP_IDS);
    expect(steps).toHaveLength(8);
  });

  it('assigns the expected signer role per step', () => {
    const bySignerId: Record<string, Role> = Object.fromEntries(
      buildScenarioA().map((s) => [s.id, s.signer]),
    );
    expect(bySignerId).toEqual({
      vaultCreate: 'broker',
      vaultDeposit: 'depositor',
      loanBrokerSet: 'broker',
      coverDeposit: 'broker',
      loanSet: 'borrower',
      loanPay: 'borrower',
      coverWithdraw: 'broker',
      vaultWithdraw: 'depositor',
    });
  });

  it('only the LoanSet step carries a coSigner, and it is the broker', () => {
    for (const step of buildScenarioA()) {
      if (step.id === 'loanSet') {
        expect(step.coSigner).toBe('broker');
      } else {
        expect(step.coSigner).toBeUndefined();
      }
    }
  });

  it('every step starts Pending', () => {
    for (const step of buildScenarioA()) {
      expect(step.state).toBe('Pending');
    }
  });

  it('LoanPay carries a single recovery step for the late-payment path', () => {
    const loanPay = buildScenarioA().find((s) => s.id === 'loanPay');
    expect(loanPay?.recover).toHaveLength(1);
    expect(loanPay?.recover?.[0]?.id).toBe('loanPayLate');
    expect(loanPay?.recover?.[0]?.signer).toBe('borrower');
    // The recovery alternative must not itself carry a further recovery step, or a
    // late payment that also fails would retry forever.
    expect(loanPay?.recover?.[0]?.recover).toBeUndefined();
  });

  it('SCENARIO_A_ID is "A"', () => {
    expect(SCENARIO_A_ID).toBe('A');
  });

  it('returns fresh StepDef instances on every call (no shared mutable state across runs)', () => {
    const first = buildScenarioA();
    const second = buildScenarioA();
    expect(first[0]).not.toBe(second[0]);
    first[0]!.state = 'Succeeded';
    expect(second[0]!.state).toBe('Pending');
  });
});

describe('buildScenarioB', () => {
  it('has 8 steps, in the exact order and ids run-B.json recorded', () => {
    const steps = buildScenarioB();
    expect(steps.map((s) => s.id)).toEqual(RUN_B_STEP_IDS);
    expect(steps).toHaveLength(8);
  });

  it('assigns the expected signer role per step', () => {
    const bySignerId: Record<string, Role> = Object.fromEntries(
      buildScenarioB().map((s) => [s.id, s.signer]),
    );
    expect(bySignerId).toEqual({
      vaultCreate: 'broker',
      vaultDeposit: 'depositor',
      loanBrokerSet: 'broker',
      coverDeposit: 'broker',
      loanSet: 'borrower',
      loanImpair: 'broker',
      loanDefault: 'broker',
      vaultWithdraw: 'depositor',
    });
  });

  it('only the LoanSet step carries a coSigner, and it is the broker', () => {
    for (const step of buildScenarioB()) {
      if (step.id === 'loanSet') {
        expect(step.coSigner).toBe('broker');
      } else {
        expect(step.coSigner).toBeUndefined();
      }
    }
  });

  it('every step starts Pending', () => {
    for (const step of buildScenarioB()) {
      expect(step.state).toBe('Pending');
    }
  });

  it('SCENARIO_B_ID is "B"', () => {
    expect(SCENARIO_B_ID).toBe('B');
  });

  it('returns fresh StepDef instances on every call (no shared mutable state across runs)', () => {
    const first = buildScenarioB();
    const second = buildScenarioB();
    expect(first[0]).not.toBe(second[0]);
    first[0]!.state = 'Succeeded';
    expect(second[0]!.state).toBe('Pending');
  });
});

describe('A and B share steps 1-5 by construction (same factory functions)', () => {
  it('the first five step ids are identical between A and B', () => {
    const a = buildScenarioA()
      .slice(0, 5)
      .map((s) => s.id);
    const b = buildScenarioB()
      .slice(0, 5)
      .map((s) => s.id);
    expect(a).toEqual(b);
    expect(a).toEqual(['vaultCreate', 'vaultDeposit', 'loanBrokerSet', 'coverDeposit', 'loanSet']);
  });

  it('A and B diverge only from step 6 onward', () => {
    const a = buildScenarioA()
      .slice(5)
      .map((s) => s.id);
    const b = buildScenarioB()
      .slice(5)
      .map((s) => s.id);
    expect(a).toEqual(['loanPay', 'coverWithdraw', 'vaultWithdraw']);
    expect(b).toEqual(['loanImpair', 'loanDefault', 'vaultWithdraw']);
  });
});

describe('gated steps expose a gate() function', () => {
  it('loanSet, loanImpair (B), loanDefault (B), and vaultWithdraw are gated', () => {
    const b = buildScenarioB();
    for (const id of ['loanSet', 'loanImpair', 'loanDefault', 'vaultWithdraw']) {
      const step = b.find((s) => s.id === id);
      expect(typeof step?.gate).toBe('function');
    }
  });

  it('vaultCreate, loanBrokerSet, coverDeposit have no gate', () => {
    const b = buildScenarioB();
    for (const id of ['vaultCreate', 'loanBrokerSet', 'coverDeposit']) {
      const step = b.find((s) => s.id === id);
      expect(step?.gate).toBeUndefined();
    }
  });

  it('vaultDeposit has a deadline gate at SubscriptionDate (never locked, closes after)', () => {
    const step = buildScenarioB().find((s) => s.id === 'vaultDeposit');
    expect(step?.gate).toBeTypeOf('function');
    const ctx = {
      snapshot: { vault: { SubscriptionDate: 842422975 }, loanBroker: null, loan: null },
    } as never;
    const gate = step!.gate!(ctx);
    expect(gate.locked).toBe(false);
    expect(gate.unlockAtRipple).toBeUndefined();
    expect(gate.deadlineRipple).toBe(842422975);
  });
});
