// Plain view-model types for the UI layer.
//
// These types are intentionally decoupled from `xrpl` typings and from the
// scenario engine (`src/scenario/*`). The engine/state layer being built in
// parallel is expected to map its domain state onto these shapes; nothing
// here should import from `xrpl`, `src/xrpl`, or `src/scenario`.

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Tone for a `.pill` badge. Maps 1:1 to the `p-<tone>` CSS class. */
export type PillTone = 'wallet' | 'auto' | 'both' | 'good' | 'warn' | 'crit' | 'none';

/** Tone for a raw ledger value (`.v.up` / `.v.down` / `.v.dim`). */
export type ValueTone = 'up' | 'down' | 'dim' | 'default';

export interface PillVM {
  text: string;
  tone: PillTone;
}

/** One row of a `.kv` grid: `[key, value, tone?]`. */
export type KVTuple = [key: string, value: string, tone?: ValueTone];

/**
 * Which way a value moved between the previous snapshot and the current one.
 * `up` / `down` are numeric; `changed` covers everything that has no order - flags,
 * dates, and any other non-numeric field.
 */
export type DeltaDirection = 'up' | 'down' | 'changed';

/**
 * A `.kv` row that can carry a "이전 값 → 현재 값" diff.
 *
 * Rows that did not move are written as plain `KVTuple`s, so only the fields that
 * actually changed in the step that just validated pick up the arrow and the colour.
 */
export interface KVRowVM {
  k: string;
  v: string;
  tone?: ValueTone;
  /** Formatted previous value, rendered muted before the arrow. Absent = no diff. */
  prev?: string;
  delta?: DeltaDirection;
  /** The object did not exist in the previous snapshot: show a NEW pill, no arrow. */
  isNew?: boolean;
}

/** Either form is accepted wherever a `.kv` grid is rendered. */
export type KVRow = KVTuple | KVRowVM;

/** A short run of styled text, e.g. a label followed by a mono XRP amount. */
export interface TextSegment {
  text: string;
  mono?: boolean;
  tone?: ValueTone;
}

/** Either a plain string or a sequence of styled segments. */
export type RichText = string | TextSegment[];

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

export interface TopBarVM {
  scenarioLabel: string;
  ledgerIndex: string;
  network?: string; // default "devnet"
}

// ---------------------------------------------------------------------------
// Step rail
// ---------------------------------------------------------------------------

export interface StepVM {
  id: string;
  label: string;
  state: 'done' | 'current' | 'locked' | 'failed';
  /** Small badge after the label, e.g. `BOTH` for a co-signed LoanSet. */
  badge?: PillVM;
}

/**
 * A ledger-time moment the run is waiting on, e.g. the end of the Subscription phase.
 * The rail lists them so the screen still says something during the long waits, which
 * are about 80% of a run (`docs/decisions.md` D9).
 */
export interface RailTimerVM {
  id: string;
  label: string;
  /** `m:ss` while pending, null once the moment has passed. */
  remaining: string | null;
  /** Local clock reading of the moment itself, e.g. `03:34:51`. */
  at: string;
  state: 'waiting' | 'active' | 'passed';
}

/** The single action slot at the bottom of the step rail. */
export type RailFooterVM =
  | {
      kind: 'action';
      label: string;
      state: 'enabled' | 'disabled' | 'busy';
      countdown?: string; // e.g. "1:12", rendered mono after the label
      /** Deadline countdown in its last seconds: render the countdown in the critical colour. */
      urgent?: boolean;
      /** Alternative path offered next to a failed step (e.g. re-create the vault). */
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

// ---------------------------------------------------------------------------
// Fund flow stage (nodes)
// ---------------------------------------------------------------------------

export type NodeAccent = 'hot' | 'loss' | 'gain' | 'ghost' | 'none';
export type NodePulse = 'none' | 'crit' | 'blue';

interface NodeBaseVM {
  id: 'depositor' | 'vault' | 'broker' | 'brokerAccount' | 'borrower' | 'loan';
  name: string;
  pill: PillVM;
  accent?: NodeAccent;
  pulse?: NodePulse;
}

/** Depositor / Borrower shape: a headline stat + two sub lines. */
export interface StatNodeVM extends NodeBaseVM {
  kind: 'stat';
  big: string;
  bigTone?: ValueTone;
  /** Previous headline value, rendered small and muted above the arrow. */
  bigPrev?: string;
  bigDelta?: DeltaDirection;
  subA: RichText;
  subB: RichText;
  /** Overrides subB with a pill (e.g. "서명 요청됨" while a wallet signs). */
  subBPill?: PillVM;
}

/** Vault / Broker shape: a small key-value table. */
export interface KVNodeVM extends NodeBaseVM {
  kind: 'kv';
  rows: KVRow[];
}

/** Pre-creation placeholder (Vault/Broker before they exist on-ledger). */
export interface GhostNodeVM extends NodeBaseVM {
  kind: 'ghost';
  note: string;
}

export type NodeVM = StatNodeVM | KVNodeVM | GhostNodeVM;

// ---------------------------------------------------------------------------
// Fund flow stage (paths / chips / labels / overlays)
// ---------------------------------------------------------------------------

export type FlowPathId =
  | 'coverWithdraw'
  | 'deposit'
  | 'withdraw'
  | 'loan'
  | 'repay'
  | 'cover'
  /** Broker 계정 -> Broker cover, row 2 left to centre. */
  | 'coverDeposit'
  /** Borrower <-> Loan, the right column's vertical contract link. */
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
  /** Overrides the default 2.6s travel animation duration. */
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

/** Extra freeform panel rendered inside the stage box for specific screens. */
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
    /** The broker's own XRP account, row 2 left. */
    brokerAccount: NodeVM;
    borrower: NodeVM;
    /** The `Loan` ledger object, row 2 right. */
    loan: NodeVM;
  };
  paths: FlowPathVM[];
  chips?: ChipVM[];
  labels?: LabelVM[];
  blockedMarkers?: BlockedMarkerVM[];
  extra?: StageExtraVM;
}

// ---------------------------------------------------------------------------
// Ledger panel
// ---------------------------------------------------------------------------

export interface LedgerSectionVM {
  title: string;
  rows: KVRow[];
  /** True for the "not created yet" placeholder sections. */
  dim?: boolean;
}

// ---------------------------------------------------------------------------
// Tx log
// ---------------------------------------------------------------------------

export interface TxRowVM {
  n: string;
  txType: string;
  hash: string;
  result: string;
  resultTone: PillTone;
  explorerAvailable: boolean;
  /** Stable React key. Falls back to the array index when absent (dummy data). */
  key?: string;
  /** Real explorer target. `explorerAvailable` stays the styling flag. */
  explorerUrl?: string | null;
  /** `warn` rows carry an `expect` violation, `error` rows a failed submission. */
  level?: 'info' | 'warn' | 'error';
  /** Full text for a note / warning row, shown under the row when present. */
  message?: string;
  /** Raw rippled payload, revealed by the row's disclosure toggle. */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Composite: the shared 4-region app shell (TopBar + StepRail + FlowStage + LedgerPanel + TxLog)
// ---------------------------------------------------------------------------

export interface MainScreenVM {
  topBar: TopBarVM;
  steps: StepVM[];
  railDescription?: string;
  /** Ledger-time moments the run is waiting on. Omitted by the dummy screens. */
  railTimers?: RailTimerVM[];
  railFooter: RailFooterVM;
  stage: FlowStageVM;
  ledgerSections: LedgerSectionVM[];
  txRows: TxRowVM[];
}

// ---------------------------------------------------------------------------
// Landing screen
// ---------------------------------------------------------------------------

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
