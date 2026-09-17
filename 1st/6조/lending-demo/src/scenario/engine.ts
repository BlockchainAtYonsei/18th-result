/**
 * The scenario engine. One implementation drives both the Node runner and the
 * browser; the only injected difference is the `SignerProvider`.
 *
 * Per step: resolve the signer -> wait out any gate -> `build` -> `submit` ->
 * `after` -> re-read the `LedgerSnapshot` -> evaluate `expect`. The snapshot refresh
 * belongs to the engine, never to a step or to the UI, so every `expect` sees the
 * ledger as it stands after that step and nothing else.
 */
import { getLatestAnchor } from '../xrpl/client.ts';
import type { LedgerAnchor } from '../xrpl/client.ts';
import { submit } from '../xrpl/submit.ts';
import type { SubmitOptions, TxResult } from '../xrpl/submit.ts';
import { makeCounterpartySignedSigner } from '../wallet/localKeypair.ts';

import { refreshSnapshot } from './ctx.ts';
import { displayRemaining, gateUnlocked } from './countdown.ts';
import { stepTransition } from './machine.ts';
import type { LedgerSnapshot, ScenarioCtx, Signer, StepDef, StepState } from './types.ts';

export interface EngineHooks {
  onStepStart?(step: StepDef): void;
  onStepState?(step: StepDef, state: StepState): void;
  onStepResult?(step: StepDef, result: TxResult, snapshot: LedgerSnapshot): void;
  onStepFailed?(step: StepDef, error: unknown): void;
  onSnapshot?(snapshot: LedgerSnapshot): void;
  /** Fired about once a second while a gate is closed. */
  onGateTick?(step: StepDef, remainingSeconds: number, unlockAtRipple: number): void;
  onNotice?(message: string): void;
  /** An `expect` violation. Non-fatal by design: the raw ledger stays the evidence. */
  onExpectViolation?(step: StepDef, message: string): void;
}

export interface EngineOptions {
  hooks?: EngineHooks;
  submit?: Omit<SubmitOptions, 'client'>;
  /** How often to re-check a closed gate, ms. */
  gatePollMs?: number;
  /** Overridable for tests; defaults to the ledger anchor published by `client.ts`. */
  readAnchor?(ctx: ScenarioCtx): Promise<LedgerAnchor>;
}

export interface StepOutcome {
  step: StepDef;
  result: TxResult;
  snapshot: LedgerSnapshot;
  /** `expect` violations, kept as warnings rather than aborting the run. */
  warnings: string[];
  gateWaitedMs: number;
}

/** Read a validated close time. Prefers the live stream anchor, falls back to `ledger`. */
async function defaultReadAnchor(ctx: ScenarioCtx): Promise<LedgerAnchor> {
  const streamed = getLatestAnchor();
  if (streamed) {
    return streamed;
  }
  const response = await ctx.client.request({
    command: 'ledger',
    ledger_index: 'validated',
  });
  const ledger = response.result.ledger;
  const closeTime = (ledger as unknown as Record<string, unknown>).close_time;
  if (typeof closeTime !== 'number') {
    throw new Error('validated ledger carries no numeric close_time; cannot judge a gate');
  }
  return {
    ledgerTime: closeTime,
    ledgerIndex: Number(response.result.ledger_index),
    perfNow: performance.now(),
  };
}

function resolveSigner(ctx: ScenarioCtx, step: StepDef): Signer {
  const primary = ctx.signers.for(step.signer);
  if (!step.coSigner) {
    return primary;
  }
  return makeCounterpartySignedSigner(primary, ctx.signers.for(step.coSigner));
}

async function waitForGate(
  ctx: ScenarioCtx,
  step: StepDef,
  options: EngineOptions,
): Promise<number> {
  const gate = step.gate?.(ctx);
  if (!gate?.locked || gate.unlockAtRipple === undefined) {
    return 0;
  }
  const unlockAt = gate.unlockAtRipple;
  const readAnchor = options.readAnchor ?? defaultReadAnchor;
  const pollMs = options.gatePollMs ?? 1_000;
  const startedAt = Date.now();

  setState(step, 'Gated', options.hooks);

  for (;;) {
    const anchor = await readAnchor(ctx);
    if (gateUnlocked(unlockAt, anchor.ledgerTime)) {
      return Date.now() - startedAt;
    }
    options.hooks?.onGateTick?.(
      step,
      displayRemaining(anchor, unlockAt, anchor.perfNow),
      unlockAt,
    );
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

function setState(step: StepDef, next: StepState, hooks: EngineHooks | undefined): void {
  step.state = stepTransition(step.state, next);
  hooks?.onStepState?.(step, step.state);
}

export async function runStep(
  ctx: ScenarioCtx,
  step: StepDef,
  options: EngineOptions = {},
): Promise<StepOutcome> {
  const hooks = options.hooks;
  hooks?.onStepStart?.(step);

  try {
    const gateWaitedMs = await waitForGate(ctx, step, options);
    const signer = resolveSigner(ctx, step);
    const tx = await step.build(ctx);

    const result = await submit(
      tx,
      signer,
      (state) => {
        setState(step, state, hooks);
      },
      {
        ...options.submit,
        client: ctx.client,
        onNotice: (message) => {
          hooks?.onNotice?.(message);
          ctx.log({
            at: Date.now(),
            level: 'warn',
            stepId: step.id,
            message,
          });
        },
      },
    );

    if (!result.engineResult.startsWith('tes')) {
      throw new Error(
        `step ${step.id} validated with ${result.engineResult} (hash ${result.hash})`,
      );
    }

    await step.after?.(ctx, result);
    const snapshot = await refreshSnapshot(ctx);
    hooks?.onSnapshot?.(snapshot);

    setState(step, 'Succeeded', hooks);

    const warnings: string[] = [];
    const violation = step.expect?.(snapshot);
    if (violation) {
      warnings.push(violation);
      hooks?.onExpectViolation?.(step, violation);
      ctx.log({
        at: Date.now(),
        level: 'warn',
        stepId: step.id,
        message: violation,
        hash: result.hash,
      });
    }

    ctx.log({
      at: Date.now(),
      level: 'info',
      stepId: step.id,
      message: `${step.label} ${result.engineResult}`,
      hash: result.hash,
      explorerUrl: result.explorerUrl,
      raw: result.meta,
    });

    hooks?.onStepResult?.(step, result, snapshot);
    return { step, result, snapshot, warnings, gateWaitedMs };
  } catch (error) {
    if (step.state !== 'Failed') {
      step.state = 'Failed';
      hooks?.onStepState?.(step, 'Failed');
    }
    ctx.log({
      at: Date.now(),
      level: 'error',
      stepId: step.id,
      message: error instanceof Error ? error.message : String(error),
      raw: error,
    });
    hooks?.onStepFailed?.(step, error);
    throw error;
  }
}

/**
 * Run a step, and on failure fall through to its `recover` alternatives in order.
 * Recovery is explicit and finite - there is no blind retry of the same transaction.
 */
export async function runStepWithRecovery(
  ctx: ScenarioCtx,
  step: StepDef,
  options: EngineOptions = {},
): Promise<StepOutcome> {
  try {
    return await runStep(ctx, step, options);
  } catch (error) {
    const alternatives = step.recover ?? [];
    if (alternatives.length === 0) {
      throw error;
    }
    ctx.log({
      at: Date.now(),
      level: 'warn',
      stepId: step.id,
      message:
        `step failed (${error instanceof Error ? error.message : String(error)}); ` +
        `trying ${alternatives.length} recovery step(s)`,
    });
    let last: unknown = error;
    for (const alternative of alternatives) {
      try {
        return await runStep(ctx, alternative, options);
      } catch (recoveryError) {
        last = recoveryError;
      }
    }
    throw last;
  }
}

/** Run every step in order. Stops at the first failure - a spike must not paper over one. */
export async function runScenario(
  ctx: ScenarioCtx,
  steps: readonly StepDef[],
  options: EngineOptions = {},
): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];
  for (const step of steps) {
    outcomes.push(await runStepWithRecovery(ctx, step, options));
  }
  return outcomes;
}
