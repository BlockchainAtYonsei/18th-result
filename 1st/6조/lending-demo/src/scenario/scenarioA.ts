/**
 * Scenario A: the loan is repaid.
 *
 * Steps 1-5 are byte-for-byte the ones scenario B uses, which is why the B spike
 * validated most of A for free. Only the ending differs: repay instead of default, then the broker
 * recovers its cover before the depositor redeems.
 */
import {
  stepCoverDeposit,
  stepCoverWithdraw,
  stepLoanBrokerSet,
  stepLoanPay,
  stepLoanSet,
  stepVaultCreate,
  stepVaultDeposit,
  stepVaultWithdrawAll,
} from './steps.ts';
import type { StepDef } from './types.ts';

export const SCENARIO_A_ID = 'A';

export function buildScenarioA(): StepDef[] {
  return [
    stepVaultCreate(),
    stepVaultDeposit(),
    stepLoanBrokerSet(),
    stepCoverDeposit(),
    stepLoanSet(),
    stepLoanPay(),
    stepCoverWithdraw(),
    stepVaultWithdrawAll(),
  ];
}
