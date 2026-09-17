// Plain view-model types for the UI layer.
//
// These types are intentionally decoupled from `xrpl` typings and from the
// scenario engine (`src/scenario/*`). The engine/state layer being built in
// parallel is expected to map its domain state onto these shapes; nothing
// here should import from `xrpl`, `src/xrpl`, or `src/scenario`.

export type PillTone = 'wallet' | 'auto' | 'both' | 'good' | 'warn' | 'crit' | 'none';
export type ValueTone = 'up' | 'down' | 'dim' | 'default';

export interface PillVM {
  text: string;
  tone: PillTone;
}

export type KVTuple = [key: string, value: string, tone?: ValueTone];
export type DeltaDirection = 'up' | 'down' | 'changed';

export interface KVRowVM {
  k: string;
  v: string;
  tone?: ValueTone;
  prev?: string;
  delta?: DeltaDirection;
  isNew?: boolean;
}

export type KVRow = KVTuple | KVRowVM;

export interface TextSegment {
  text: string;
  mono?: boolean;
  tone?: ValueTone;
}

export type RichText = string | TextSegment[];

export interface TopBarVM {
  scenarioLabel: string;
  ledgerIndex: string;
  network?: string;
}

export interface StepVM {
  id: string;
  label: string;
  state: 'done' | 'current' | 'locked' | 'failed';
  badge?: PillVM;
}

export interface RailTimerVM {
  id: string;
  label: string;
  remaining: string | null;
  at: string;
  state: 'waiting' | 'active' | 'passed';
}

export type RailFooterVM =
  | {
      kind: 'action';
      label: string;
      state: 'enabled' | 'disabled' | 'busy';
      countdown?: string;
      urgent?: boolean;
      recover?: { label: string; hint: string };
    }
  | {
      kind: 'signing';
      title: string;
      message: string;
    }
  | {
      kind: 'result';
      tone: 'good' | 'crit';
      headline: string;
      detail: string;
      secondaryLabel: string;
    };

export type NodeAccent = 'hot' | 'loss' | 'gain' | 'ghost' | 'none';
export type NodePulse = 'none' | 'crit' | 'blue';

interface NodeBaseVM {
  id: 'depositor' | 'vault' | 'broker' | 'brokerAccount' | 'borrower' | 'loan';
  name: string;
  pill: PillVM;
  accent?: NodeAccent;
  pulse?: NodePulse;
}

export interface StatNodeVM extends NodeBaseVM {
  kind: 'stat';
  big: string;
  bigTone?: ValueTone;
  bigPrev?: string;
  bigDelta?: DeltaDirection;
  subA: RichText;
  subB: RichText;
  subBPill?: PillVM;
}

export interface KVNodeVM extends NodeBaseVM {
  kind: 'kv';
  rows: KVRow[];
}

export interface GhostNodeVM extends NodeBaseVM {
  kind: 'ghost';
  note: string;
}

export type NodeVM = StatNodeVM | KVNodeVM | GhostNodeVM;

export type FlowPathId =
  | 'coverWithdraw'
  | 'deposit'
  | 'withdraw'
  | 'loan'
  | 'repay'
  | 'cover'
  | 'coverDeposit'
  | 'loanLink';

export type PathTone = 'idle' | 'none' | 'blocked' | 'flow' | 'flow-crit' | 'flow-good' | 'flow-wallet';

export interface FlowPathVM {
  id: FlowPathId;
  tone: PathTone;
}

export type ChipTone = 'default' | 'crit' | 'good' | 'wallet';

export interface ChipVM {
  pathId: FlowPathId;
  text: string;
  tone: ChipTone;
  durationMs?: number;
}

export interface LabelVM {
  x: number;
  y: number;
  text: string;
  color?: string;
}

export interface BlockedMarkerVM {
  x: number;
  y: number;
}

export type StageExtraVM =
  | { kind: 'note'; x: number; y: number; pill?: PillVM; text: string }
  | { kind: 'walletPopup'; walletName: string; network: string; fields: KVTuple[] }
  | {
      kind: 'lossSplit';
      totalLabel: string;
      coverAmountLabel: string;
      vaultAmountLabel: string;
      coverPct: number;
      coverNote: string;
      vaultNote: string;
    }
  | { kind: 'balanceSummary'; columns: { label: string; value: string; tone?: ValueTone }[] };

export interface FlowStageVM {
  title: string;
  note: string;
  nodes: {
    depositor: NodeVM;
    vault: NodeVM;
    broker: NodeVM;
    brokerAccount: NodeVM;
    borrower: NodeVM;
    loan: NodeVM;
  };
  paths: FlowPathVM[];
  chips?: ChipVM[];
  labels?: LabelVM[];
  blockedMarkers?: BlockedMarkerVM[];
  extra?: StageExtraVM;
}

export interface LedgerSectionVM {
  title: string;
  rows: KVRow[];
  dim?: boolean;
}

export interface TxRowVM {
  n: string;
  txType: string;
  hash: string;
  result: string;
  resultTone: PillTone;
  explorerAvailable: boolean;
  key?: string;
  explorerUrl?: string | null;
  level?: 'info' | 'warn' | 'error';
  message?: string;
  raw?: unknown;
}

export interface MainScreenVM {
  topBar: TopBarVM;
  steps: StepVM[];
  railDescription?: string;
  railTimers?: RailTimerVM[];
  railFooter: RailFooterVM;
  stage: FlowStageVM;
  ledgerSections: LedgerSectionVM[];
  txRows: TxRowVM[];
}

export interface ScenarioCardVM {
  title: string;
  badge: PillVM;
  description: string;
  rows: KVTuple[];
  buttonLabel: string;
  highlighted?: boolean;
}

export interface LandingVM {
  ledgerIndex: string;
  kicker: string;
  heading: string;
  subheading: string;
  cards: [ScenarioCardVM, ScenarioCardVM];
  footnote: string;
}
