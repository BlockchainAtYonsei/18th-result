/**
 * Scenario defaults and the Korean labels the rail and the action button use.
 *
 * The amounts are the P0 rescale frozen in `docs/interfaces-frozen.md` section 7 and
 * proven on devnet by `.omc/artifacts/run-B.json`; the schedule fields come from the
 * P1 finding that `LendingProtocolV1_1` forces a closed-ended vault.
 */
import type { ScenarioParams } from '../scenario/types.ts';
import { percentToRate } from '../xrpl/tx/loanBroker.ts';
import { formatXrp } from '../ui/format.ts';

export type ScenarioId = 'A' | 'B';

/** Faucet account names. One per role; there is no wallet path (docs/decisions.md D20). */
export const SETUP_ACCOUNT_NAMES = ['broker', 'borrower', 'depositor'] as const;
export type SetupAccountName = (typeof SETUP_ACCOUNT_NAMES)[number];

/** Same rescale the Node runner uses, so the browser and the spike stay comparable. */
export const DEFAULT_PARAMS: ScenarioParams = {
  depositDrops: '78000000',
  principalDrops: '39000000',
  coverDrops: '6000000',
  coverRateMinimum: percentToRate(10),
  coverRateLiquidation: percentToRate(100),
  interestRate: percentToRate(10),
  paymentInterval: 60,
  gracePeriod: 60,
  paymentTotal: 1,
  subscriptionLeadSeconds: 75,
  investmentPeriodSeconds: 240,
};

/**
 * Lead used when re-creating the vault after a deposit missed the subscription window.
 * Local keypairs sign instantly, so the 45s default is normally ample; this exists for
 * the case where the presenter pauses between clicks (`restartFromVaultCreate`).
 */
export const RECOVERY_SUBSCRIPTION_LEAD_SECONDS = 120;

/**
 * Minimum validated balance per faucet account, drops. Below this `ensureAccounts`
 * calls the faucet again; above it the cached account is reused untouched.
 */
export const MIN_BALANCE_DROPS: Record<SetupAccountName, string> = {
  broker: '12000000',
  borrower: '4000000',
  depositor: '82000000',
};

/** What the depositor account has to hold before `VaultDeposit` can succeed. */
export const DEPOSITOR_MIN_BALANCE_DROPS = MIN_BALANCE_DROPS.depositor;

export const EXPLORER_TX_URL = (hash: string): string =>
  `https://devnet.xrpl.org/transactions/${hash}`;

/** Engine step ids, in the order each scenario runs them. */
export const STEP_IDS: Record<ScenarioId, readonly string[]> = {
  A: [
    'vaultCreate',
    'vaultDeposit',
    'loanBrokerSet',
    'coverDeposit',
    'loanSet',
    'loanPay',
    'coverWithdraw',
    'vaultWithdraw',
  ],
  B: [
    'vaultCreate',
    'vaultDeposit',
    'loanBrokerSet',
    'coverDeposit',
    'loanSet',
    'loanImpair',
    'loanDefault',
    'vaultWithdraw',
  ],
};

/** The rail's first row. It is not an engine step: no transaction, just the faucet. */
export const SETUP_STEP_LABEL = '계정 준비';

function xrp(drops: string): string {
  return formatXrp(drops, { maxDecimals: 6 });
}

/** Short label for a step, used by the rail and by the action button. */
export function stepLabel(stepId: string, params: ScenarioParams): string {
  switch (stepId) {
    case 'vaultCreate':
      return 'Vault 만들기';
    case 'vaultDeposit':
      return `${xrp(params.depositDrops)} XRP 예치`;
    case 'loanBrokerSet':
      return 'Broker 등록';
    case 'coverDeposit':
      return `Cover ${xrp(params.coverDrops)} XRP 예치`;
    case 'loanSet':
      return `${xrp(params.principalDrops)} XRP 대출 실행`;
    case 'loanImpair':
      return '부실 표시 (Impair)';
    case 'loanDefault':
      return 'Default 실행';
    case 'loanPay':
      return '전액 상환';
    case 'loanPayLate':
      return '전액 상환 (연체 플래그)';
    case 'coverWithdraw':
      return `Cover ${xrp(params.coverDrops)} XRP 회수`;
    case 'vaultWithdraw':
      return '전량 인출';
    default:
      return stepId;
  }
}

/** One line describing what the *next* action will do, shown above the button. */
export function stepDescription(stepId: string, params: ScenarioParams): string {
  switch (stepId) {
    case 'vaultCreate':
      return `Broker가 XRP를 담는 폐쇄형 Vault를 만듭니다. 예치는 SubscriptionDate(+${params.subscriptionLeadSeconds}초)까지만 받습니다.`;
    case 'vaultDeposit':
      return `예금자가 ${xrp(params.depositDrops)} XRP를 예치하고 같은 수의 share를 받습니다.`;
    case 'loanBrokerSet':
      return 'Broker가 cover 비율을 공시하고 대출 창구를 엽니다.';
    case 'coverDeposit':
      return `Broker가 손실을 먼저 떠안을 자본 ${xrp(params.coverDrops)} XRP를 넣습니다.`;
    case 'loanSet':
      return `차입자가 ${xrp(params.principalDrops)} XRP를 빌립니다. 차입자와 Broker가 함께 서명합니다. 대출 만기(${params.paymentInterval * params.paymentTotal}초) + 60초가 출금 개시 전에 끝나야 하므로 버튼의 마감 안에 눌러야 합니다.`;
    case 'loanImpair':
      return `납부기한 ${params.paymentInterval}초가 지나야 부실 표시가 통과합니다. Vault에 미실현 손실이 잡힙니다.`;
    case 'loanDefault':
      return `납부기한 + 유예 ${params.gracePeriod}초가 모두 지나야 default가 성립합니다. cover가 먼저 소진되고 나머지는 Vault 손실입니다.`;
    case 'loanPay':
    case 'loanPayLate':
      return '차입자가 원금과 이자를 한 번에 갚습니다. 금액은 Loan 객체의 TotalValueOutstanding을 그대로 씁니다.';
    case 'coverWithdraw':
      return '상환이 끝나 DebtTotal이 0입니다. Broker가 담보로 넣었던 cover를 전액 돌려받습니다. 대출이 남아 있으면 DebtTotal × CoverRateMinimum만큼은 뺄 수 없습니다.';
    case 'vaultWithdraw':
      return `예금자가 share 전량을 인출합니다. RedemptionDate(예치 구간 종료 후 ${params.investmentPeriodSeconds}초)가 지나야 열립니다.`;
    default:
      return '';
  }
}

export function scenarioTitle(id: ScenarioId): string {
  return id === 'A' ? 'A · 정상 렌딩' : 'B · 부실 후 default';
}

/** Rail rows: the faucet setup row followed by one row per engine step. */
export function railLabels(id: ScenarioId, params: ScenarioParams): string[] {
  return [SETUP_STEP_LABEL, ...STEP_IDS[id].map((stepId) => stepLabel(stepId, params))];
}
