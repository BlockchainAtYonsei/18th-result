/**
 * Engine + ledger state -> the pure view models in `viewModel.ts`.
 *
 * This is the only place that knows both sides. Two rules hold throughout:
 *
 *  - every number shown comes from a `ledger_entry` field or an `account_info` balance,
 *    converted from drops to XRP and nothing more. Where a screen shows a change, it is
 *    the difference of two such raw readings taken from `AppState.evidence`, and it is
 *    labelled as a difference.
 *  - the gate the Default button obeys is the step's own `gate(ctx)`, judged against a
 *    validated close time by `gateUnlocked`. The countdown beside it is interpolated
 *    from the ledger anchor and never feeds that decision.
 */
import { defaultUnlockAtRipple, displayRemaining, gateUnlocked } from '../scenario/countdown.ts';
import { LSF_LOAN_DEFAULT, LSF_LOAN_IMPAIRED } from '../xrpl/read/loan.ts';
import type { ScenarioParams } from '../scenario/types.ts';
import type { AppState, StepView, TxRow } from '../state/store.ts';
import { selectAllSucceeded, selectNetDepositorDrops } from '../state/store.ts';
import {
  SETUP_STEP_LABEL,
  scenarioTitle,
  stepDescription,
  stepLabel,
} from '../state/scenarioConfig.ts';

import {
  EMPTY,
  amountField,
  formatCountdown,
  formatDrops,
  formatDuration,
  formatLedgerIndex,
  formatRate,
  formatRippleClock,
  formatShareCount,
  formatXrp,
  formatXrpDelta,
  rawNumber,
  shortAddress,
  shortHash,
} from './format.ts';
import type {
  DeltaDirection,
  FlowPathId,
  FlowPathVM,
  FlowStageVM,
  KVRowVM,
  KVTuple,
  LandingVM,
  LedgerSectionVM,
  MainScreenVM,
  NodeAccent,
  NodeVM,
  PathTone,
  PillTone,
  PillVM,
  RailFooterVM,
  RailTimerVM,
  StageExtraVM,
  StepVM,
  TextSegment,
  TxRowVM,
  ValueTone,
} from './viewModel';

const ALL_PATH_IDS: FlowPathId[] = [
  'deposit',
  'withdraw',
  'loan',
  'repay',
  'coverDeposit',
  'cover',
  'loanLink',
];
