/**
 * Engine and step state machines.
 *
 * Transitions are data, not scattered `if`s, so the UI and the Node runner agree on
 * what is reachable and an illegal transition fails loudly instead of leaving a step
 * stuck in a state the rail cannot render.
 */
import type { EngineState, StepState } from './types.ts';

const ENGINE_TRANSITIONS: Record<EngineState, readonly EngineState[]> = {
  Landing: ['Ready'],
  Ready: ['Running'],
  Running: ['Done', 'Ready'],
  Done: ['Ready'],
};

const STEP_TRANSITIONS: Record<StepState, readonly StepState[]> = {
  Pending: ['Gated', 'Signing', 'Failed'],
  Gated: ['Signing', 'Failed'],
  Signing: ['Confirming', 'Failed'],
  Confirming: ['Succeeded', 'Resigning', 'Failed'],
  Resigning: ['Confirming', 'Failed'],
  Succeeded: [],
  // `recover` restarts a failed step from the top.
  Failed: ['Pending', 'Gated', 'Signing'],
};

export function canEngineTransition(from: EngineState, to: EngineState): boolean {
  return ENGINE_TRANSITIONS[from].includes(to);
}

export function engineTransition(from: EngineState, to: EngineState): EngineState {
  if (!canEngineTransition(from, to)) {
    throw new Error(`illegal engine transition ${from} -> ${to}`);
  }
  return to;
}

export function canStepTransition(from: StepState, to: StepState): boolean {
  return STEP_TRANSITIONS[from].includes(to);
}

export function stepTransition(from: StepState, to: StepState): StepState {
  if (!canStepTransition(from, to)) {
    throw new Error(`illegal step transition ${from} -> ${to}`);
  }
  return to;
}

export function isTerminalStepState(state: StepState): boolean {
  return state === 'Succeeded';
}

/** A tiny mutable holder so the runner and the browser share one transition guard. */
export class EngineMachine {
  private current: EngineState = 'Landing';

  get state(): EngineState {
    return this.current;
  }

  to(next: EngineState): EngineState {
    this.current = engineTransition(this.current, next);
    return this.current;
  }
}
