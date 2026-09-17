/**
 * Allowed/forbidden transitions for both state machines in `scenario/machine.ts`,
 * including the `Confirming -> Resigning -> Failed -> recover` (Pending/Gated/Signing)
 * path used by `xrpl/submit.ts`'s expiry-recovery flow (D5 in `docs/decisions.md`).
 */
import { describe, expect, it } from 'vitest';
import {
  EngineMachine,
  canEngineTransition,
  canStepTransition,
  engineTransition,
  isTerminalStepState,
  stepTransition,
} from '../machine.ts';
import type { EngineState, StepState } from '../types.ts';

const ENGINE_STATES: readonly EngineState[] = ['Landing', 'Ready', 'Running', 'Done'];
const STEP_STATES: readonly StepState[] = [
  'Pending',
  'Gated',
  'Signing',
  'Confirming',
  'Resigning',
  'Succeeded',
  'Failed',
];

describe('engine transitions', () => {
  const allowed: ReadonlyArray<[EngineState, EngineState]> = [
    ['Landing', 'Ready'],
    ['Ready', 'Running'],
    ['Running', 'Done'],
    ['Running', 'Ready'], // reset mid-run
    ['Done', 'Ready'], // reset after a completed run
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canEngineTransition(from, to)).toBe(true);
    expect(engineTransition(from, to)).toBe(to);
  });

  const forbidden: ReadonlyArray<[EngineState, EngineState]> = [
    ['Landing', 'Landing'],
    ['Landing', 'Running'],
    ['Landing', 'Done'],
    ['Ready', 'Landing'],
    ['Ready', 'Done'],
    ['Ready', 'Ready'],
    ['Running', 'Landing'],
    ['Running', 'Running'],
    ['Done', 'Landing'],
    ['Done', 'Running'],
    ['Done', 'Done'],
  ];

  it.each(forbidden)('forbids %s -> %s', (from, to) => {
    expect(canEngineTransition(from, to)).toBe(false);
    expect(() => engineTransition(from, to)).toThrow(`illegal engine transition ${from} -> ${to}`);
  });

  it('every EngineState is covered by both fixture lists', () => {
    const covered = new Set([...allowed, ...forbidden].map(([from]) => from));
    expect([...covered].sort()).toEqual([...ENGINE_STATES].sort());
  });
});

describe('EngineMachine', () => {
  it('starts at Landing and only advances through legal transitions', () => {
    const machine = new EngineMachine();
    expect(machine.state).toBe('Landing');
    expect(machine.to('Ready')).toBe('Ready');
    expect(machine.to('Running')).toBe('Running');
    expect(machine.to('Done')).toBe('Done');
    expect(machine.state).toBe('Done');
  });

  it('throws and leaves state unchanged on an illegal transition', () => {
    const machine = new EngineMachine();
    machine.to('Ready');
    expect(() => machine.to('Done')).toThrow();
    expect(machine.state).toBe('Ready');
  });

  it('supports the reset path Running -> Ready and Done -> Ready', () => {
    const machine = new EngineMachine();
    machine.to('Ready');
    machine.to('Running');
    expect(machine.to('Ready')).toBe('Ready');
    machine.to('Running');
    machine.to('Done');
    expect(machine.to('Ready')).toBe('Ready');
  });
});

describe('step transitions', () => {
  const allowed: ReadonlyArray<[StepState, StepState]> = [
    ['Pending', 'Gated'],
    ['Pending', 'Signing'],
    ['Pending', 'Failed'],
    ['Gated', 'Signing'],
    ['Gated', 'Failed'],
    ['Signing', 'Confirming'],
    ['Signing', 'Failed'],
    ['Confirming', 'Succeeded'],
    ['Confirming', 'Resigning'],
    ['Confirming', 'Failed'],
    ['Resigning', 'Confirming'],
    ['Resigning', 'Failed'],
    // recover(): a Failed step restarts from the top of the pipeline.
    ['Failed', 'Pending'],
    ['Failed', 'Gated'],
    ['Failed', 'Signing'],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canStepTransition(from, to)).toBe(true);
    expect(stepTransition(from, to)).toBe(to);
  });

  const forbidden: ReadonlyArray<[StepState, StepState]> = [
    // Succeeded is terminal.
    ['Succeeded', 'Pending'],
    ['Succeeded', 'Gated'],
    ['Succeeded', 'Signing'],
    ['Succeeded', 'Confirming'],
    ['Succeeded', 'Resigning'],
    ['Succeeded', 'Failed'],
    ['Succeeded', 'Succeeded'],
    // Failed cannot resume mid-flight or jump straight to success.
    ['Failed', 'Confirming'],
    ['Failed', 'Resigning'],
    ['Failed', 'Succeeded'],
    ['Failed', 'Failed'],
    // No step skips submission straight to confirmation/success.
    ['Pending', 'Confirming'],
    ['Pending', 'Succeeded'],
    ['Pending', 'Resigning'],
    ['Gated', 'Confirming'],
    ['Gated', 'Succeeded'],
    ['Gated', 'Pending'],
    // Signing cannot regress or skip to a result without Confirming.
    ['Signing', 'Pending'],
    ['Signing', 'Gated'],
    ['Signing', 'Succeeded'],
    ['Signing', 'Resigning'],
    // Confirming cannot regress before Signing.
    ['Confirming', 'Pending'],
    ['Confirming', 'Gated'],
    ['Confirming', 'Signing'],
    // Resigning is entered only via Confirming's expiry path and must re-submit.
    ['Resigning', 'Pending'],
    ['Resigning', 'Gated'],
    ['Resigning', 'Succeeded'],
  ];

  it.each(forbidden)('forbids %s -> %s', (from, to) => {
    expect(canStepTransition(from, to)).toBe(false);
    expect(() => stepTransition(from, to)).toThrow(`illegal step transition ${from} -> ${to}`);
  });

  it('the full Signing -> Confirming -> Resigning -> Confirming -> Succeeded expiry-recovery path is legal', () => {
    let state: StepState = 'Signing';
    for (const next of ['Confirming', 'Resigning', 'Confirming', 'Succeeded'] as const) {
      state = stepTransition(state, next);
    }
    expect(state).toBe('Succeeded');
  });

  it('the recover() restart paths (Pending/Gated/Signing) from Failed are all legal', () => {
    for (const target of ['Pending', 'Gated', 'Signing'] as const) {
      expect(stepTransition('Failed', target)).toBe(target);
    }
  });
});

describe('isTerminalStepState', () => {
  it('is true only for Succeeded', () => {
    for (const state of STEP_STATES) {
      expect(isTerminalStepState(state)).toBe(state === 'Succeeded');
    }
  });

  it('Failed is not terminal: recover() can still restart it', () => {
    expect(isTerminalStepState('Failed')).toBe(false);
  });
});
