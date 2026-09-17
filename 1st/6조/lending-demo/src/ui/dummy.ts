// Dummy view-model data for every one of the 14 mockup screens (plus the
// wallet-probe interstitial), so the UI shell can be eyeballed without a
// devnet connection. Numbers/labels/hashes are transcribed verbatim from the
// design source of truth (scratchpad design/gen.mjs) — the real engine will
// replace these constants with live-mapped data in a later phase.
import type {
  ChipTone,
  ChipVM,
  FlowPathId,
  FlowPathVM,
  FlowStageVM,
  GhostNodeVM,
  KVNodeVM,
  KVRow,
  KVRowVM,
  LabelVM,
  LandingVM,
  LedgerSectionVM,
  MainScreenVM,
  NodeAccent,
  NodePulse,
  PathTone,
  PillTone,
  PillVM,
  RailFooterVM,
  RichText,
  StatNodeVM,
  StepVM,
  TxRowVM,
  ValueTone,
} from './viewModel';

// ---------------------------------------------------------------------------
// Small builders mirroring gen.mjs's own helpers (depNode/vaultNode/
// brokerNode/borNode/ghostVault/ghostBroker/section/log rows/paths/chips).
// ---------------------------------------------------------------------------

const STEPS_B = [
  '계정 준비',
  'Vault 만들기',
  '1,000 XRP 예치',
  'Broker 등록',
  'Cover 50 XRP 예치',
  '500 XRP 대출 실행',
  '부실 표시 (Impair)',
  'Default 실행',
  '전량 인출',
];
const STEPS_A = [
  '계정 준비',
  'Vault 만들기',
  '1,000 XRP 예치',
  'Broker 등록',
  'Cover 50 XRP 예치',
  '500 XRP 대출 실행',
  '전액 상환',
  'Cover 6 XRP 회수',
  '전량 인출',
];
const SB = 'B · 부실 후 default';
const SA = 'A · 정상 렌딩';

function buildSteps(labels: string[], cur: number): StepVM[] {
  return labels.map((label, i) => {
    const n = i + 1;
    const state: StepVM['state'] = n < cur ? 'done' : n === cur ? 'current' : 'locked';
    return { id: `step-${n}`, label, state };
  });
}

type VT = [value: string, tone?: ValueTone];

function depNode(
  big: string,
  atWithdraw: string,
  opts: {
    accent?: NodeAccent;
    pulse?: NodePulse;
    bigTone?: ValueTone;
    bigPrev?: string;
    bigDelta?: StatNodeVM['bigDelta'];
    pill?: PillVM;
    subA?: RichText;
    subB?: RichText;
    subBPill?: PillVM;
    /** Matches gen.mjs's `wColor` — tints the default subB value. */
    wColor?: '#B3261E' | '#1F7A4D';
  } = {},
): StatNodeVM {
  const wTone: ValueTone | undefined = opts.wColor === '#B3261E' ? 'down' : opts.wColor === '#1F7A4D' ? 'up' : undefined;
  return {
    id: 'depositor',
    kind: 'stat',
    name: 'Depositor',
    pill: opts.pill ?? { text: 'WALLET', tone: 'wallet' },
    accent: opts.accent,
    pulse: opts.pulse,
    big,
    bigTone: opts.bigTone,
    bigPrev: opts.bigPrev,
    bigDelta: opts.bigDelta,
    subA: opts.subA ?? 'Vault shares',
    subB: opts.subB ?? [{ text: '지금 인출 시' }, { text: atWithdraw, mono: true, tone: wTone }],
    subBPill: opts.subBPill,
  };
}

function vaultNode(
  total: VT,
  avail: VT,
  loss: VT,
  opts: { accent?: NodeAccent; pulse?: NodePulse; pill?: PillVM; rows?: KVRow[] } = {},
): KVNodeVM {
  const rows: KVRow[] = opts.rows ?? [
    ['AssetsTotal', total[0], total[1]],
    ['AssetsAvailable', avail[0], avail[1]],
    ['LossUnrealized', loss[0], loss[1]],
  ];
  return {
    id: 'vault',
    kind: 'kv',
    name: 'Vault',
    pill: opts.pill ?? { text: 'XRP', tone: 'both' },
    accent: opts.accent,
    pulse: opts.pulse,
    rows,
  };
}

function brokerNode(
  cover: VT,
  debt: VT,
  opts: { accent?: NodeAccent; rows?: KVRow[] } = {},
): KVNodeVM {
  return {
    id: 'broker',
    kind: 'kv',
    name: 'Broker cover',
    pill: { text: 'AUTO', tone: 'auto' },
    accent: opts.accent,
    rows: opts.rows ?? [
      ['CoverAvailable', cover[0], cover[1]],
      ['DebtTotal', debt[0], debt[1]],
    ],
  };
}

function borNode(
  big: string,
  subA: RichText,
  subB: RichText,
  opts: {
    accent?: NodeAccent;
    bigTone?: ValueTone;
    bigPrev?: string;
    bigDelta?: StatNodeVM['bigDelta'];
  } = {},
): StatNodeVM {
  return {
    id: 'borrower',
    kind: 'stat',
    name: 'Borrower',
    pill: { text: 'AUTO', tone: 'auto' },
    accent: opts.accent,
    bigTone: opts.bigTone,
    bigPrev: opts.bigPrev,
    bigDelta: opts.bigDelta,
    big,
    subA,
    subB,
  };
}

/** Row 2 left: the broker's own XRP account, where the cover comes from. */
function brkAcctNode(
  big: string,
  opts: {
    accent?: NodeAccent;
    pulse?: NodePulse;
    bigTone?: ValueTone;
    bigPrev?: string;
    bigDelta?: StatNodeVM['bigDelta'];
  } = {},
): StatNodeVM {
  return {
    id: 'brokerAccount',
    kind: 'stat',
    name: 'Broker 계정',
    pill: { text: 'AUTO', tone: 'auto' },
    accent: opts.accent,
    pulse: opts.pulse,
    big,
    bigTone: opts.bigTone,
    bigPrev: opts.bigPrev,
    bigDelta: opts.bigDelta,
    subA: 'XRP · faucet 자동 서명',
    subB: [{ text: 'rBrk…4mL', mono: true }],
  };
}

/** Row 2 right: the `Loan` ledger object. Flags ride in the header pill. */
function loanCard(
  pill: PillVM,
  rows: KVRow[],
  opts: { accent?: NodeAccent; pulse?: NodePulse } = {},
): KVNodeVM {
  return {
    id: 'loan',
    kind: 'kv',
    name: 'Loan',
    pill,
    accent: opts.accent,
    pulse: opts.pulse,
    rows,
  };
}

const ghostLoan: GhostNodeVM = {
  id: 'loan',
  kind: 'ghost',
  name: 'Loan',
  pill: { text: '없음', tone: 'none' },
  note: 'LoanSet 후 생성됩니다',
};

const ghostVault: GhostNodeVM = {
  id: 'vault',
  kind: 'ghost',
  name: 'Vault',
  pill: { text: '없음', tone: 'none' },
  note: 'VaultCreate 후 생성됩니다',
};
const ghostBroker: GhostNodeVM = {
  id: 'broker',
  kind: 'ghost',
  name: 'Broker cover',
  pill: { text: '없음', tone: 'none' },
  note: 'LoanBrokerSet 후 생성됩니다',
};

function section(title: string, rows: KVRow[], dim = false): LedgerSectionVM {
  return { title, rows, dim };
}

/**
 * A row that moved in the step that just validated: `prev → v`, coloured by direction.
 * The live app builds these in `src/ui/mapping.ts` by comparing `AppState.prevSnapshot`
 * with `AppState.snapshot`; here they are written out so the `?screen=` mockups show
 * the same rendering without a devnet connection.
 */
function diff(k: string, prev: string, v: string, delta: KVRowVM['delta'] = 'down'): KVRowVM {
  return { k, v, prev, delta };
}

/** A field of an object that did not exist in the previous snapshot: NEW pill, no arrow. */
function fresh(k: string, v: string): KVRowVM {
  return { k, v, isNew: true };
}

const NOVAULT = section(
  'Vault',
  [
    ['AssetsTotal', '—', 'dim'],
    ['AssetsAvailable', '—', 'dim'],
    ['LossUnrealized', '—', 'dim'],
  ],
  true,
);
const NOBROKER = section(
  'LoanBroker',
  [
    ['DebtTotal', '—', 'dim'],
    ['CoverAvailable', '—', 'dim'],
    ['CoverRateMinimum', '—', 'dim'],
    ['CoverRateLiquidation', '—', 'dim'],
  ],
  true,
);
const NOLOAN = section(
  'Loan',
  [
    ['PrincipalOutstanding', '—', 'dim'],
    ['TotalValueOutstanding', '—', 'dim'],
    ['NextPaymentDue', '—', 'dim'],
    ['flags', '—', 'dim'],
  ],
  true,
);

function txRow(n: string, txType: string, hash: string, result = 'tesSUCCESS', resultTone: PillTone = 'good', explorerAvailable = true): TxRowVM {
  return { n, txType, hash, result, resultTone, explorerAvailable };
}

const L = {
  vc: txRow('2', 'VaultCreate', '3A6F…C118'),
  vd: txRow('3', 'VaultDeposit 1,000 XRP', '9D41…7E2B'),
  bs: txRow('4', 'LoanBrokerSet', '1F8A…E2C3'),
  cd: txRow('5', 'LoanBrokerCoverDeposit 50', 'C4E0…91B7'),
  ls: txRow('6', 'LoanSet 500 XRP', '7B22…0D1A'),
  im: txRow('7', 'LoanManage tfLoanImpair', 'A91C…F03E'),
  df: txRow('8', 'LoanManage tfLoanDefault', '5D03…B8C1'),
  wdB: txRow('9', 'VaultWithdraw 1,000 shares', 'E77D…2A90'),
  lp: txRow('7', 'LoanPay tfLoanFullPayment', '0C5E…4A77'),
  wdA: txRow('8', 'VaultWithdraw 1,000 shares', 'B2F9…6D04'),
};
const pendingDeposit = txRow('3', 'VaultDeposit 1,000 XRP', '서명 대기', 'pending', 'none', false);

const ALL_PATH_IDS: FlowPathId[] = [
  'deposit',
  'withdraw',
  'loan',
  'repay',
  'coverDeposit',
  'cover',
  'loanLink',
];

function paths(overrides: Partial<Record<FlowPathId, PathTone>>, base: PathTone = 'idle'): FlowPathVM[] {
  return ALL_PATH_IDS.map((id) => ({ id, tone: overrides[id] ?? base }));
}

function chip(pathId: FlowPathId, text: string, tone: ChipTone = 'default', durationMs?: number): ChipVM {
  return { pathId, text, tone, durationMs };
}

function label(x: number, y: number, text: string, color?: string): LabelVM {
  return { x, y, text, color };
}

function mainScreen(opts: {
  scenarioLabel: string;
  ledgerIndex: string;
  steps: StepVM[];
  description?: string;
  footer: RailFooterVM;
  stage: FlowStageVM;
  ledgerSections: LedgerSectionVM[];
  txRows: TxRowVM[];
}): MainScreenVM {
  return {
    topBar: { scenarioLabel: opts.scenarioLabel, ledgerIndex: opts.ledgerIndex },
    steps: opts.steps,
    railDescription: opts.description,
    railFooter: opts.footer,
    stage: opts.stage,
    ledgerSections: opts.ledgerSections,
    txRows: opts.txRows,
  };
}

// ---------------------------------------------------------------------------
// 0 · Landing
// ---------------------------------------------------------------------------

export const DUMMY_LANDING: LandingVM = {
  ledgerIndex: '9,812,102',
  kicker: 'XLS-65 Single Asset Vault · XLS-66 Lending Protocol',
  heading: 'Vault 렌딩이 실제로 어떻게 돈을 잃는가',
  subheading: '모든 단계는 XRPL devnet에 실제 트랜잭션으로 제출됩니다. 예금자 역할은 발표자의 지갑이 직접 서명합니다.',
  cards: [
    {
      title: 'A · 정상 렌딩',
      badge: { text: '8단계 · 약 3분', tone: 'good' },
      description: '예금자가 Vault에 예치하고, 차입자가 빌린 뒤 이자를 엎어 갚습니다. 예금자는 이자를 받고 전량 인출합니다.',
      rows: [
        ['예치', '1,000 XRP'],
        ['대출 · 이자', '500 XRP · 10%'],
        ['예상 결과', '+0.14 XRP', 'up'],
      ],
      buttonLabel: '시나리오 A 시작',
    },
    {
      title: 'B · 부실 후 default',
      badge: { text: '9단계 · 약 5분', tone: 'crit' },
      description: '차입자가 갚지 않습니다. Broker의 cover 50 XRP가 먼저 소진되고, 나머지 손실은 Vault 예금자가 떠안습니다.',
      rows: [
        ['예치 · cover', '1,000 · 50 XRP'],
        ['CoverRate min · liq', '10% · 100%'],
        ['예상 결과', '−450 XRP (45%)', 'down'],
      ],
      buttonLabel: '시나리오 B 시작',
      highlighted: true,
    },
  ],
  footnote: '파라미터는 시작 후 첫 화면에서 바꿀 수 있습니다 · 새로고침하면 처음부터 시작합니다',
};

// ---------------------------------------------------------------------------
// 1 · 계정 준비
// ---------------------------------------------------------------------------

export const DUMMY_STEP1: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,140',
  steps: buildSteps(STEPS_B, 2),
  description: 'Broker가 XRP를 담는 Vault를 만듭니다. 예금자 share는 이 Vault가 발행합니다.',
  footer: { kind: 'action', label: 'Vault 만들기', state: 'enabled' },
  stage: {
    title: '세 계정이 준비되었습니다',
    note: 'Broker와 Borrower는 faucet 계정(자동 서명). Depositor는 Crossmark 지갑을 연결했습니다.',
    nodes: {
      depositor: depNode('10,000', '', { accent: 'gain', subA: 'XRP · 지갑 연결됨', subB: [{ text: 'rDep…9xQ', mono: true }] }),
      vault: ghostVault,
      broker: ghostBroker,
      brokerAccount: brkAcctNode('10,000', { accent: 'gain' }),
      borrower: borNode('10,000', 'XRP · faucet', [{ text: 'rBor…7cA', mono: true }], { accent: 'gain' }),
      loan: ghostLoan,
    },
    paths: paths({}, 'none'),
    extra: { kind: 'note', x: 16, y: 404, pill: { text: 'Broker rBrk…4mL · 10,000 XRP', tone: 'auto' }, text: 'faucet 자동 생성' },
  },
  ledgerSections: [NOVAULT, NOBROKER, NOLOAN],
  txRows: [],
});

// ---------------------------------------------------------------------------
// 2 · VaultCreate
// ---------------------------------------------------------------------------

export const DUMMY_STEP2: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,152',
  steps: buildSteps(STEPS_B, 3),
  description: '예금자가 지갑으로 1,000 XRP를 예치하고 share를 받습니다. 지갑 서명이 필요합니다.',
  footer: { kind: 'action', label: '1,000 XRP 예치 (지갑 서명)', state: 'enabled' },
  stage: {
    title: 'Vault가 생성되었습니다',
    note: 'Asset은 XRP, 인출 정책은 first-come-first-serve. 아직 자산은 0입니다.',
    nodes: {
      depositor: depNode('10,000', '', { subA: 'XRP · 지갑 연결됨', subB: [{ text: 'share' }, { text: '0', mono: true }] }),
      vault: vaultNode(['0'], ['0'], ['0'], { accent: 'hot', pulse: 'blue', pill: { text: 'NEW', tone: 'both' } }),
      broker: ghostBroker,
      brokerAccount: brkAcctNode('9,999.99', { bigPrev: '10,000', bigDelta: 'down' }),
      borrower: borNode('10,000', 'XRP · faucet', [{ text: 'rBor…7cA', mono: true }]),
      loan: ghostLoan,
    },
    paths: paths({ cover: 'none', coverDeposit: 'none', loanLink: 'none' }),
    labels: [label(258, 12, 'VaultID 4C1A…88F0')],
  },
  ledgerSections: [
    section('Vault', [
      fresh('AssetsTotal', '0'),
      fresh('AssetsAvailable', '0'),
      fresh('LossUnrealized', '0'),
      fresh('WithdrawalPolicy', 'FCFS'),
    ]),
    NOBROKER,
    NOLOAN,
  ],
  txRows: [L.vc],
});

// ---------------------------------------------------------------------------
// 3a · 지갑 서명 대기
// ---------------------------------------------------------------------------

export const DUMMY_STEP3_SIGNING: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,160',
  steps: buildSteps(STEPS_B, 3),
  footer: {
    kind: 'signing',
    title: '지갑에서 서명을 확인하세요',
    message: 'Crossmark 창이 열렸습니다. 30초 안에 응답이 없으면 자동 서명으로 계속할 수 있습니다.',
  },
  stage: {
    title: 'VaultDeposit 서명을 기다리는 중',
    note: '트랜잭션은 이미 만들어졌습니다. 지갑이 서명하면 devnet에 제출됩니다.',
    nodes: {
      depositor: depNode('10,000', '', {
        pulse: 'blue',
        pill: { text: 'WALLET', tone: 'wallet' },
        subA: 'XRP',
        subBPill: { text: '서명 요청됨', tone: 'wallet' },
      }),
      vault: vaultNode(['0'], ['0'], ['0']),
      broker: ghostBroker,
      brokerAccount: brkAcctNode('9,999.99'),
      borrower: borNode('10,000', 'XRP · faucet', [{ text: 'rBor…7cA', mono: true }]),
      loan: ghostLoan,
    },
    paths: paths({ deposit: 'flow-wallet', cover: 'none', coverDeposit: 'none', loanLink: 'none' }),
    labels: [label(186, 12, 'VaultDeposit 1,000', '#5B3FA3')],
    extra: {
      kind: 'walletPopup',
      walletName: 'Crossmark',
      network: 'devnet',
      fields: [
        ['TransactionType', 'VaultDeposit'],
        ['Amount', '1,000 XRP'],
      ],
    },
  },
  ledgerSections: [
    section('Vault', [
      fresh('AssetsTotal', '0'),
      fresh('AssetsAvailable', '0'),
      fresh('LossUnrealized', '0'),
      fresh('WithdrawalPolicy', 'FCFS'),
    ]),
    NOBROKER,
    NOLOAN,
  ],
  txRows: [pendingDeposit, L.vc],
});

// ---------------------------------------------------------------------------
// 3 · VaultDeposit
// ---------------------------------------------------------------------------

export const DUMMY_STEP3_DEPOSIT: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,166',
  steps: buildSteps(STEPS_B, 4),
  description: 'Broker가 이 Vault에서 대출을 낼 수 있도록 LoanBroker를 등록합니다. cover 비율을 정합니다.',
  footer: { kind: 'action', label: 'Broker 등록', state: 'enabled' },
  stage: {
    title: '1,000 XRP가 Vault로 들어갔습니다',
    note: '예금자는 1,000 share를 받았습니다. share 1개 = 1 XRP에서 시작합니다.',
    nodes: {
      depositor: depNode('1,000', '≈ 1,000', { accent: 'gain' }),
      vault: vaultNode(['1,000', 'up'], ['1,000', 'up'], ['0'], { accent: 'hot' }),
      broker: ghostBroker,
      brokerAccount: brkAcctNode('9,999.99'),
      borrower: borNode('10,000', 'XRP · faucet', [{ text: 'rBor…7cA', mono: true }]),
      loan: ghostLoan,
    },
    paths: paths({ deposit: 'flow-wallet', cover: 'none', coverDeposit: 'none', loanLink: 'none' }),
    chips: [chip('deposit', '1,000 XRP', 'wallet')],
    labels: [label(186, 12, 'VaultDeposit', '#5B3FA3')],
  },
  ledgerSections: [
    section('Vault', [
      ['AssetsTotal', '1,000', 'up'],
      ['AssetsAvailable', '1,000', 'up'],
      ['LossUnrealized', '0'],
      ['WithdrawalPolicy', 'FCFS'],
    ]),
    NOBROKER,
    NOLOAN,
  ],
  txRows: [L.vd, L.vc],
});

// ---------------------------------------------------------------------------
// 4 · LoanBrokerSet
// ---------------------------------------------------------------------------

export const DUMMY_STEP4: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,180',
  steps: buildSteps(STEPS_B, 5),
  description: 'Broker가 손실을 먼저 떠안을 자본(first-loss cover)을 넣습니다. 대출 500의 10%인 50이 최소 요구치입니다.',
  footer: { kind: 'action', label: 'Cover 50 XRP 예치', state: 'enabled' },
  stage: {
    title: 'Broker가 등록되었습니다',
    note: 'CoverRateMinimum 10%: 대출 잔액의 10%를 cover로 유지해야 합니다. CoverRateLiquidation 100%: default 시 그 전액을 손실에 쓰니다.',
    nodes: {
      depositor: depNode('1,000', '≈ 1,000'),
      vault: vaultNode(['1,000'], ['1,000'], ['0']),
      broker: brokerNode(['0'], ['0'], { accent: 'hot' }),
      brokerAccount: brkAcctNode('9,999.99', { accent: 'hot' }),
      borrower: borNode('10,000', 'XRP · faucet', [{ text: 'rBor…7cA', mono: true }]),
      loan: ghostLoan,
    },
    paths: paths({ loanLink: 'none' }),
    labels: [label(258, 396, 'LoanBrokerSet · min 10% · liq 100%')],
  },
  ledgerSections: [
    section('Vault', [
      ['AssetsTotal', '1,000'],
      ['AssetsAvailable', '1,000'],
      ['LossUnrealized', '0'],
    ]),
    section('LoanBroker', [
      ['DebtTotal', '0'],
      ['CoverAvailable', '0'],
      ['CoverRateMinimum', '10%', 'up'],
      ['CoverRateLiquidation', '100%', 'up'],
      ['ManagementFeeRate', '0%'],
    ]),
    NOLOAN,
  ],
  txRows: [L.bs, L.vd, L.vc],
});

// ---------------------------------------------------------------------------
// 5 · CoverDeposit
// ---------------------------------------------------------------------------

export const DUMMY_STEP5: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,196',
  steps: buildSteps(STEPS_B, 6),
  description: '차입자가 500 XRP를 빌립니다. 차입자와 Broker가 함께 서명해야 합니다. 이자 10%, 납부기한 60초, 유예 60초.',
  footer: { kind: 'action', label: '500 XRP 대출 실행', state: 'enabled' },
  stage: {
    title: 'Cover 50 XRP가 예치되었습니다',
    note: '이 50 XRP가 default 시 가장 먼저 사라지는 돈입니다. 대출 500에 대한 최소치를 정확히 맞추었습니다.',
    nodes: {
      depositor: depNode('1,000', '≈ 1,000'),
      vault: vaultNode(['1,000'], ['1,000'], ['0']),
      broker: brokerNode(['50', 'up'], ['0'], { accent: 'gain' }),
      brokerAccount: brkAcctNode('9,949.99', { accent: 'loss', bigPrev: '9,999.99', bigDelta: 'down' }),
      borrower: borNode('10,000', 'XRP · faucet', [{ text: 'rBor…7cA', mono: true }]),
      loan: ghostLoan,
    },
    paths: paths({ coverDeposit: 'flow-good', loanLink: 'none' }),
    chips: [chip('coverDeposit', '50 XRP', 'good')],
    labels: [label(258, 396, 'LoanBrokerCoverDeposit +50', '#1F7A4D')],
  },
  ledgerSections: [
    section('Vault', [
      ['AssetsTotal', '1,000'],
      ['AssetsAvailable', '1,000'],
      ['LossUnrealized', '0'],
    ]),
    section('LoanBroker', [
      ['DebtTotal', '0'],
      ['CoverAvailable', '50', 'up'],
      ['CoverRateMinimum', '10%'],
      ['CoverRateLiquidation', '100%'],
    ]),
    NOLOAN,
  ],
  txRows: [L.cd, L.bs, L.vd],
});

// ---------------------------------------------------------------------------
// 6 · LoanSet (shared stage/panel/logs between the B rail and A-6 rail)
// ---------------------------------------------------------------------------

const loanSetStage: FlowStageVM = {
  title: '500 XRP가 Vault에서 차입자에게 나갔습니다',
  note: 'LoanSet은 차입자와 Broker가 함께 서명했습니다. 납부기한은 60초 뒤, 유예 60초.',
  nodes: {
    depositor: depNode('1,000', '≈ 1,000'),
    vault: vaultNode(['1,000.14', 'up'], ['500', 'down'], ['0'], { accent: 'hot' }),
    broker: brokerNode(['50'], ['500.14', 'up']),
    brokerAccount: brkAcctNode('9,949.99'),
    borrower: borNode('+500', 'XRP 수령', [{ text: '납부기한' }, { text: '0:58', mono: true }], { accent: 'hot', bigTone: 'up' }),
    loan: loanCard(
      { text: '—', tone: 'none' },
      [
        fresh('PrincipalOutstanding', '500'),
        fresh('TotalValueOutstanding', '500.14'),
        fresh('NextPaymentDue', '+0:58'),
      ],
      { accent: 'hot' },
    ),
  },
  paths: paths({ loan: 'flow' }),
  chips: [chip('loan', '500 XRP')],
  labels: [label(452, 12, 'LoanSet'), label(597, 198, 'Loan 계약'), label(496, 396, '상환 대기')],
};
const loanSetPanel: LedgerSectionVM[] = [
  section('Vault', [
    ['AssetsTotal', '1,000.14', 'up'],
    ['AssetsAvailable', '500', 'down'],
    ['LossUnrealized', '0'],
  ]),
  section('LoanBroker', [
    ['DebtTotal', '500.14', 'up'],
    ['CoverAvailable', '50'],
    ['CoverRateMinimum', '10%'],
    ['CoverRateLiquidation', '100%'],
  ]),
  section('Loan', [
    fresh('PrincipalOutstanding', '500'),
    fresh('TotalValueOutstanding', '500.14'),
    fresh('NextPaymentDue', '+0:58'),
    fresh('GracePeriod', '60s'),
    ['flags', '—'],
  ]),
];

export const DUMMY_STEP6: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,301',
  steps: buildSteps(STEPS_B, 7),
  description: 'Broker가 이 대출을 부실로 표시합니다. 손실은 아직 확정되지 않지만 Vault의 미실현 손실로 잡힙니다.',
  footer: { kind: 'action', label: '부실 표시 (Impair)', state: 'enabled' },
  stage: loanSetStage,
  ledgerSections: loanSetPanel,
  txRows: [L.ls, L.cd, L.bs],
});

// ---------------------------------------------------------------------------
// B-7 · Impair 완료 · Default 대기 (countdown 1:12, impaired vault)
// ---------------------------------------------------------------------------

export const DUMMY_B7: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,340',
  steps: buildSteps(STEPS_B, 8),
  description: '납부기한 60초와 유예 60초는 스펙 최소값입니다. 이 시간이 지나기 전에는 rippled가 default를 거부합니다.',
  footer: { kind: 'action', label: 'Default 실행', state: 'disabled', countdown: '1:12' },
  stage: {
    title: '차입자가 갚지 않고 있습니다',
    note: 'Impair로 Vault에 미실현 손실 500.14가 잡혔습니다. 지금 인출하는 예금자도 손실을 피할 수 없습니다.',
    nodes: {
      depositor: depNode('1,000', '≈ 500', { accent: 'loss', wColor: '#B3261E' }),
      vault: vaultNode(['1,000.14'], ['500'], ['500.14', 'down'], {
        accent: 'loss',
        pulse: 'crit',
        pill: { text: 'IMPAIRED', tone: 'crit' },
      }),
      broker: brokerNode(['50'], ['500.14']),
      brokerAccount: brkAcctNode('9,949.99'),
      borrower: borNode('500', 'XRP 보유 · 미상환', [{ text: '유예 종료까지' }, { text: '1:12', mono: true, tone: 'down' }]),
      loan: loanCard(
        { text: 'IMPAIRED', tone: 'crit' },
        [
          ['PrincipalOutstanding', '500'],
          ['TotalValueOutstanding', '500.14'],
          ['NextPaymentDue', '지남', 'down'],
        ],
        { accent: 'loss', pulse: 'crit' },
      ),
    },
    paths: paths({ repay: 'blocked' }),
    blockedMarkers: [{ x: 470, y: 112 }],
    labels: [
      label(452, 14, 'LoanPay 없음', '#B3261E'),
      label(597, 198, 'Loan 계약', '#B3261E'),
      label(16, 14, '인출 가치 −50%', '#B3261E'),
    ],
  },
  ledgerSections: [
    section('Vault', [
      ['AssetsTotal', '1,000.14'],
      ['AssetsAvailable', '500'],
      ['LossUnrealized', '500.14', 'down'],
    ]),
    section('LoanBroker', [
      ['DebtTotal', '500.14'],
      ['CoverAvailable', '50'],
      ['CoverRateMinimum', '10%'],
      ['CoverRateLiquidation', '100%'],
    ]),
    section('Loan', [
      ['PrincipalOutstanding', '500'],
      ['TotalValueOutstanding', '500.14'],
      ['NextPaymentDue', '지남', 'down'],
      ['GracePeriod', '60s · 1:12 남음'],
      ['flags', 'lsfLoanImpaired', 'down'],
    ]),
  ],
  txRows: [L.im, L.ls, L.cd],
});

// ---------------------------------------------------------------------------
// B-8 · Default 완료
// ---------------------------------------------------------------------------

export const DUMMY_B8: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,372',
  steps: buildSteps(STEPS_B, 9),
  description: '예금자가 share 전량을 인출합니다. 손실이 확정된 만큼 받는 금액이 줄어듭니다. 지갑 서명이 필요합니다.',
  footer: { kind: 'action', label: '전량 인출 (지갑 서명)', state: 'enabled' },
  stage: {
    title: 'Default가 선언되어 cover가 소진되었습니다',
    note: 'DefaultCovered = min(500.14 × 10% × 100%, 500.14, 50) = 50. Vault 손실 450.14가 반영되어 AssetsTotal이 550이 되었습니다.',
    nodes: {
      depositor: depNode('1,000', '≈ 550', { accent: 'loss', wColor: '#B3261E' }),
      vault: vaultNode(['550', 'down'], ['550', 'up'], ['0'], {
        accent: 'loss',
        pill: { text: 'DEFAULTED', tone: 'crit' },
        rows: [
          diff('AssetsTotal', '1,000', '550'),
          diff('AssetsAvailable', '499.86', '550', 'up'),
          diff('LossUnrealized', '500.14', '0'),
        ],
      }),
      broker: brokerNode(['0', 'down'], ['0', 'down'], {
        accent: 'loss',
        rows: [diff('CoverAvailable', '50', '0'), diff('DebtTotal', '500.14', '0')],
      }),
      brokerAccount: brkAcctNode('9,949.99'),
      borrower: borNode('+500', '갚지 않고 보유', [{ text: 'Loan' }, { text: 'lsfLoanDefault', mono: true, tone: 'down' }], {
        bigTone: 'up',
      }),
      loan: loanCard(
        { text: 'DEFAULTED', tone: 'crit' },
        [
          diff('PrincipalOutstanding', '500', '0'),
          diff('TotalValueOutstanding', '500.14', '0'),
          ['NextPaymentDue', '—', 'dim'],
        ],
        { accent: 'loss' },
      ),
    },
    paths: paths({ cover: 'flow-crit', loanLink: 'blocked' }),
    chips: [chip('cover', '50', 'crit', 1800)],
    labels: [label(386, 198, 'cover 소진 → Vault', '#B3261E'), label(597, 198, 'Loan 계약', '#B3261E')],
    extra: {
      kind: 'lossSplit',
      totalLabel: 'DefaultAmount 500.14',
      coverAmountLabel: 'cover 50',
      vaultAmountLabel: 'vault 450.14',
      coverPct: 10,
      coverNote: 'Broker first-loss cover 10%',
      vaultNote: 'Vault 예금자 부담 90%',
    },
  },
  ledgerSections: [
    section('Vault', [
      diff('AssetsTotal', '1,000', '550'),
      diff('AssetsAvailable', '499.86', '550', 'up'),
      diff('LossUnrealized', '500.14', '0'),
    ]),
    section('LoanBroker', [
      diff('DebtTotal', '500.14', '0'),
      diff('CoverAvailable', '50', '0'),
      ['CoverRateMinimum', '10%'],
      ['CoverRateLiquidation', '100%'],
    ]),
    section('Loan', [
      diff('PrincipalOutstanding', '500', '0'),
      diff('TotalValueOutstanding', '500.14', '0'),
      ['PaymentRemaining', '0'],
      diff('Flags', 'lsfLoanImpaired', 'lsfLoanImpaired + lsfLoanDefault', 'changed'),
    ]),
    section('계정 XRP', [
      ['Depositor', '9,000.00'],
      ['Broker', '9,949.99'],
      ['Borrower', '10,500.00'],
    ]),
  ],
  txRows: [L.df, L.im, L.ls],
});

// ---------------------------------------------------------------------------
// B-9 · 손실 결과
// ---------------------------------------------------------------------------

export const DUMMY_B9: MainScreenVM = mainScreen({
  scenarioLabel: SB,
  ledgerIndex: '9,812,388',
  steps: buildSteps(STEPS_B, 10),
  footer: {
    kind: 'result',
    tone: 'crit',
    headline: '예치 1,000 → 회수 550',
    detail: '예금자 손실 450 XRP (45%) · Broker cover 50 전액 소진',
    secondaryLabel: '시나리오 A와 비교',
  },
  stage: {
    title: '예금자가 550 XRP만 돌려받았습니다',
    note: 'share 1,000개가 550 XRP로 바뀌었습니다. 손실은 이미 온체인 잔액에 반영되어 있습니다.',
    nodes: {
      depositor: depNode('−450', '', {
        accent: 'loss',
        bigTone: 'down',
        subA: 'XRP 손실 · shares 0',
        subB: [
          { text: '회수' },
          { text: '550', mono: true },
          { text: '/' },
          { text: '예치' },
          { text: '1,000', mono: true },
        ],
      }),
      vault: vaultNode(['0', 'down'], ['0'], ['0'], { pill: { text: 'EMPTY', tone: 'none' } }),
      broker: brokerNode(['0', 'dim'], ['0', 'dim']),
      brokerAccount: brkAcctNode('9,949.99'),
      borrower: borNode('+500', '갚지 않고 보유', [{ text: 'Loan' }, { text: 'lsfLoanDefault', mono: true, tone: 'down' }], {
        bigTone: 'up',
      }),
      loan: loanCard({ text: 'DEFAULTED', tone: 'crit' }, [
        ['PrincipalOutstanding', '0', 'dim'],
        ['TotalValueOutstanding', '0', 'dim'],
        ['NextPaymentDue', '—', 'dim'],
      ]),
    },
    paths: paths({ withdraw: 'flow-crit', loanLink: 'blocked' }),
    chips: [chip('withdraw', '550 XRP', 'crit')],
    labels: [label(180, 14, 'VaultWithdraw', '#B3261E'), label(597, 198, 'Loan 계약', '#B3261E')],
    extra: {
      kind: 'balanceSummary',
      columns: [
        { label: '예치 전 잔액', value: '10,000.00' },
        { label: '예치 후', value: '9,000.00' },
        { label: '인출 후', value: '9,550.00', tone: 'down' },
      ],
    },
  },
  ledgerSections: [
    section('Vault', [
      ['AssetsTotal', '0', 'down'],
      ['AssetsAvailable', '0'],
      ['LossUnrealized', '0'],
    ]),
    section('LoanBroker', [
      ['DebtTotal', '0'],
      ['CoverAvailable', '0'],
      ['CoverRateMinimum', '10%'],
      ['CoverRateLiquidation', '100%'],
    ]),
    section('Loan', [
      ['PrincipalOutstanding', '0'],
      ['TotalValueOutstanding', '0'],
      ['PaymentRemaining', '0'],
      ['flags', 'lsfLoanDefault', 'down'],
    ]),
    section('예금자 계정', [
      ['예치 전', '10,000.00'],
      ['예치 후', '9,000.00'],
      ['인출 후', '9,550.00', 'down'],
      ['순손실', '−450.00 (45%)', 'down'],
    ]),
  ],
  txRows: [L.wdB, L.df, L.im],
});

// ---------------------------------------------------------------------------
// A-6 · LoanSet (상환 대기) — same underlying stage as screen 6, A rail
// ---------------------------------------------------------------------------

export const DUMMY_A6: MainScreenVM = mainScreen({
  scenarioLabel: SA,
  ledgerIndex: '9,812,301',
  steps: buildSteps(STEPS_A, 7),
  description: '차입자가 원금 500과 이자 0.14를 한 번에 갚습니다. 납부기한 전에 보내야 연체 없이 통과합니다.',
  footer: { kind: 'action', label: '전액 상환', state: 'enabled', countdown: '0:47' },
  stage: loanSetStage,
  ledgerSections: loanSetPanel,
  txRows: [L.ls, L.cd, L.bs],
});

// ---------------------------------------------------------------------------
// A-7 · LoanPay
// ---------------------------------------------------------------------------

export const DUMMY_A7: MainScreenVM = mainScreen({
  scenarioLabel: SA,
  ledgerIndex: '9,812,318',
  steps: buildSteps(STEPS_A, 8),
  description: '예금자가 share 전량을 인출합니다. 이자가 붙은 만큼 예치액보다 많이 받습니다. 지갑 서명이 필요합니다.',
  footer: { kind: 'action', label: '전량 인출 (지갑 서명)', state: 'enabled' },
  stage: {
    title: '차입자가 원금과 이자를 모두 갚았습니다',
    note: '500.14 XRP가 Vault로 돌아왔습니다. Loan은 종료되고 Broker의 DebtTotal은 0입니다.',
    nodes: {
      depositor: depNode('1,000', '≈ 1,000.14', { accent: 'gain', wColor: '#1F7A4D' }),
      vault: vaultNode(['1,000.14'], ['1,000.14', 'up'], ['0'], {
        accent: 'gain',
        rows: [
          diff('AssetsTotal', '1,000', '1,000.14', 'up'),
          diff('AssetsAvailable', '500', '1,000.14', 'up'),
          ['LossUnrealized', '0'],
        ],
      }),
      broker: brokerNode(['50'], ['0', 'down'], {
        rows: [['CoverAvailable', '50'], diff('DebtTotal', '500.14', '0')],
      }),
      brokerAccount: brkAcctNode('9,949.99'),
      borrower: borNode(
        '9,499.86',
        'XRP · faucet 자동 서명',
        [{ text: 'Loan' }, { text: '종료', mono: true, tone: 'up' }],
        { accent: 'hot', bigPrev: '10,000', bigDelta: 'down' },
      ),
      loan: loanCard(
        { text: '종료', tone: 'good' },
        [
          diff('PrincipalOutstanding', '500', '0'),
          diff('TotalValueOutstanding', '500.14', '0'),
          ['NextPaymentDue', '—', 'dim'],
        ],
        { accent: 'gain' },
      ),
    },
    paths: paths({ repay: 'flow-good', loanLink: 'flow-good' }),
    chips: [chip('repay', '500.14 XRP', 'good')],
    labels: [label(430, 14, 'LoanPay 전액 상환', '#1F7A4D'), label(597, 198, 'Loan 계약', '#1F7A4D')],
  },
  ledgerSections: [
    section('Vault', [
      diff('AssetsTotal', '1,000', '1,000.14', 'up'),
      diff('AssetsAvailable', '500', '1,000.14', 'up'),
      ['LossUnrealized', '0'],
    ]),
    section('LoanBroker', [
      diff('DebtTotal', '500.14', '0'),
      ['CoverAvailable', '50'],
      ['CoverRateMinimum', '10%'],
      ['CoverRateLiquidation', '100%'],
    ]),
    section('Loan', [
      diff('PrincipalOutstanding', '500', '0'),
      diff('TotalValueOutstanding', '500.14', '0'),
      diff('PaymentRemaining', '1', '0'),
      diff('NextPaymentDueDate', '03:42:41', '—', 'changed'),
    ]),
    section('계정 XRP', [
      ['Depositor', '9,000.00'],
      ['Broker', '9,949.99'],
      diff('Borrower', '10,000', '9,499.86'),
    ]),
  ],
  txRows: [L.lp, L.ls, L.cd],
});

// ---------------------------------------------------------------------------
// A-8 · 이자 수령 결과
// ---------------------------------------------------------------------------

export const DUMMY_A8: MainScreenVM = mainScreen({
  scenarioLabel: SA,
  ledgerIndex: '9,812,330',
  steps: buildSteps(STEPS_A, 10),
  footer: {
    kind: 'result',
    tone: 'good',
    headline: '예치 1,000 → 회수 1,000.14',
    detail: '이자 0.14 XRP · Broker cover 50 그대로',
    secondaryLabel: '시나리오 B 실행',
  },
  stage: {
    title: '예금자가 이자를 엎어 전량 인출했습니다',
    note: 'share 1,000개가 1,000.14 XRP로 바뀌었습니다. Vault는 비었고 Broker는 cover를 회수할 수 있습니다.',
    nodes: {
      depositor: depNode('+0.14', '', {
        accent: 'gain',
        bigTone: 'up',
        subA: 'XRP 이자 · shares 0',
        subB: [
          { text: '회수' },
          { text: '1,000.14', mono: true },
          { text: '/' },
          { text: '예치' },
          { text: '1,000', mono: true },
        ],
      }),
      vault: vaultNode(['0', 'down'], ['0'], ['0'], { pill: { text: 'EMPTY', tone: 'none' } }),
      broker: brokerNode(['50'], ['0']),
      brokerAccount: brkAcctNode('9,949.99'),
      borrower: borNode('−0.14', 'XRP 이자 지불', [{ text: 'Loan' }, { text: '종료', mono: true, tone: 'up' }]),
      loan: loanCard({ text: '종료', tone: 'good' }, [
        ['PrincipalOutstanding', '0', 'dim'],
        ['TotalValueOutstanding', '0', 'dim'],
        ['NextPaymentDue', '—', 'dim'],
      ]),
    },
    paths: paths({ withdraw: 'flow-good' }),
    chips: [chip('withdraw', '1,000.14 XRP', 'good')],
    labels: [label(180, 14, 'VaultWithdraw', '#1F7A4D'), label(597, 198, 'Loan 계약', '#1F7A4D')],
    extra: {
      kind: 'balanceSummary',
      columns: [
        { label: '예치 전 잔액', value: '10,000.00' },
        { label: '예치 후', value: '9,000.00' },
        { label: '인출 후', value: '10,000.14', tone: 'up' },
      ],
    },
  },
  ledgerSections: [
    section('Vault', [
      ['AssetsTotal', '0', 'down'],
      ['AssetsAvailable', '0'],
      ['LossUnrealized', '0'],
    ]),
    section('LoanBroker', [
      ['DebtTotal', '0'],
      ['CoverAvailable', '50'],
      ['CoverRateMinimum', '10%'],
      ['CoverRateLiquidation', '100%'],
    ]),
    section('Loan', [
      ['PrincipalOutstanding', '0'],
      ['TotalValueOutstanding', '0'],
      ['PaymentRemaining', '0'],
      ['flags', '종료', 'up'],
    ]),
    section('예금자 계정', [
      ['예치 전', '10,000.00'],
      ['예치 후', '9,000.00'],
      ['인출 후', '10,000.14', 'up'],
      ['순이익', '+0.14', 'up'],
    ]),
  ],
  txRows: [L.wdA, L.lp, L.ls],
});
