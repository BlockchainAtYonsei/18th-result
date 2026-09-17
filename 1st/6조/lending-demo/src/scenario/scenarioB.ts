/**
 * Scenario B: impairment and default.
 *
 * The default is the point of the demo. Measured on devnet (docs/decisions.md D11):
 * impairment is only accepted once the loan is overdue (`NextPaymentDueDate` passed)
 * and does not move the due date; default then unlocks after `GracePeriod` more seconds.
 */
import {
  stepCoverDeposit,
  stepLoanBrokerSet,
  stepLoanDefault,
  stepLoanImpair,
  stepLoanSet,
  stepVaultCreate,
  stepVaultDeposit,
  stepVaultWithdrawAll,
} from './steps.ts';
import type { StepDef } from './types.ts';

export const SCENARIO_B_ID = 'B';

/** Fresh instances per call: steps carry mutable `state` and per-run closures. */
export function buildScenarioB(): StepDef[] {
  return [
    stepVaultCreate(),
    stepVaultDeposit(),
    stepLoanBrokerSet(),
    stepCoverDeposit(),
    stepLoanSet(),
    stepLoanImpair(),
    stepLoanDefault(),
    stepVaultWithdrawAll(),
  ];
}
