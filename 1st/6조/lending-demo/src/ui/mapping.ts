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

// ---------------------------------------------------------------------------
// small readers over AppState
// ---------------------------------------------------------------------------

/** Id of the most recently succeeded step, or null before the first one. */
function lastSucceededId(s: AppState): string | null {
  let found: string | null = null;
  for (const step of s.steps) {
    if (step.state === 'Succeeded') {
      found = step.id;
    }
  }
  return found;
}

function currentStepView(s: AppState): StepView | null {
  return s.steps[s.currentIndex] ?? null;
}

// ---------------------------------------------------------------------------
// value diffs: "이전 값 → 현재 값"
// ---------------------------------------------------------------------------
//
// `AppState.prevSnapshot` is the ledger as it stood before the step that most recently
// validated. Comparing it field by field with `AppState.snapshot` is the only thing
// that produces an arrow on screen; nothing is recomputed, both halves are raw readings
// run through the same formatter.

/** Which on-ledger object a field belongs to. */
type LedgerObjectKey = 'vault' | 'loanBroker' | 'loan';

/**
 * What the baseline held for one field. The three cases render differently:
 * no baseline at all (plain row), a baseline where the object did not exist yet
 * (NEW pill), and a baseline value (arrow when it differs).
 */
type PrevValue =
  | { kind: 'none' }
  | { kind: 'objectMissing' }
  | { kind: 'value'; raw: string | number | null };

type RawReader = (record: Record<string, unknown> | null) => string | number | null;

function prevField(s: AppState, which: LedgerObjectKey, read: RawReader): PrevValue {
  if (!s.prevSnapshot) {
    return { kind: 'none' };
  }
  const record = s.prevSnapshot[which];
  if (record === null) {
    return { kind: 'objectMissing' };
  }
  return { kind: 'value', raw: read(record) };
}

/** Balances live on the snapshot itself, so they have no "object missing" case. */
function prevBalance(s: AppState, read: (snapshot: NonNullable<AppState['prevSnapshot']>) => string): PrevValue {
  return s.prevSnapshot ? { kind: 'value', raw: read(s.prevSnapshot) } : { kind: 'none' };
}

/** Direction of a numeric move. Equal-but-different strings fall back to `changed`. */
function numericDelta(prev: string | number | null, next: string | number | null): DeltaDirection {
  const a = Number(prev ?? 0);
  const b = Number(next ?? 0);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    if (b > a) {
      return 'up';
    }
    if (b < a) {
      return 'down';
    }
  }
  return 'changed';
}

interface DiffRowOptions {
  /** Static tone kept for rows that did not move (e.g. a non-zero LossUnrealized). */
  tone?: ValueTone;
  /** Flags, dates and anything else with no order: any change is amber. */
  nonNumeric?: boolean;
}

type Formatter = (value: string | number | null) => string;

function diffRow(
  k: string,
  raw: string | number | null,
  prev: PrevValue,
  format: Formatter,
  options: DiffRowOptions = {},
): KVRowVM {
  const v = format(raw);
  if (prev.kind === 'none') {
    return { k, v, tone: options.tone };
  }
  if (prev.kind === 'objectMissing') {
    return { k, v, isNew: true };
  }
  if (String(prev.raw ?? '') === String(raw ?? '')) {
    return { k, v, tone: options.tone };
  }
  return {
    k,
    v,
    prev: format(prev.raw),
    delta: options.nonNumeric ? 'changed' : numericDelta(prev.raw, raw),
  };
}

/** The same treatment for a stat node's headline number. */
function bigDiff(
  raw: string | number | null,
  prev: PrevValue,
  format: Formatter,
): { bigPrev?: string; bigDelta?: DeltaDirection } {
  if (prev.kind !== 'value' || String(prev.raw ?? '') === String(raw ?? '')) {
    return {};
  }
  return { bigPrev: format(prev.raw), bigDelta: numericDelta(prev.raw, raw) };
}

const xrp: Formatter = (value) => formatXrp(value);
const shares: Formatter = (value) => formatShareCount(value);
const clock: Formatter = (value) => formatRippleClock(value === null ? null : Number(value));
const rate: Formatter = (value) => formatRate(value === null ? null : Number(value));

function loanFlagSet(s: AppState, bit: number): boolean {
  const flags = rawNumber(s.snapshot?.loan ?? null, 'Flags');
  return flags !== null && (flags & bit) === bit;
}

/**
 * Gate state for the current step. `locked` is decided only by the validated close
 * time; `remaining` is the interpolated display value.
 */
export function gateStatus(s: AppState): { locked: boolean; remaining: number } | null {
  if (!s.gate || s.gate.unlockAtRipple === undefined) {
    return null;
  }
  if (!s.anchor) {
    // No anchor yet: keep the button closed rather than let a click race the ledger.
    return { locked: true, remaining: 0 };
  }
  return {
    locked: !gateUnlocked(s.gate.unlockAtRipple, s.anchor.ledgerTime),
    remaining: displayRemaining(s.anchor, s.gate.unlockAtRipple),
  };
}

/**
 * Deadline gate (VaultDeposit before `SubscriptionDate`). `expired` is judged on the
 * validated ledger close time, `remaining` is the interpolated display value.
 */
export function deadlineStatus(s: AppState): { expired: boolean; remaining: number } | null {
  if (!s.gate || s.gate.deadlineRipple === undefined) {
    return null;
  }
  if (!s.anchor) {
    return { expired: false, remaining: 0 };
  }
  return {
    expired: gateUnlocked(s.gate.deadlineRipple, s.anchor.ledgerTime),
    remaining: displayRemaining(s.anchor, s.gate.deadlineRipple),
  };
}

// ---------------------------------------------------------------------------
// ledger-time moments the run waits on
// ---------------------------------------------------------------------------

interface Moment {
  id: string;
  label: string;
  /** Ripple seconds. */
  at: number;
  /**
   * Unlock time of the step gate this moment corresponds to, when there is one. Some
   * boundaries are compared exclusively by rippled, so a gate can open one second after
   * the moment the user is watching; a deadline with no gate behind it leaves this unset
   * and never highlights.
   */
  gateAt?: number;
}

/**
 * The moments the closed-ended vault schedule and the loan schedule impose.
 *
 * The two vault moments mirror `investmentOpensAtRipple` / `redemptionOpensAtRipple`
 * from `src/xrpl/read/vault.ts` (`docs/interfaces-frozen.md` 8.3); they are recomputed
 * from the raw snapshot fields here because the snapshot keeps `ledger_entry` records
 * rather than a `VaultView`.
 */
function moments(s: AppState): Moment[] {
  const vault = s.snapshot?.vault ?? null;
  const loan = s.snapshot?.loan ?? null;
  const out: Moment[] = [];

  const subscriptionDate = rawNumber(vault, 'SubscriptionDate');
  if (subscriptionDate !== null && subscriptionDate > 0) {
    // A deadline, not a gate: VaultDeposit has no gate, it simply has to land first.
    out.push({ id: 'subscriptionEnd', label: '예치 마감까지', at: subscriptionDate });
    out.push({
      id: 'investmentOpen',
      label: '대출 개시 가능까지',
      at: subscriptionDate + 1,
      gateAt: subscriptionDate + 1,
    });
  }

  const redemptionDate = rawNumber(vault, 'RedemptionDate');
  if (redemptionDate !== null && redemptionDate > 0) {
    if (!loan) {
      // LoanSet must fit the loan's whole term plus rippled's 60s buffer before
      // RedemptionDate (D9); shown as a deadline until the Loan exists.
      const term = s.params.paymentInterval * s.params.paymentTotal;
      out.push({ id: 'loanSetDeadline', label: '대출 실행 마감까지', at: redemptionDate - term - 60 - 8 });
    }
    out.push({
      id: 'redemptionOpen',
      label: '출금 개시까지',
      at: redemptionDate,
      gateAt: redemptionDate,
    });
  }

  const due = rawNumber(loan, 'NextPaymentDueDate');
  const grace = rawNumber(loan, 'GracePeriod');
  if (due !== null && due > 0) {
    // Impairment is legal from the first second past the due date (D11).
    out.push({ id: 'paymentDue', label: '납부기한까지', at: due, gateAt: due + 1 });
    if (grace !== null) {
      const defaultAt = defaultUnlockAtRipple(due, grace);
      out.push({ id: 'defaultOpen', label: 'Default 가능까지', at: defaultAt, gateAt: defaultAt });
    }
  }
  return out;
}

function railTimers(s: AppState): RailTimerVM[] {
  const anchor = s.anchor;
  const activeAt = s.gate?.unlockAtRipple ?? null;

  return moments(s).map((moment) => {
    const passed = anchor !== null && gateUnlocked(moment.at, anchor.ledgerTime);
    // Highlighted only when the button is actually waiting on this moment's gate.
    const isActive = moment.gateAt !== undefined && activeAt === moment.gateAt;
    return {
      id: moment.id,
      label: moment.label,
      remaining:
        passed || anchor === null ? null : formatCountdown(displayRemaining(anchor, moment.at)),
      at: formatRippleClock(moment.at),
      state: passed ? 'passed' : isActive ? 'active' : 'waiting',
    };
  });
}

/**
 * What the current wait is for. The waits are roughly 80% of a run (`docs/decisions.md`
 * D9), so each one gets its own sentence rather than repeating the step description.
 */
function gateDescription(stepId: string, params: ScenarioParams): string {
  switch (stepId) {
    case 'loanSet':
      return (
        '예치 마감(SubscriptionDate)이 지나야 Investment 구간이 열립니다. ' +
        'Subscription 구간에서 LoanSet을 내면 tecTOO_SOON으로 거절됩니다.'
      );
    case 'loanImpair':
      return (
        `차입자가 납부기한 ${params.paymentInterval}초를 넘겨야 부실 표시가 통과합니다. ` +
        '연체 전 impair는 tecTOO_SOON입니다.'
      );
    case 'loanDefault':
      return (
        `납부기한 + 유예 ${params.gracePeriod}초를 모두 넘겨야 default가 성립합니다. ` +
        'impair는 이 시각을 앞당기지 않습니다.'
      );
    case 'vaultWithdraw':
      return (
        `Investment 구간 ${params.investmentPeriodSeconds}초 동안은 인출이 tecTOO_SOON입니다. ` +
        'RedemptionDate가 지나야 상환 가치가 확정된 상태로 열립니다.'
      );
    default:
      return stepDescription(stepId, params);
  }
}

// ---------------------------------------------------------------------------
// rail
// ---------------------------------------------------------------------------

function railSteps(s: AppState): StepVM[] {
  const setupDone = s.setupState === 'done';
  const rows: StepVM[] = [
    {
      id: 'setup',
      label: SETUP_STEP_LABEL,
      state: s.setupState === 'failed' ? 'failed' : setupDone ? 'done' : 'current',
    },
  ];
  s.steps.forEach((step, index) => {
    let state: StepVM['state'];
    if (step.state === 'Succeeded') {
      state = 'done';
    } else if (step.state === 'Failed') {
      state = 'failed';
    } else if (setupDone && index === s.currentIndex) {
      state = 'current';
    } else {
      state = 'locked';
    }
    rows.push({
      id: step.id,
      label: step.activeLabel ?? step.label,
      state,
      // LoanSet carries a CounterpartySignature: both the borrower and the broker
      // sign it (docs/decisions.md D8), which the rail flags with a BOTH badge.
      badge: step.coSigner ? { text: 'BOTH', tone: 'both' } : undefined,
    });
  });
  return rows;
}

/** Action-button text. Every role signs locally, so no signer is called out (D20). */
function actionLabel(s: AppState, step: StepView): string {
  return step.activeLabel ?? stepLabel(step.id, s.params);
}

function busyLabel(step: StepView): string {
  switch (step.state) {
    case 'Gated':
      return '게이트 열리는 중…';
    case 'Signing':
      return '서명 중…';
    case 'Resigning':
      return '재서명 중…';
    case 'Confirming':
      return '원장 검증 대기 중…';
    default:
      return '진행 중…';
  }
}

/**
 * Every result number, in drops, derived only by subtracting raw readings.
 *
 * `redeemed` is `Vault.AssetsTotal` immediately before the withdrawal, i.e. what the
 * depositor's shares were worth; `receivedDrops` is what actually landed in the
 * account. The gap between them is the withdrawal fee, and AC1 is judged on `net`
 * (`docs/decisions.md` D15).
 */
interface ResultNumbers {
  deposit: string;
  redeemed: string | null;
  receivedDrops: string | null;
  depositFee: string | null;
  withdrawFee: string | null;
  totalFee: string | null;
  net: string | null;
}

function resultNumbers(s: AppState): ResultNumbers {
  const { beforeDepositDrops, afterDepositDrops, afterWithdrawDrops, assetsBeforeWithdrawDrops } =
    s.evidence;
  const deposit = s.params.depositDrops;

  const depositFee =
    beforeDepositDrops !== null && afterDepositDrops !== null
      ? (BigInt(beforeDepositDrops) - BigInt(afterDepositDrops) - BigInt(deposit)).toString()
      : null;
  const receivedDrops =
    afterDepositDrops !== null && afterWithdrawDrops !== null
      ? (BigInt(afterWithdrawDrops) - BigInt(afterDepositDrops)).toString()
      : null;
  const withdrawFee =
    assetsBeforeWithdrawDrops !== null && receivedDrops !== null
      ? (BigInt(assetsBeforeWithdrawDrops) - BigInt(receivedDrops)).toString()
      : null;
  const totalFee =
    depositFee !== null && withdrawFee !== null
      ? (BigInt(depositFee) + BigInt(withdrawFee)).toString()
      : null;

  return {
    deposit,
    redeemed: assetsBeforeWithdrawDrops,
    receivedDrops,
    depositFee,
    withdrawFee,
    totalFee,
    net: selectNetDepositorDrops(s),
  };
}

function resultFooter(s: AppState): RailFooterVM {
  const numbers = resultNumbers(s);
  const gained = numbers.net !== null && BigInt(numbers.net) > 0n;
  const elapsed =
    s.startedAtMs !== null && s.finishedAtMs !== null ? s.finishedAtMs - s.startedAtMs : null;

  // Scenario A's gain is 8 drops of interest minus 2 drops of fees; rounding it to XRP
  // would erase it, so A reports drops and B, whose loss is tens of XRP, reports XRP.
  const details =
    s.scenarioId === 'A'
      ? [
          `예금자 순증 ${formatDrops(numbers.net, { signed: true })}` +
            `${numbers.net === null ? '' : ` (${formatXrp(numbers.net, { signed: true })} XRP)`}`,
          `수수료 합 ${formatDrops(numbers.totalFee)}`,
        ]
      : [
          `차액 ${formatXrpDelta(numbers.deposit, numbers.redeemed)} XRP`,
          `예금자 순증감 ${numbers.net === null ? EMPTY : formatXrp(numbers.net, { signed: true })} XRP (수수료 포함)`,
        ];
  if (elapsed !== null) {
    details.push(`시작→결과 ${formatDuration(elapsed)}`);
  }

  return {
    kind: 'result',
    tone: gained ? 'good' : 'crit',
    headline: `예치 ${formatXrp(numbers.deposit)} → 회수 ${formatXrp(numbers.redeemed)}`,
    detail: details.join(' · '),
    secondaryLabel: '처음부터 다시',
  };
}

function railFooter(s: AppState): RailFooterVM {
  if (s.setupState === 'running') {
    return { kind: 'action', label: '계정 준비 중…', state: 'busy' };
  }
  if (s.setupState === 'failed') {
    return { kind: 'action', label: '계정 준비 다시 시도', state: 'enabled' };
  }
  if (selectAllSucceeded(s)) {
    return resultFooter(s);
  }

  const step = currentStepView(s);
  if (!step) {
    return { kind: 'action', label: '대기', state: 'disabled' };
  }

  if (s.busy) {
    return { kind: 'action', label: busyLabel(step), state: 'busy' };
  }

  if (step.state === 'Failed') {
    const expiredDeposit =
      step.id === 'vaultDeposit' &&
      s.txRows.some((row) => row.stepId === 'vaultDeposit' && row.engineResult === 'tecEXPIRED');
    if (expiredDeposit) {
      const lead = Math.max(s.params.subscriptionLeadSeconds * 2, 120);
      return {
        kind: 'action',
        label: `다시 시도 · ${actionLabel(s, step)}`,
        state: 'enabled',
        recover: {
          label: `Vault 다시 만들기 (예치 창 ${lead}초)`,
          hint: '예치 마감(SubscriptionDate)이 지난 뒤 트랜잭션이 검증돼 tecEXPIRED. 같은 Vault로는 재시도해도 실패하므로 예치 창을 늘린 새 Vault로 다시 시작합니다.',
        },
      };
    }
    return { kind: 'action', label: `다시 시도 · ${actionLabel(s, step)}`, state: 'enabled' };
  }

  const deadline = deadlineStatus(s);
  if (deadline?.expired) {
    // Do not offer a transaction rippled will reject: go straight to recovery.
    const isDeposit = step.id === 'vaultDeposit';
    const lead = Math.max(s.params.subscriptionLeadSeconds * 2, 120);
    return {
      kind: 'action',
      label: `${actionLabel(s, step)} · 마감 지남`,
      state: 'disabled',
      recover: isDeposit
        ? {
            label: `Vault 다시 만들기 (예치 창 ${lead}초)`,
            hint: '예치 마감(SubscriptionDate)이 지나 이 Vault에는 더 이상 예치할 수 없습니다. 예치 창을 늘린 새 Vault로 다시 시작합니다.',
          }
        : {
            label: 'Vault 다시 만들기',
            hint: `대출 실행 마감을 넘겼습니다. 대출 만기(${s.params.paymentInterval * s.params.paymentTotal}초) + 60초가 RedemptionDate 안에 들어와야 rippled가 LoanSet을 받습니다(tecNO_PERMISSION). 새 Vault로 다시 시작합니다.`,
          },
    };
  }

  const gate = gateStatus(s);
  if (gate?.locked) {
    return {
      kind: 'action',
      label: actionLabel(s, step),
      state: 'disabled',
      countdown: formatCountdown(gate.remaining),
    };
  }
  if (deadline) {
    return {
      kind: 'action',
      label: actionLabel(s, step),
      state: 'enabled',
      countdown: `마감 ${formatCountdown(deadline.remaining)}`,
      urgent: deadline.remaining <= 15,
    };
  }
  return { kind: 'action', label: actionLabel(s, step), state: 'enabled' };
}

// ---------------------------------------------------------------------------
// stage
// ---------------------------------------------------------------------------

function stageHeadline(s: AppState, lastDone: string | null): { title: string; note: string } {
  const vault = s.snapshot?.vault ?? null;
  switch (lastDone) {
    case 'vaultCreate':
      return {
        title: 'Vault가 생성되었습니다',
        note: `폐쇄형(VaultKind 1) XRP Vault입니다. 예치는 SubscriptionDate ${formatRippleClock(
          rawNumber(vault, 'SubscriptionDate'),
        )}까지만 받습니다.`,
      };
    case 'vaultDeposit':
      return {
        title: `${formatXrp(s.params.depositDrops)} XRP가 Vault로 들어갔습니다`,
        note: '예금자는 같은 수의 share를 받았습니다. share 1개 = 1 drop입니다.',
      };
    case 'loanBrokerSet':
      return {
        title: 'Broker가 등록되었습니다',
        note:
          `CoverRateMinimum ${formatRate(s.params.coverRateMinimum)}: 대출 잔액의 그만큼을 ` +
          `cover로 유지해야 합니다. CoverRateLiquidation ${formatRate(s.params.coverRateLiquidation)}: ` +
          'default 시 그 비율까지 손실에 씁니다.',
      };
    case 'coverDeposit':
      return {
        title: `Cover ${formatXrp(s.params.coverDrops)} XRP가 예치되었습니다`,
        note: 'default가 나면 가장 먼저 사라지는 돈입니다. 나머지 손실은 Vault 예금자가 떠안습니다.',
      };
    case 'coverWithdraw':
      return {
        title: `Broker가 cover ${formatXrp(s.params.coverDrops)} XRP를 돌려받았습니다`,
        note: '대출이 전액 상환되어 DebtTotal이 0이므로 담보로 묶여 있던 first-loss 자본이 전부 풀립니다.',
      };
    case 'loanSet':
      return {
        title: `${formatXrp(s.params.principalDrops)} XRP가 Vault에서 차입자에게 나갔습니다`,
        note: `LoanSet은 차입자와 Broker가 함께 서명했습니다. 납부기한 ${s.params.paymentInterval}초, 유예 ${s.params.gracePeriod}초.`,
      };
    case 'loanImpair':
      return {
        title: '차입자가 갚지 않고 있습니다',
        note: `Impair로 Vault에 미실현 손실 ${formatXrp(
          amountField(vault, 'LossUnrealized'),
        )} XRP가 잡혔습니다. 유예가 끝나야 default를 선언할 수 있습니다.`,
      };
    case 'loanDefault':
      return {
        title: 'Default가 선언되어 cover가 소진되었습니다',
        note: 'Broker의 first-loss cover가 먼저 쓰였고, 나머지는 Vault의 AssetsTotal에서 그대로 빠졌습니다.',
      };
    case 'loanPay':
    case 'loanPayLate':
      return {
        title: '차입자가 원금과 이자를 모두 갚았습니다',
        note: '상환액은 Loan.TotalValueOutstanding을 그대로 썼습니다. Loan은 종료되고 DebtTotal은 0입니다.',
      };
    case 'vaultWithdraw':
      return {
        title: `예금자가 ${formatXrp(s.evidence.assetsBeforeWithdrawDrops)} XRP를 돌려받았습니다`,
        note: 'share 전량이 소각되었습니다. 손익은 이미 온체인 잔액에 반영되어 있습니다.',
      };
    default:
      return {
        title: '세 계정이 준비되었습니다',
        note: 'Broker · Borrower · Depositor 모두 faucet 계정이며 localKeypair가 자동 서명합니다.',
      };
  }
}

function depositorNode(s: AppState, lastDone: string | null): NodeVM {
  const shareBalance = s.snapshot?.shareBalances.depositor ?? '0';
  const balance = s.snapshot?.xrpBalances.depositor ?? '0';
  const address = s.accounts?.depositor ?? s.depositor.address;
  const impaired = loanFlagSet(s, LSF_LOAN_IMPAIRED);
  const defaulted = loanFlagSet(s, LSF_LOAN_DEFAULT);

  const step = currentStepView(s);
  const signing =
    s.busy &&
    step?.signer === 'depositor' &&
    (step.state === 'Signing' || step.state === 'Resigning');

  if (selectAllSucceeded(s)) {
    const net = selectNetDepositorDrops(s);
    const down = net !== null && BigInt(net) < 0n;
    return {
      id: 'depositor',
      kind: 'stat',
      name: 'Depositor',
      pill: { text: 'AUTO', tone: 'auto' } as PillVM,
      accent: down ? 'loss' : 'gain',
      big: net === null ? EMPTY : formatXrp(net, { signed: true }),
      bigTone: down ? 'down' : 'up',
      subA: 'XRP 순증감 · shares 0',
      subB: [
        { text: '회수' },
        { text: formatXrp(s.evidence.assetsBeforeWithdrawDrops), mono: true },
        { text: '/ 예치' },
        { text: formatXrp(s.params.depositDrops), mono: true },
      ],
    };
  }

  const holdsShares = shareBalance !== '0';
  // Compare like with like: once the depositor holds shares the headline is the share
  // balance, so the baseline has to be the previous *share* balance, not the XRP one.
  const big = holdsShares
    ? bigDiff(shareBalance, prevBalance(s, (p) => p.shareBalances.depositor), xrp)
    : bigDiff(balance, prevBalance(s, (p) => p.xrpBalances.depositor), xrp);
  let accent: NodeAccent = 'none';
  if (defaulted || impaired) {
    accent = 'loss';
  } else if (lastDone === 'vaultDeposit') {
    accent = 'gain';
  }

  return {
    id: 'depositor',
    kind: 'stat',
    name: 'Depositor',
    pill: { text: 'AUTO', tone: 'auto' } as PillVM,
    accent,
    pulse: signing ? 'blue' : 'none',
    big: holdsShares ? formatXrp(shareBalance) : formatXrp(balance),
    ...big,
    subA: holdsShares ? 'Vault shares (1 share = 1 drop)' : 'XRP · faucet 자동 서명',
    subB: [{ text: shortAddress(address), mono: true }],
    subBPill: signing ? { text: '서명 중', tone: 'auto' } : undefined,
  };
}

function vaultNode(s: AppState, lastDone: string | null): NodeVM {
  const vault = s.snapshot?.vault ?? null;
  if (!vault) {
    return {
      id: 'vault',
      kind: 'ghost',
      name: 'Vault',
      pill: { text: '없음', tone: 'none' },
      note: 'VaultCreate 후 생성됩니다',
    };
  }

  const total = amountField(vault, 'AssetsTotal') ?? '0';
  const loss = amountField(vault, 'LossUnrealized') ?? '0';
  const impaired = loss !== '0';
  const defaulted = loanFlagSet(s, LSF_LOAN_DEFAULT);
  const emptied = total === '0' && lastDone === 'vaultWithdraw';

  let pill: PillVM = { text: 'XRP', tone: 'both' };
  if (emptied) {
    pill = { text: 'EMPTY', tone: 'none' };
  } else if (impaired) {
    pill = { text: 'IMPAIRED', tone: 'crit' };
  } else if (defaulted) {
    pill = { text: 'DEFAULTED', tone: 'crit' };
  } else if (lastDone === 'vaultCreate') {
    pill = { text: 'NEW', tone: 'both' };
  }

  const hot = lastDone === 'vaultCreate' || lastDone === 'vaultDeposit' || lastDone === 'loanSet';
  let accent: NodeAccent = 'none';
  if (impaired || defaulted) {
    accent = 'loss';
  } else if (lastDone === 'loanPay' || lastDone === 'loanPayLate') {
    accent = 'gain';
  } else if (hot) {
    accent = 'hot';
  }

  return {
    id: 'vault',
    kind: 'kv',
    name: 'Vault',
    pill,
    accent,
    pulse: impaired ? 'crit' : lastDone === 'vaultCreate' ? 'blue' : 'none',
    rows: [
      diffRow(
        'AssetsTotal',
        total,
        prevField(s, 'vault', (record) => amountField(record, 'AssetsTotal')),
        xrp,
        { tone: lastDone === 'loanDefault' ? 'down' : 'default' },
      ),
      diffRow(
        'AssetsAvailable',
        amountField(vault, 'AssetsAvailable'),
        prevField(s, 'vault', (record) => amountField(record, 'AssetsAvailable')),
        xrp,
      ),
      diffRow(
        'LossUnrealized',
        loss,
        prevField(s, 'vault', (record) => amountField(record, 'LossUnrealized')),
        xrp,
        { tone: impaired ? 'down' : 'default' },
      ),
    ],
  };
}

function brokerNode(s: AppState, lastDone: string | null): NodeVM {
  const broker = s.snapshot?.loanBroker ?? null;
  if (!broker) {
    return {
      id: 'broker',
      kind: 'ghost',
      name: 'Broker cover',
      pill: { text: '없음', tone: 'none' },
      note: 'LoanBrokerSet 후 생성됩니다',
    };
  }

  let accent: NodeAccent = 'none';
  if (lastDone === 'loanDefault') {
    accent = 'loss';
  } else if (lastDone === 'coverDeposit') {
    accent = 'gain';
  } else if (lastDone === 'coverWithdraw') {
    accent = 'hot';
  } else if (lastDone === 'loanBrokerSet') {
    accent = 'hot';
  }

  return {
    id: 'broker',
    kind: 'kv',
    name: 'Broker cover',
    pill: { text: 'AUTO', tone: 'auto' },
    accent,
    rows: [
      diffRow(
        'CoverAvailable',
        amountField(broker, 'CoverAvailable'),
        prevField(s, 'loanBroker', (record) => amountField(record, 'CoverAvailable')),
        xrp,
        { tone: lastDone === 'loanDefault' ? 'down' : 'default' },
      ),
      diffRow(
        'DebtTotal',
        amountField(broker, 'DebtTotal'),
        prevField(s, 'loanBroker', (record) => amountField(record, 'DebtTotal')),
        xrp,
        { tone: lastDone === 'loanSet' ? 'up' : 'default' },
      ),
    ],
  };
}

function borrowerNode(s: AppState, lastDone: string | null): NodeVM {
  const loan = s.snapshot?.loan ?? null;
  const balance = s.snapshot?.xrpBalances.borrower ?? null;
  const big = bigDiff(balance, prevBalance(s, (p) => p.xrpBalances.borrower), xrp);
  const due = rawNumber(loan, 'NextPaymentDueDate');
  const defaulted = loanFlagSet(s, LSF_LOAN_DEFAULT);

  let subB: TextSegment[];
  if (defaulted) {
    subB = [{ text: 'Loan' }, { text: 'lsfLoanDefault', mono: true, tone: 'down' }];
  } else if (due !== null && due > 0) {
    subB = [{ text: '납부기한' }, { text: formatRippleClock(due), mono: true }];
  } else if (lastDone === 'loanPay' || lastDone === 'loanPayLate') {
    subB = [{ text: 'Loan' }, { text: '종료', mono: true, tone: 'up' }];
  } else {
    subB = [{ text: shortAddress(s.accounts?.borrower), mono: true }];
  }

  let accent: NodeAccent = 'none';
  if (lastDone === 'loanSet') {
    accent = 'hot';
  } else if (lastDone === 'loanPay' || lastDone === 'loanPayLate') {
    accent = 'gain';
  }

  return {
    id: 'borrower',
    kind: 'stat',
    name: 'Borrower',
    pill: { text: 'AUTO', tone: 'auto' },
    accent,
    big: formatXrp(balance),
    ...big,
    subA: 'XRP · faucet 자동 서명',
    subB,
  };
}

/** True once a LoanPay step has validated: the `Loan` object is gone for good reasons. */
function loanRepaid(s: AppState): boolean {
  return s.steps.some(
    (step) => (step.id === 'loanPay' || step.id === 'loanPayLate') && step.state === 'Succeeded',
  );
}

/**
 * The broker's own XRP account (row 2 left). This is where the cover comes from, so it
 * gets the same headline-with-diff treatment the 계정 XRP panel gives every balance.
 */
function brokerAccountNode(s: AppState, lastDone: string | null): NodeVM {
  const balance = s.snapshot?.xrpBalances.broker ?? null;
  const big = bigDiff(balance, prevBalance(s, (p) => p.xrpBalances.broker), xrp);
  const step = currentStepView(s);
  const signing =
    s.busy && step?.signer === 'broker' && (step.state === 'Signing' || step.state === 'Resigning');

  let accent: NodeAccent = 'none';
  if (lastDone === 'coverDeposit') {
    // The cover left this account: it is down, and that is the point of the step.
    accent = 'loss';
  } else if (lastDone === 'coverWithdraw') {
    accent = 'gain';
  } else if (lastDone === 'loanBrokerSet') {
    accent = 'hot';
  }

  return {
    id: 'brokerAccount',
    kind: 'stat',
    name: 'Broker 계정',
    pill: { text: 'AUTO', tone: 'auto' },
    accent,
    pulse: signing ? 'blue' : 'none',
    big: formatXrp(balance),
    ...big,
    subA: 'XRP · faucet 자동 서명',
    subB: [{ text: shortAddress(s.accounts?.broker), mono: true }],
    subBPill: signing ? { text: '서명 중', tone: 'auto' } : undefined,
  };
}

/** `Loan.Flags` as the node's header badge. */
function loanPill(s: AppState, repaid: boolean): PillVM {
  if (loanFlagSet(s, LSF_LOAN_DEFAULT)) {
    return { text: 'DEFAULTED', tone: 'crit' };
  }
  if (loanFlagSet(s, LSF_LOAN_IMPAIRED)) {
    return { text: 'IMPAIRED', tone: 'crit' };
  }
  if (repaid) {
    return { text: '종료', tone: 'good' };
  }
  return { text: EMPTY, tone: 'none' };
}

/**
 * The `Loan` ledger object (row 2 right). Three fields only - the full record stays in
 * the ledger panel; this card exists so the contract is visible next to the borrower.
 */
function loanNode(s: AppState, lastDone: string | null): NodeVM {
  const loan = s.snapshot?.loan ?? null;
  const repaid = loanRepaid(s);

  if (!loan) {
    if (repaid) {
      // rippled deletes the object on full payment: show the terminal state, not a ghost.
      return {
        id: 'loan',
        kind: 'kv',
        name: 'Loan',
        pill: { text: '종료', tone: 'good' },
        accent: lastDone === 'loanPay' || lastDone === 'loanPayLate' ? 'gain' : 'none',
        rows: [
          ['PrincipalOutstanding', formatXrp('0'), 'up'],
          ['TotalValueOutstanding', formatXrp('0'), 'up'],
          ['NextPaymentDue', EMPTY, 'dim'],
        ],
      };
    }
    return {
      id: 'loan',
      kind: 'ghost',
      name: 'Loan',
      pill: { text: '없음', tone: 'none' },
      note: 'LoanSet 후 생성됩니다',
    };
  }

  const defaulted = loanFlagSet(s, LSF_LOAN_DEFAULT);
  const impaired = loanFlagSet(s, LSF_LOAN_IMPAIRED);

  let accent: NodeAccent = 'none';
  if (defaulted || impaired) {
    accent = 'loss';
  } else if (lastDone === 'loanSet') {
    accent = 'hot';
  } else if (lastDone === 'loanPay' || lastDone === 'loanPayLate') {
    accent = 'gain';
  }

  const loanAmount = (name: string): PrevValue =>
    prevField(s, 'loan', (record) => amountField(record, name));

  return {
    id: 'loan',
    kind: 'kv',
    name: 'Loan',
    pill: loanPill(s, repaid),
    accent,
    pulse: lastDone === 'loanImpair' ? 'crit' : 'none',
    rows: [
      diffRow(
        'PrincipalOutstanding',
        amountField(loan, 'PrincipalOutstanding'),
        loanAmount('PrincipalOutstanding'),
        xrp,
      ),
      diffRow(
        'TotalValueOutstanding',
        amountField(loan, 'TotalValueOutstanding'),
        loanAmount('TotalValueOutstanding'),
        xrp,
      ),
      diffRow(
        'NextPaymentDue',
        rawNumber(loan, 'NextPaymentDueDate'),
        prevField(s, 'loan', (record) => rawNumber(record, 'NextPaymentDueDate')),
        clock,
        { nonNumeric: true },
      ),
    ],
  };
}

function pathsFor(s: AppState, lastDone: string | null): FlowPathVM[] {
  const base: PathTone = s.snapshot?.vault ? 'idle' : 'none';
  const overrides: Partial<Record<FlowPathId, PathTone>> = {};
  if (!s.snapshot?.loanBroker) {
    overrides.cover = 'none';
    overrides.coverDeposit = 'none';
    overrides.coverWithdraw = 'none';
  }
  // The Borrower<->Loan link only means anything once the contract exists.
  if (!s.snapshot?.loan) {
    overrides.loanLink = loanRepaid(s) ? 'idle' : 'none';
  }
  switch (lastDone) {
    case 'vaultDeposit':
      overrides.deposit = 'flow';
      break;
    case 'coverDeposit':
      overrides.coverDeposit = 'flow-good';
      break;
    case 'coverWithdraw':
      overrides.coverWithdraw = 'flow-good';
      break;
    case 'loanSet':
      overrides.loan = 'flow';
      break;
    case 'loanImpair':
      overrides.repay = 'blocked';
      break;
    case 'loanDefault':
      overrides.cover = 'flow-crit';
      // Nothing moves between the broker account and the cover pool on a default.
      overrides.coverDeposit = 'idle';
      overrides.loanLink = 'blocked';
      break;
    case 'loanPay':
    case 'loanPayLate':
      overrides.repay = 'flow-good';
      overrides.loanLink = 'flow-good';
      break;
    case 'vaultWithdraw':
      overrides.withdraw = s.scenarioId === 'B' ? 'flow-crit' : 'flow-good';
      break;
    default:
      break;
  }
  return ALL_PATH_IDS.map((id) => ({ id, tone: overrides[id] ?? base }));
}

/** Cover actually consumed by the default: the drop in `CoverAvailable`, raw either side. */
function coverConsumedDrops(s: AppState): string | null {
  const { beforeDefault, afterDefault } = s.evidence;
  if (!beforeDefault || !afterDefault) {
    return null;
  }
  return (BigInt(beforeDefault.coverAvailable) - BigInt(afterDefault.coverAvailable)).toString();
}

/** The Vault's share of the default: the drop in `AssetsTotal`, raw either side. */
function vaultLossDrops(s: AppState): string | null {
  const { beforeDefault, afterDefault } = s.evidence;
  if (!beforeDefault || !afterDefault) {
    return null;
  }
  return (BigInt(beforeDefault.assetsTotal) - BigInt(afterDefault.assetsTotal)).toString();
}

function chipsFor(s: AppState, lastDone: string | null): FlowStageVM['chips'] {
  switch (lastDone) {
    case 'vaultDeposit':
      return [
        { pathId: 'deposit', text: `${formatXrp(s.params.depositDrops)} XRP`, tone: 'default' },
      ];
    case 'coverDeposit':
      return [
        { pathId: 'coverDeposit', text: `${formatXrp(s.params.coverDrops)} XRP`, tone: 'good' },
      ];
    case 'coverWithdraw':
      return [
        { pathId: 'coverWithdraw', text: `${formatXrp(s.params.coverDrops)} XRP`, tone: 'good' },
      ];
    case 'loanSet':
      return [
        { pathId: 'loan', text: `${formatXrp(s.params.principalDrops)} XRP`, tone: 'default' },
      ];
    case 'loanDefault':
      return [
        {
          pathId: 'cover',
          text: `${formatXrp(coverConsumedDrops(s))} XRP`,
          tone: 'crit',
          durationMs: 1800,
        },
      ];
    case 'loanPay':
    case 'loanPayLate':
      return [{ pathId: 'repay', text: '전액 상환', tone: 'good' }];
    case 'vaultWithdraw':
      return [
        {
          pathId: 'withdraw',
          text: `${formatXrp(s.evidence.assetsBeforeWithdrawDrops)} XRP`,
          tone: s.scenarioId === 'B' ? 'crit' : 'good',
        },
      ];
    default:
      return undefined;
  }
}

function stageExtra(s: AppState, lastDone: string | null): StageExtraVM | undefined {
  if (s.setupState === 'running' || s.setupState === 'failed') {
    const failed = s.setupState === 'failed';
    return {
      kind: 'note',
      x: 16,
      y: 404,
      pill: { text: failed ? '실패' : 'faucet', tone: failed ? 'crit' : 'auto' },
      text: s.setupMessage ?? s.error ?? '계정을 준비하는 중입니다',
    };
  }

  if (selectAllSucceeded(s)) {
    const net = selectNetDepositorDrops(s);
    const down = net !== null && BigInt(net) < 0n;
    return {
      kind: 'balanceSummary',
      columns: [
        { label: '예치 전 잔액', value: formatXrp(s.evidence.beforeDepositDrops) },
        { label: '예치 후', value: formatXrp(s.evidence.afterDepositDrops) },
        {
          label: '인출 후',
          value: formatXrp(s.evidence.afterWithdrawDrops),
          tone: down ? 'down' : 'up',
        },
      ],
    };
  }

  if (lastDone === 'loanDefault') {
    const total = s.evidence.beforeDefault?.debtTotal ?? null;
    const cover = coverConsumedDrops(s);
    const vaultLoss = vaultLossDrops(s);
    const coverPct =
      total !== null && cover !== null && BigInt(total) > 0n
        ? Number((BigInt(cover) * 10_000n) / BigInt(total)) / 100
        : 0;
    const round = (value: number): number => Math.round(value * 10) / 10;
    return {
      kind: 'lossSplit',
      totalLabel: `DebtTotal ${formatXrp(total)}`,
      coverAmountLabel: `cover ${formatXrp(cover)}`,
      vaultAmountLabel: `vault ${formatXrp(vaultLoss)}`,
      coverPct,
      coverNote: `Broker first-loss cover ${round(coverPct)}%`,
      vaultNote: `Vault 예금자 부담 ${round(100 - coverPct)}%`,
    };
  }

  return undefined;
}

/**
 * Captions that sit in the stage gutters. Only the Borrower<->Loan link gets one: it is
 * the single path on the board that carries a relationship rather than a transfer, so it
 * needs a word. The x/y keep it inside the 85px row gutter, clear of both cards.
 */
function stageLabels(s: AppState, lastDone: string | null): FlowStageVM['labels'] {
  if (!s.snapshot?.loan && !loanRepaid(s)) {
    return undefined;
  }
  let color: string | undefined;
  if (lastDone === 'loanDefault') {
    color = '#B3261E';
  } else if (lastDone === 'loanPay' || lastDone === 'loanPayLate') {
    color = '#1F7A4D';
  }
  return [{ x: 597, y: 198, text: 'Loan 계약', color }];
}

function stageFor(s: AppState): FlowStageVM {
  const lastDone = lastSucceededId(s);
  const headline = stageHeadline(s, lastDone);
  return {
    title: headline.title,
    note: headline.note,
    nodes: {
      depositor: depositorNode(s, lastDone),
      vault: vaultNode(s, lastDone),
      broker: brokerNode(s, lastDone),
      brokerAccount: brokerAccountNode(s, lastDone),
      borrower: borrowerNode(s, lastDone),
      loan: loanNode(s, lastDone),
    },
    paths: pathsFor(s, lastDone),
    chips: chipsFor(s, lastDone),
    labels: stageLabels(s, lastDone),
    // On the `repay` curve's midpoint, in the row-1 right gutter.
    blockedMarkers: lastDone === 'loanImpair' ? [{ x: 470, y: 112 }] : undefined,
    extra: stageExtra(s, lastDone),
  };
}

// ---------------------------------------------------------------------------
// ledger panel
// ---------------------------------------------------------------------------

function dimRows(keys: string[]): KVTuple[] {
  return keys.map((key) => [key, EMPTY, 'dim'] as KVTuple);
}

/** `Loan.Flags` -> the names rippled set, so the diff can format both halves alike. */
const loanFlagsLabel: Formatter = (value) => {
  if (value === null) {
    return EMPTY;
  }
  const flags = Number(value);
  if (!Number.isFinite(flags)) {
    return EMPTY;
  }
  const names: string[] = [];
  if ((flags & LSF_LOAN_IMPAIRED) === LSF_LOAN_IMPAIRED) {
    names.push('lsfLoanImpaired');
  }
  if ((flags & LSF_LOAN_DEFAULT) === LSF_LOAN_DEFAULT) {
    names.push('lsfLoanDefault');
  }
  return names.length > 0 ? names.join(' + ') : '없음';
};

function ledgerSections(s: AppState): LedgerSectionVM[] {
  const vault = s.snapshot?.vault ?? null;
  const broker = s.snapshot?.loanBroker ?? null;
  const loan = s.snapshot?.loan ?? null;
  const sections: LedgerSectionVM[] = [];

  const vaultAmount = (name: string): PrevValue =>
    prevField(s, 'vault', (record) => amountField(record, name));
  const brokerAmount = (name: string): PrevValue =>
    prevField(s, 'loanBroker', (record) => amountField(record, name));
  const brokerRaw = (name: string): PrevValue =>
    prevField(s, 'loanBroker', (record) => rawNumber(record, name));
  const loanAmount = (name: string): PrevValue =>
    prevField(s, 'loan', (record) => amountField(record, name));
  const loanRaw = (name: string): PrevValue =>
    prevField(s, 'loan', (record) => rawNumber(record, name));

  sections.push(
    vault
      ? {
          title: 'Vault',
          rows: [
            diffRow('AssetsTotal', amountField(vault, 'AssetsTotal'), vaultAmount('AssetsTotal'), xrp),
            diffRow(
              'AssetsAvailable',
              amountField(vault, 'AssetsAvailable'),
              vaultAmount('AssetsAvailable'),
              xrp,
            ),
            diffRow(
              'LossUnrealized',
              amountField(vault, 'LossUnrealized'),
              vaultAmount('LossUnrealized'),
              xrp,
              { tone: amountField(vault, 'LossUnrealized') === '0' ? 'default' : 'down' },
            ),
            diffRow(
              '예금자 share',
              s.snapshot?.shareBalances.depositor ?? '0',
              prevBalance(s, (snapshot) => snapshot.shareBalances.depositor),
              shares,
            ),
            ['VaultKind', `${rawNumber(vault, 'VaultKind') ?? 0} (1 = 폐쇄형)`],
            diffRow(
              'SubscriptionDate',
              rawNumber(vault, 'SubscriptionDate'),
              prevField(s, 'vault', (record) => rawNumber(record, 'SubscriptionDate')),
              clock,
              { nonNumeric: true },
            ),
            diffRow(
              'RedemptionDate',
              rawNumber(vault, 'RedemptionDate'),
              prevField(s, 'vault', (record) => rawNumber(record, 'RedemptionDate')),
              clock,
              { nonNumeric: true },
            ),
          ],
        }
      : {
          title: 'Vault',
          rows: dimRows(['AssetsTotal', 'AssetsAvailable', 'LossUnrealized', '예금자 share']),
          dim: true,
        },
  );

  sections.push(
    broker
      ? {
          title: 'LoanBroker',
          rows: [
            diffRow('DebtTotal', amountField(broker, 'DebtTotal'), brokerAmount('DebtTotal'), xrp),
            diffRow(
              'CoverAvailable',
              amountField(broker, 'CoverAvailable'),
              brokerAmount('CoverAvailable'),
              xrp,
            ),
            diffRow(
              'CoverRateMinimum',
              rawNumber(broker, 'CoverRateMinimum'),
              brokerRaw('CoverRateMinimum'),
              rate,
              { nonNumeric: true },
            ),
            diffRow(
              'CoverRateLiquidation',
              rawNumber(broker, 'CoverRateLiquidation'),
              brokerRaw('CoverRateLiquidation'),
              rate,
              { nonNumeric: true },
            ),
          ],
        }
      : {
          title: 'LoanBroker',
          rows: dimRows([
            'DebtTotal',
            'CoverAvailable',
            'CoverRateMinimum',
            'CoverRateLiquidation',
          ]),
          dim: true,
        },
  );

  sections.push(
    loan
      ? {
          title: 'Loan',
          rows: [
            diffRow(
              'PrincipalOutstanding',
              amountField(loan, 'PrincipalOutstanding'),
              loanAmount('PrincipalOutstanding'),
              xrp,
            ),
            diffRow(
              'TotalValueOutstanding',
              amountField(loan, 'TotalValueOutstanding'),
              loanAmount('TotalValueOutstanding'),
              xrp,
            ),
            diffRow(
              'PaymentRemaining',
              rawNumber(loan, 'PaymentRemaining'),
              loanRaw('PaymentRemaining'),
              (value) => (value === null ? EMPTY : String(value)),
            ),
            diffRow(
              'NextPaymentDueDate',
              rawNumber(loan, 'NextPaymentDueDate'),
              loanRaw('NextPaymentDueDate'),
              clock,
              { nonNumeric: true },
            ),
            ['GracePeriod', `${rawNumber(loan, 'GracePeriod') ?? 0}s`],
            diffRow('Flags', rawNumber(loan, 'Flags'), loanRaw('Flags'), loanFlagsLabel, {
              nonNumeric: true,
              tone:
                loanFlagSet(s, LSF_LOAN_DEFAULT) || loanFlagSet(s, LSF_LOAN_IMPAIRED)
                  ? 'down'
                  : 'default',
            }),
          ],
        }
      : {
          title: 'Loan',
          rows: dimRows([
            'PrincipalOutstanding',
            'TotalValueOutstanding',
            'NextPaymentDueDate',
            'Flags',
          ]),
          dim: true,
        },
  );

  // The three role balances. They are `account_info` readings, not ledger objects, but
  // they are where a deposit or a repayment is actually felt, so they get the same
  // before/after treatment.
  if (s.snapshot) {
    const balances = s.snapshot.xrpBalances;
    sections.push({
      title: '계정 XRP',
      rows: [
        diffRow('Depositor', balances.depositor, prevBalance(s, (p) => p.xrpBalances.depositor), xrp),
        diffRow('Broker', balances.broker, prevBalance(s, (p) => p.xrpBalances.broker), xrp),
        diffRow('Borrower', balances.borrower, prevBalance(s, (p) => p.xrpBalances.borrower), xrp),
      ],
    });
  }

  if (selectAllSucceeded(s)) {
    sections.push(resultSection(s));
  }

  return sections;
}

/**
 * The result panel. Scenario A is judged in drops because its whole gain is 6 drops
 * (8 drops of interest less 2 drops of fees, `docs/decisions.md` D15); scenario B loses
 * tens of XRP, so it reads in XRP.
 */
function resultSection(s: AppState): LedgerSectionVM {
  const numbers = resultNumbers(s);
  const down = numbers.net !== null && BigInt(numbers.net) < 0n;
  const tone = down ? 'down' : 'up';

  if (s.scenarioId === 'A') {
    return {
      title: '예금자 결과 · AC1 기준 A (drops)',
      rows: [
        ['예치 원금', formatDrops(numbers.deposit)],
        ['상환 가치', formatDrops(numbers.redeemed), tone],
        ['수수료 합', formatDrops(numbers.totalFee)],
        ['예금자 순증', formatDrops(numbers.net, { signed: true }), tone],
        [
          '순증 (XRP)',
          numbers.net === null ? EMPTY : formatXrp(numbers.net, { signed: true }),
          tone,
        ],
        ['예금자 예치 전', `${formatXrp(s.evidence.beforeDepositDrops)} XRP`],
        ['예금자 인출 후', `${formatXrp(s.evidence.afterWithdrawDrops)} XRP`, tone],
      ],
    };
  }

  return {
    title: '예금자 결과',
    rows: [
      ['예치 원금', formatXrp(numbers.deposit)],
      ['상환 가치', formatXrp(numbers.redeemed), tone],
      ['차액', formatXrpDelta(numbers.deposit, numbers.redeemed), tone],
      ['예금자 수령액', formatXrp(numbers.receivedDrops), tone],
      ['수수료 합', formatDrops(numbers.totalFee)],
      ['예금자 예치 전', formatXrp(s.evidence.beforeDepositDrops)],
      ['예금자 예치 후', formatXrp(s.evidence.afterDepositDrops)],
      ['예금자 인출 후', formatXrp(s.evidence.afterWithdrawDrops), tone],
      [
        '예금자 순증감',
        numbers.net === null ? EMPTY : formatXrp(numbers.net, { signed: true }),
        tone,
      ],
    ],
  };
}

// ---------------------------------------------------------------------------
// tx log
// ---------------------------------------------------------------------------

function txRowVM(row: TxRow): TxRowVM {
  const result = row.pending
    ? 'pending'
    : (row.engineResult ?? (row.level === 'error' ? 'failed' : row.level));

  let tone: PillTone;
  if (row.pending) {
    tone = 'none';
  } else if (row.level === 'error') {
    tone = 'crit';
  } else if (row.level === 'warn') {
    tone = 'warn';
  } else {
    tone = result.startsWith('tes') ? 'good' : 'crit';
  }

  return {
    key: row.key,
    n: row.n,
    txType: row.txType,
    hash: row.hash ? shortHash(row.hash) : row.pending ? '서명 대기' : EMPTY,
    result,
    resultTone: tone,
    explorerAvailable: row.explorerUrl !== null,
    explorerUrl: row.explorerUrl,
    level: row.level,
    message: row.message,
    raw: row.raw,
  };
}

// ---------------------------------------------------------------------------
// public entry points
// ---------------------------------------------------------------------------

export function toMainScreenVM(s: AppState): MainScreenVM {
  const currentId = currentStepView(s)?.id ?? null;
  let description: string | undefined;
  if (s.setupState !== 'done') {
    description = '계정을 faucet으로 준비합니다. 이미 있는 계정은 잔액이 모자랄 때만 다시 채웁니다.';
  } else if (!selectAllSucceeded(s) && currentId) {
    // While a gate is closed the screen explains that specific wait, not the step.
    description = gateStatus(s)?.locked
      ? gateDescription(currentId, s.params)
      : stepDescription(currentId, s.params);
  }

  return {
    topBar: {
      scenarioLabel: s.scenarioId ? scenarioTitle(s.scenarioId) : '선택 전',
      ledgerIndex: formatLedgerIndex(s.ledgerIndex ?? s.anchor?.ledgerIndex ?? s.snapshot?.fetchedAtLedger ?? null),
      network: 'devnet',
    },
    steps: railSteps(s),
    railDescription: description,
    railTimers: railTimers(s),
    railFooter: railFooter(s),
    stage: stageFor(s),
    ledgerSections: ledgerSections(s),
    txRows: s.txRows.map(txRowVM),
  };
}

export function toLandingVM(s: AppState): LandingVM {
  const deposit = formatXrp(s.params.depositDrops);
  const principal = formatXrp(s.params.principalDrops);
  const cover = formatXrp(s.params.coverDrops);
  const ledgerWait = s.params.subscriptionLeadSeconds + s.params.investmentPeriodSeconds;

  return {
    ledgerIndex: formatLedgerIndex(s.ledgerIndex ?? s.anchor?.ledgerIndex ?? null),
    kicker: 'XLS-65 Single Asset Vault · XLS-66 Lending Protocol',
    heading: 'Vault 렌딩이 실제로 어떻게 돈을 잃는가',
    subheading:
      '모든 단계는 XRPL devnet에 실제 트랜잭션으로 제출됩니다. 화면의 숫자는 ledger_entry 응답의 raw 값입니다.',
    cards: [
      {
        title: 'A · 정상 렌딩',
        badge: { text: '7단계', tone: 'good' },
        description:
          '예금자가 Vault에 예치하고, 차입자가 빌린 뒤 이자를 얹어 갚습니다. 예금자는 이자가 붙은 share를 전량 인출합니다.',
        rows: [
          ['예치', `${deposit} XRP`],
          ['대출 · 이자', `${principal} XRP · ${formatRate(s.params.interestRate)}`],
          ['납부기한', `${s.params.paymentInterval}초`],
        ],
        buttonLabel: '시나리오 A 시작',
      },
      {
        title: 'B · 부실 후 default',
        badge: { text: '8단계', tone: 'crit' },
        description:
          '차입자가 갚지 않습니다. Broker의 cover가 먼저 소진되고, 나머지 손실은 Vault 예금자가 떠안습니다.',
        rows: [
          ['예치 · cover', `${deposit} · ${cover} XRP`],
          [
            'CoverRate min · liq',
            `${formatRate(s.params.coverRateMinimum)} · ${formatRate(s.params.coverRateLiquidation)}`,
          ],
          ['원장 대기', `약 ${ledgerWait}초`, 'down'],
        ],
        buttonLabel: '시나리오 B 시작',
        highlighted: true,
      },
    ],
    footnote:
      '아래에서 파라미터를 바꿀 수 있습니다 · 계정은 브라우저에 캐시되어 다음 회차에 재사용됩니다',
  };
}
