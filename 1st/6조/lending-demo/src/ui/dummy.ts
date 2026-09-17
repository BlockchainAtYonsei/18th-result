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
