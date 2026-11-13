# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/frontend` as a demo web app where a compliance officer signs in, runs a transfer case, and reads in plain language whether to block it, why, and on what evidence, with Gateway and Constellation as a simulation dialog.

**Architecture:** A Vite SPA with hash routing (login → dashboard → new case → case). A flow layer (`src/flow/`) calls the six Public API endpoints in order through the existing contract-validating client and stores each run as a snapshot in IndexedDB. Every visible sentence comes from an English copy dictionary keyed by contract codes; Solana terms carry a `?` tooltip. Mock (MSW), local Backend (dev proxy) and deployed Backend (build-time URL) are the three API modes.

**Tech Stack:** Vite 8, React 19, TypeScript 7, React Router (hash), Radix Tooltip/Dialog/Tabs, idb-keyval, MSW 3, Ajv 2020, Vitest 5 + Testing Library + jsdom, pnpm.

**Spec:** `apps/frontend/docs/2026-11-10-redesign-design.md` (approved by Henry 2026-11-11). Look reference only: `apps/frontend/docs/mockups/2026-11-10-v2.html`.

## Global Constraints

- Call only the six Public API endpoints. `contracts/` is the source of truth; every request and response goes through `src/api/client.ts` contract validation.
- The frontend never computes or re-interprets risk scores, policy actions or simulation outcomes. Sentences are looked up from contract codes; values from `contracts/config/**` are read and quoted, never used to decide.
- `riskScore: null` is shown as "Not scored", never 0. LOW always carries "not a safety guarantee". Synthetic vs on-chain is always visible. Gateway shows "No transaction is broadcast". Constellation shows "Simulation only. Not a mainnet result."
- No contract code names in body text. Raw codes appear only in the Audit section and inside `?` tooltips.
- Solana and compliance terms stay as they are and get a `<Term>` `?` tooltip that opens on hover and on keyboard focus.
- When a decision has several reason codes, show all of them with equal weight. Never rank them.
- `amountRaw` is never converted with `Number`; use `src/lib/amount.ts`.
- All UI strings come from `src/i18n/en.ts`. No hard-coded English in components.
- Fonts: Satoshi (UI), Departure Mono (addresses, IDs, signatures, large numbers), Pretendard Variable as the Korean fallback. No IBM Plex.
- Colours: tokens from the spec §10. Status colours always come with an icon and a label: Allow `#0ca30c` ✓, Warn `#fab219` !, Review `#9085e9` ⏸, Block `#d03b3b` ✕.
- Motion: no screen transitions. `DitherLoader` only while waiting. `prefers-reduced-motion: reduce` → static.
- No nested cards; badges only for statuses. Explorer links only when `dataProvenance.dataType === 'ON_CHAIN'`.
- No decision overrides (approve/reject) anywhere.
- Do not build what only the mockups show: Gateway or protocol results on the dashboard, Gateway/Constellation calls inside "Run case", Wallets or Policies pages, a policy-version compare button, screen transitions, a Constellation threshold line.
- Every chart has hover tooltips and a table view (`ChartFrame`); a chart whose values are already printed as text next to each mark counts as its own table.
- Commits: only after Henry has said to commit in this session. Message format per `AGENTS.md`: `type(subtype): 한국어 요약`, blank line, `- ` bullets in Korean, then `Co-Authored-By: Claude Opus 5.5 <demo@example.com>`.
- Node ≥ 22.12, pnpm. Run all commands from `apps/frontend` unless stated.

## Review Focus

1. Reopening a saved case after the Backend restarted (IDs unknown) → simulation shows a "re-run the case" banner, not a raw 404. Pinned in Task 6 (`isStale`) and Task 12.
2. Sender and recipient are the same address → one analysis is created and used for both sides (Backend rule). Pinned in Task 5.
3. Importing a malformed or tampered case file → rejected with a message; existing cases unchanged. Pinned in Task 3.
4. An analysis that never leaves QUEUED/RUNNING → the run fails at that step with a retryable timeout instead of spinning forever. Pinned in Task 5.
5. A contract enum value with no copy entry → caught by a completeness test before it can render as a blank or a raw code. Pinned in Task 2.

---

### Task 1: App shell, routing, demo login, tokens and fonts

**Files:**
- Create: `src/app/App.tsx`, `src/app/identity.ts`, `src/app/RequireIdentity.tsx`, `src/app/AppShell.tsx`, `src/pages/LoginPage.tsx`, `src/pages/DashboardPage.tsx` (placeholder), `src/pages/NewCasePage.tsx` (placeholder), `src/pages/CasePage.tsx` (placeholder), `src/styles/tokens.css`, `src/styles/base.css`
- Modify: `src/main.tsx`, `index.html`, `package.json`
- Delete: `src/App.tsx`, `src/screens/*`, `src/components/ReviewPicker.tsx`, `src/components/TransfersTable.tsx`, `src/components/evidence.tsx`, `src/components/ui.tsx`, `src/components/ui.test.tsx`, `src/state/*`, `src/lib/review.ts`, `src/styles.css`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Produces: `interface Identity { name: string; signedInAt: string }`; `getIdentity(): Identity | null`, `signIn(name: string): Identity`, `signOut(): void` (localStorage key `scl.identity.v1`). Routes: `#/login`, `#/`, `#/cases/new`, `#/cases/:caseId`. `AppShell` renders the top bar and an `<Outlet/>`.

- [ ] **Step 1:** `pnpm add react-router @radix-ui/react-tooltip @radix-ui/react-dialog @radix-ui/react-tabs idb-keyval`. Read the installed `react-router` README/types once and use its current `HashRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `useNavigate`, `useParams` exports.
- [ ] **Step 2: Write the failing test** `App.test.tsx`:
  - `it('sends a visitor without identity to the login page')`: render `<App/>` with empty localStorage → `getByRole('heading', { name: 'Sign in' })`.
  - `it('opens the dashboard after signing in')`: type "Henry" into the name field, click "Continue" → `getByRole('heading', { name: 'Cases' })`; `getIdentity()?.name === 'Henry'`.
- [ ] **Step 3:** Run `pnpm exec vitest run src/app` → FAIL (module missing).
- [ ] **Step 4:** Implement. `tokens.css` holds the spec §10 colours as custom properties plus `@font-face` for Departure Mono (`https://cdn.jsdelivr.net/gh/rektdeckard/departure-mono@v1.500/public/assets/DepartureMono-Regular.woff2`); `index.html` links Fontshare Satoshi 400/500/700 and Pretendard Variable dynamic subset v1.3.9 (URLs as in the v2 mockup). `--font-ui: "Satoshi", "Pretendard Variable", system-ui, sans-serif`, `--font-mono: "Departure Mono", ui-monospace, monospace`, mono text at 11px or 22px (pixel grid). Login page: name or e-mail field, "Continue", and the one-line notice `ui.login.notice`. Placeholder pages render only their heading. Remove the deleted files and fix imports so `pnpm exec tsc -b` passes.
- [ ] **Step 5:** Run `pnpm exec vitest run src/app && pnpm exec tsc -b && pnpm lint` → PASS, no lint warnings.
- [ ] **Step 6:** Commit (only if Henry approved committing): `refactor(frontend): 로그인과 라우팅 중심으로 앱 골격 교체`.

### Task 2: English copy dictionary, copy helpers and `<Term>` tooltips

**Files:**
- Create: `src/i18n/en.ts`, `src/i18n/I18nProvider.tsx`, `src/i18n/copy.ts`, `src/components/Term.tsx`
- Modify: `src/contracts/catalog.ts` (add `rulesetConfig`)
- Delete: `src/lib/labels.ts`
- Test: `src/i18n/completeness.test.ts`, `src/i18n/copy.test.ts`, `src/components/Term.test.tsx`

**Interfaces:**
- Produces:
  - `type Messages = typeof en`; `useT(): (key: MessageKey, params?: Record<string, string | number>) => string`, where `MessageKey` is the union of dotted paths in `en`. A missing key returns the key itself.
  - `interface CopyPair { title: string; detail: string }`; `interface DecisionCopy { label: string; sentence: string; detail: string }`.
  - `createCopy(messages: Messages): Copy` and `useCopy(): Copy` with `decision(a: Action): DecisionCopy`, `reason(code: string): CopyPair`, `rule(id: string, params?: RuleParams): CopyPair`, `evidence(type: string): string`, `coverage(reason: string): string`, `error(code: string): CopyPair`, `gatewayOutcome(o: string): string`, `gatewayReason(r: string): string`, `networkOutcome(o: string): string`, `explanation(c: string): string`, `glossary(id: GlossaryId): { term: string; definition: string }`. Unknown code → `{ title: 'Unrecognised code', detail: 'The backend returned {code}, which this app has no description for.' }`.
  - `type RuleParams = { windowSeconds?: number; minRecipients?: number; minTransactions?: number }`; `interface RulesetConfig { version: string; highRiskThreshold: number; rules: Record<string, RuleParams & { score: number; riskLevel: string; enabled: boolean; ruleVersion: string }> }`; `rulesetConfig(version: string): RulesetConfig | undefined` reads `contracts/config/rulesets/*.json`.
  - `<Term id: GlossaryId>{children}</Term>`: children, then a `?` button (`aria-label` "What is {term}?") opening a Radix Tooltip on hover and focus with the definition.

- [ ] **Step 1: Write the failing tests**
  - `completeness.test.ts` `it.each` over every enum in the contract schemas (`common/Action`, `common/ErrorCode`, `common/CoverageReason`, `common/JobStatus`, `policy/ReasonCode`, `kyt/RuleId`, `kyt/Evidence.type`, `experiment/GatewayReason`, `GatewayExperimentResult.outcome`, `ConstellationSimulationResult.outcome`, `experiment/SimulationExplanation`), read from the schema JSON via `import.meta.glob`: the matching `en` entry exists and is non-empty. Also `TIMEOUT`, `NETWORK_ERROR`, `RESPONSE_CONTRACT_VIOLATION`, `RESPONSE_LINK_MISMATCH`, `UNSTRUCTURED_ERROR` in `en.error`.
  - `copy.test.ts`: `copy.rule('RAPID_FAN_OUT', { windowSeconds: 300, minRecipients: 3 }).detail` contains `"3"` and `"300 seconds"`; `copy.reason('NOPE').title === 'Unrecognised code'`; `copy.reason('SANCTION_EXACT_MATCH').title` contains no underscore.
  - `Term.test.tsx`: focus the `?` button for `pslice` → the definition text appears (`findByText`).
- [ ] **Step 2:** Run `pnpm exec vitest run src/i18n src/components/Term.test.tsx` → FAIL.
- [ ] **Step 3:** Implement `en.ts` with this copy (titles/sentences exact; keep the structure `decision.X`, `reason.X`, `rule.X`, `evidence.X`, `coverage.X`, `error.X`, `gateway.outcome.X`, `gateway.reason.X`, `network.outcome.X`, `network.explanation.X`, `glossary.X`, `ui.*`):

  | Key | Title / sentence | Detail |
  | --- | --- | --- |
  | decision.ALLOW | Allow · The transfer can proceed. | Both wallets were fully analysed and no risk signal was found. |
  | decision.WARN | Warn · Proceed only after the user confirms a warning. | Risk signals were found; this policy asks for confirmation instead of a hold. |
  | decision.REVIEW | Review · Hold the transfer for a compliance review. | The policy cannot clear this transfer automatically. |
  | decision.BLOCK | Block · Do not send this transfer. | The policy blocks it. |
  | reason.NO_RISK_SIGNALS | No risk signal on either wallet. | Both analyses covered the whole window and no detection rule fired. |
  | reason.SANCTION_EXACT_MATCH | A wallet in this transfer is a sanctioned address. | The sender or the recipient matches an entry on the sanctions list used for this analysis. The policy blocks exact matches. |
  | reason.SANCTION_DIRECT_FLOW_REVIEW | A wallet transacted directly with a sanctioned address. | This policy version sends direct exposure to review. |
  | reason.SANCTION_DIRECT_FLOW_BLOCK | A wallet transacted directly with a sanctioned address. | This policy version blocks direct exposure. |
  | reason.INSUFFICIENT_ASSESSMENT | A wallet could only be partly analysed. | Some data was missing, so no overall risk score exists. The policy does not clear an incomplete analysis automatically. |
  | reason.RISK_SIGNALS_DETECTED | Risk signals were found. | At least one detection rule fired on a wallet in this transfer. |
  | reason.HIGH_RISK_REVIEW | Overall risk is high. | The combined risk level is High; this policy sends high risk to review. |
  | reason.HIGH_RISK_BLOCK | Overall risk is high. | The combined risk level is High; this policy blocks high risk. |
  | reason.HIGH_RISK_WARN | Overall risk is high. | The combined risk level is High; this policy warns on high risk. |
  | rule.SANCTION_EXACT | Sanctioned address | The analysed wallet itself is on the sanctions list. |
  | rule.SANCTION_DIRECT_FLOW | Direct exposure to a sanctioned address | The wallet sent funds to, or received funds from, a sanctioned address in a single transfer. |
  | rule.RAPID_FAN_OUT | Rapid fan-out | The wallet sent to {minRecipients} or more different wallets within {windowSeconds} seconds. |
  | rule.RAPID_REPEAT | Rapid repeat transfers | The wallet sent {minTransactions} or more transfers of the same asset to the same wallet within {windowSeconds} seconds. |
  | evidence.ADDRESS_LABEL | The address appears on a list. | |
  | evidence.DIRECT_FLOW | A transfer with a listed address. | |
  | evidence.TEMPORAL_PATTERN | A timing pattern across several transfers. | |
  | coverage.TRANSACTION_LIMIT_REACHED | Stopped at the transaction limit before the end of the window. | |
  | coverage.TIME_BOUNDARY_NOT_REACHED | Did not reach the end of the requested window. | |
  | coverage.TRANSACTION_FETCH_FAILED | Some transactions could not be fetched. | |
  | coverage.UNSUPPORTED_INSTRUCTION | Some instructions are not supported yet. | |
  | coverage.PARSE_FAILED | Some transactions could not be read. | |
  | coverage.OWNER_UNRESOLVED | The owner wallet of a token account could not be identified. | |
  | coverage.TIMESTAMP_UNAVAILABLE | Some transactions have no timestamp. | |
  | coverage.LABEL_DATASET_UNAVAILABLE | The sanctions list could not be refreshed; the last known version was used. | |
  | gateway.outcome.SUBMISSION_ALLOWED | The route submitted the transfer. | |
  | gateway.outcome.SUBMISSION_REJECTED | The route refused to submit the transfer. | |
  | gateway.outcome.REVIEW_REQUIRED | The route held the transfer for review. | |
  | gateway.reason.POLICY_NOT_ENFORCED | This route does not apply the policy. | |
  | gateway.reason.POLICY_ALLOW / POLICY_BLOCK / POLICY_REVIEW | The policy allows it. / The policy blocks it. / The policy asks for a review. | |
  | gateway.reason.WARNING_NOT_ACKNOWLEDGED / WARNING_ACKNOWLEDGED | The user has not confirmed the warning. / The user confirmed the warning. | |
  | network.outcome.NO_SUBMISSION_PATH | No proposer will take the transfer. | |
  | network.outcome.INCLUSION_NOT_ENFORCED | Nothing forces the leader to include it. | |
  | network.outcome.INCLUSION_ENFORCED | The leader must include it. | |
  | network.outcome.INVALID_SCENARIO | These conditions contradict each other. | |
  | network.explanation.* | NO_ACCEPTING_PROPOSER: Every proposer rejects it. · NOT_SUBMITTED_TO_ACCEPTING_PROPOSER: It was not sent to a proposer that accepts it. · PSLICE_UNAVAILABLE: The proposer's batch (pslice) is not available. · ATTESTATION_CONDITION_NOT_MET: Not enough attestations. · ATTESTATION_CONDITION_MET: Enough attestations. · LEADER_EXCLUSION_VALID: The rules allow the leader to drop it. · LEADER_EXCLUSION_INVALID: The rules do not allow the leader to drop it. · NO_EXCLUSION_ATTEMPT: The leader does not try to drop it. · REJECTING_COUNT_EXCEEDS_TOTAL: More rejecting proposers than proposers. · CONTRADICTORY_SUBMISSION_PATH: Sent to an accepting proposer, but none accept it. · MOCK_RESULT_NOT_PROTOCOL_VALIDATED: Placeholder result from the Mock API. No protocol rule was applied. | |

  Glossary (`GlossaryId` = `kyt | sanctionsList | directExposure | fanOut | repeat | partialAnalysis | tokenAccount | instruction | slot | signature | leader | proposer | pslice | attestation | constellation | gateway | unenforcedRoute`):
  kyt: Know Your Transaction. Screening a wallet's transactions for risk, such as contact with sanctioned addresses. · sanctionsList: The addresses treated as sanctioned in this analysis. Fixture data uses a synthetic test list, not the real OFAC list. · directExposure: The wallet sent funds to, or received funds from, a listed address in one transfer. · fanOut: Sending to many different wallets in a short time, a pattern used to split and move funds. · repeat: Many transfers of the same asset to the same wallet in a short time. · partialAnalysis: Some data in the window was missing, so no overall score was produced. · tokenAccount: On Solana, tokens sit in token accounts owned by a wallet. A transfer moves tokens between token accounts; the owners are the wallets. · instruction: A transaction is a list of instructions. An inner instruction is one that a program calls while the transaction runs. · slot: Solana's unit of time for producing a block, about 400 ms. · signature: The transaction's ID on Solana. · leader: The validator scheduled to produce the block for a slot. Today it decides which transactions go in. · proposer: In Constellation, one of several validators that collect transactions in parallel. · pslice: In Constellation, a proposer's batch of transactions that validators attest to. · attestation: Validators confirming they have received a proposer's batch. With enough attestations, the leader must include the batch. · constellation: A proposed Solana design with several concurrent proposers, meant to stop a single leader from censoring transactions. The rules used here are a team draft pending research approval. · gateway: The submission step inside a wallet or exchange app, where the app can refuse to send a transfer to the network. · unenforcedRoute: Another way to submit the same transfer, such as a different wallet app or a direct RPC call, that does not run this policy.

  `ui.*` strings are added by each later task as it needs them. Delete `lib/labels.ts` and move its remaining users to `useCopy`.
- [ ] **Step 4:** Run `pnpm exec vitest run src/i18n src/components` → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 계약 코드 문구 사전과 용어 툴팁 추가`.

### Task 3: Case model, browser storage, export and import

**Files:**
- Create: `src/cases/model.ts`, `src/cases/store.ts`, `src/cases/transfer.ts`, `src/cases/CasesProvider.tsx`
- Test: `src/cases/store.test.ts`, `src/cases/transfer.test.ts`

**Interfaces:**
- Creates `src/app/apiMode.ts` containing only `export type ApiMode = 'mock' | 'backend'`; Task 4 adds the functions to the same file.
- Produces (in `model.ts`):
  ```ts
  type RunStep = 'sender' | 'recipient' | 'policy'
  interface CaseParty { address: string; fixtureId: string | null }
  interface CaseInput { mode: Mode; sender: CaseParty; recipient: CaseParty; asset: Asset; amountRaw: string; scope: Scope | null; policyVersion: string; rulesetVersion: string | null }
  interface StoredError { kind: FailureKind | 'timeout'; code: string; message: string; retryable: boolean; status: number | null; requestId: string | null }
  interface AnalysisSnapshot { analysisId: string; result: KYTAnalysisResult; transfers: NormalizedTransfer[] | null }
  interface GatewaySimRecord { key: string; at: string; route: GatewayRoute; result: GatewayExperimentResult | null; error: StoredError | null }
  interface ConstellationSimRecord { key: string; at: string; batch: string; purpose: 'compare' | 'sweep'; version: string; scenario: ConstellationScenario; result: ConstellationSimulationResult | null; error: StoredError | null }
  interface CaseRun { runId: string; startedAt: string; finishedAt: string | null; apiMode: ApiMode; status: 'RUNNING' | 'DONE' | 'FAILED'; failedStep: RunStep | null; error: StoredError | null; sender: AnalysisSnapshot | null; recipient: AnalysisSnapshot | null; complianceRequest: ComplianceRequest | null; compliance: ComplianceResponse | null; gateway: GatewaySimRecord[]; constellation: ConstellationSimRecord[] }
  interface CaseRecord { id: string; createdAt: string; createdBy: string; input: CaseInput; runs: CaseRun[] }
  toStoredError(e: unknown): StoredError
  newCaseId(existing: CaseRecord[]): string   // "CL-0001", next free number
  latestRun(c: CaseRecord): CaseRun | null
  ```
- `store.ts`: `interface CaseStore { list(): Promise<CaseRecord[]>; get(id: string): Promise<CaseRecord | undefined>; put(r: CaseRecord): Promise<void>; remove(id: string): Promise<void> }`; `createIdbCaseStore(): CaseStore` (idb-keyval `createStore('scl-cases', 'cases')`); `createMemoryCaseStore(seed?: CaseRecord[]): CaseStore`; `validateCaseRecord(r: unknown): string[]` (shape checks plus `contractErrors` on every embedded API object).
- `transfer.ts`: `exportCases(records: CaseRecord[]): string` → `{ "format": "scl-cases", "version": 1, "exportedAt", "cases" }`; `parseCaseExport(text: string): { ok: true; cases: CaseRecord[] } | { ok: false; error: string }`; `mergeImported(existing: CaseRecord[], incoming: CaseRecord[]): CaseRecord[]` (a colliding id gets the next free id).
- `CasesProvider` / `useCases(): { cases: CaseRecord[]; ready: boolean; save(r: CaseRecord): Promise<void>; remove(id: string): Promise<void>; importText(text: string): Promise<{ added: number } | { error: string }>; exportText(): string }`. Records failing `validateCaseRecord` on read are listed with a "could not be read" state, not dropped silently.

- [ ] **Step 1: Write the failing tests**
  - `store.test.ts`: memory store put/get/list/remove round-trip; `newCaseId([])==='CL-0001'`, `newCaseId([{id:'CL-0007'}…])==='CL-0008'`.
  - `transfer.test.ts`: `parseCaseExport(exportCases([c]))` returns the same case; wrong `format` → `ok:false`; a case whose stored `compliance` has a COMPLETED analysis with `riskScore: null` → `ok:false` and the error names the case id (Review Focus 3); `mergeImported` renames a colliding `CL-0001` to the next free id.
  Build test cases from fixtures (`sanctioned/public-policy-response.json`, `sanctioned/analysis.json`).
- [ ] **Step 2:** Run `pnpm exec vitest run src/cases` → FAIL.
- [ ] **Step 3:** Implement the files above.
- [ ] **Step 4:** Run `pnpm exec vitest run src/cases` → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 케이스 저장과 내보내기·가져오기 추가`.

### Task 4: API mode switching and a persistent Mock Backend

**Files:**
- Modify: `src/app/apiMode.ts` (created type-only in Task 3), `src/mocks/backend.ts`, `src/mocks/browser.ts`, `src/main.tsx`, `vite.config.ts`
- Delete: `src/config.ts` (contents move to `apiMode.ts`)
- Test: `src/app/apiMode.test.ts`, `src/mocks/backend.test.ts` (add one test)

**Interfaces:**
- Produces: `type ApiMode = 'mock' | 'backend'`; `resolveApiMode(envMode: string | undefined, override: ApiMode | null): ApiMode` (override › env › `'mock'`); `getModeOverride(): ApiMode | null`, `setModeOverride(m: ApiMode | null): void` (localStorage `scl.apiMode.v1`); `currentApiMode(): ApiMode`; `apiBaseUrl: string` (`VITE_API_BASE_URL` or `''`); `backendLabel(): string` (base URL, or `VITE_BACKEND_URL` via dev proxy); `constellationModelOptions: string[]` (unchanged logic from `config.ts`).
- `createMockBackend(options: MockBackendOptions & { storage?: MockStorage })` with `interface MockStorage { load(): string | null; save(json: string): void }`; `localMockStorage(key = 'scl.mock.v1'): MockStorage`. Jobs, reviews and the id sequence are saved after every mutation.
- `vite.config.ts`: `base: process.env.VITE_BASE_PATH ?? '/'`.

- [ ] **Step 1: Write the failing tests**
  - `apiMode.test.ts`: `resolveApiMode('backend', null) === 'backend'`; `resolveApiMode('backend', 'mock') === 'mock'`; `resolveApiMode(undefined, null) === 'mock'`.
  - `backend.test.ts`: `it('keeps analyses across a reload when given storage')`: create an analysis through backend A with a memory `MockStorage`, poll to COMPLETED, build backend B with the same storage and reinstall its handlers (`server.resetHandlers(...b.handlers)`) → `getAnalysis(id)` still returns the COMPLETED result.
- [ ] **Step 2:** Run `pnpm exec vitest run src/app/apiMode.test.ts src/mocks` → FAIL.
- [ ] **Step 3:** Implement. `main.tsx` starts the MSW worker when `currentApiMode() === 'mock'`, in dev and in production builds (`public/mockServiceWorker.js` ships with the build).
- [ ] **Step 4:** Run `pnpm exec vitest run src/app src/mocks` → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): API 모드 전환과 Mock 상태 보존 추가`.

### Task 5: Run a case end to end (`runCase`)

**Files:**
- Create: `src/flow/runCase.ts`
- Test: `src/flow/runCase.test.ts`

**Interfaces:**
- Consumes: `ApiClient` (`src/api/client.ts`), `CaseInput`/`CaseRun`/`toStoredError` (Task 3), `findScenario` (catalog), `newIntentId`/`nowUtcSeconds` (`src/lib/format.ts`).
- Produces:
  ```ts
  type StepState = 'pending' | 'running' | 'done' | 'failed'
  interface RunProgress { sender: StepState; recipient: StepState; policy: StepState }
  interface RunCaseOptions { pollIntervalMs?: number /* 700 */; timeoutMs?: number /* 60000 */; signal?: AbortSignal; apiMode: ApiMode }
  buildAnalysisRequest(party: CaseParty, input: CaseInput): AnalysisRequest
  runCase(api: ApiClient, input: CaseInput, onProgress: (p: RunProgress, run: CaseRun) => void, opts: RunCaseOptions): Promise<CaseRun>
  ```
- Behaviour: FIXTURE parties use `findScenario(fixtureId).request` (+ `rulesetVersion` when set); LIVE parties use `{ address, network: 'mainnet-beta', mode: 'LIVE', scope }`. Same address on both sides → one analysis for both. Both analyses start in parallel and are polled until terminal. A terminal result with `COMPLETED`/`PARTIAL` fetches transfers with `limit: 1000`. `FAILED` → run FAILED at that step with the job's error. No terminal state within `timeoutMs` → FAILED with `{ kind: 'timeout', code: 'TIMEOUT', retryable: true }`. Then POST `/compliance/evaluate` with `intent` from the input. Any `ApiFailure` → FAILED at the current step via `toStoredError`.

- [ ] **Step 1: Write the failing tests** (MSW `setupServer` with `createMockBackend({ queuedPolls: 1, runningPolls: 1 })`, `pollIntervalMs: 0`):
  - `it('runs sender → sanctioned to a Block and reports progress in order')`: `run.status === 'DONE'`, `run.compliance.decision.action === 'BLOCK'`, `run.recipient.transfers.length === 1`, and the recorded progress list reaches `{ sender:'done', recipient:'done', policy:'done' }` with `policy:'running'` seen before it.
  - `it('uses one analysis when sender and recipient are the same')`: count POSTs to `/api/v1/analyses` via `server.events.on('request:start')` → 1; `run.sender.analysisId === run.recipient.analysisId` (Review Focus 2).
  - `it('stops at the sender step when a LIVE analysis fails')`: `failedStep === 'sender'`, `error.code === 'UPSTREAM_UNAVAILABLE'`, `compliance === null`.
  - `it('times out an analysis that never finishes')`: backend with `queuedPolls: 10_000`, `timeoutMs: 50` → `error.code === 'TIMEOUT'`, `retryable === true` (Review Focus 4).
  - `it('fails at the policy step when the network drops')`: override `POST */api/v1/compliance/evaluate` with `HttpResponse.error()` → `failedStep === 'policy'`, `error.kind === 'network'`.
- [ ] **Step 2:** Run `pnpm exec vitest run src/flow/runCase.test.ts` → FAIL.
- [ ] **Step 3:** Implement `runCase`.
- [ ] **Step 4:** Run the same command → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 케이스 실행 흐름 추가`.

### Task 6: Simulation flows

**Files:**
- Create: `src/flow/simulate.ts`
- Test: `src/flow/simulate.test.ts`

**Interfaces:**
- Consumes: `CaseRun`, `GatewaySimRecord`, `ConstellationSimRecord`, `toStoredError` (Task 3).
- Produces:
  ```ts
  gatewayRoutesFor(action: Action): GatewayRoute[]
    // [{routeId:'enforced', policyEnforced:true, warningAcknowledged:false},
    //  …{routeId:'enforced-acknowledged', policyEnforced:true, warningAcknowledged:true} only when action === 'WARN',
    //  {routeId:'not-enforced', policyEnforced:false, warningAcknowledged:false}]
  runGatewaySet(api: ApiClient, run: CaseRun): Promise<GatewaySimRecord[]>
  runConstellationCompare(api: ApiClient, run: CaseRun, versions: string[], scenario: ConstellationScenario): Promise<ConstellationSimRecord[]>
  runAttestationSweep(api: ApiClient, run: CaseRun, version: string, scenario: ConstellationScenario, step?: number /* 5 */): Promise<ConstellationSimRecord[]>
  isStale(records: Array<{ error: StoredError | null }>): boolean   // any error with status 404
  ```
  Calls use only `run.compliance.intent.intentId` and `run.compliance.decision.decisionId`.

- [ ] **Step 1: Write the failing tests** (MSW + mock backend; create the run with `runCase` from Task 5):
  - BLOCK run → `runGatewaySet` returns 2 records; outcomes `SUBMISSION_REJECTED` then `SUBMISSION_ALLOWED`.
  - WARN run (`warn` fixture) → 3 records: `REVIEW_REQUIRED`, `SUBMISSION_ALLOWED`, `SUBMISSION_ALLOWED`.
  - `it('marks a run stale after the backend forgets it')`: run created on backend A; install a fresh backend B; `runGatewaySet` records carry `error.status === 404`; `isStale(...) === true` (Review Focus 1).
  - Sweep with mock version → 21 records whose `scenario.attestationPercent` go 0, 5 … 100.
  - Compare with `['0.0.0-research-pending', '0.1.0-draft']` on Mock → first has a result, second has `error.code === 'UNSUPPORTED_VERSION'`.
- [ ] **Step 2:** Run `pnpm exec vitest run src/flow/simulate.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): Gateway·Constellation 시뮬레이션 흐름 추가`.

### Task 7: Shared UI pieces

**Files:**
- Create: `src/lib/explorer.ts`, `src/components/StatusTag.tsx`, `src/components/Identicon.tsx`, `src/components/AddressChip.tsx`, `src/components/TxChip.tsx`, `src/components/RiskGauge.tsx`, `src/components/DitherLoader.tsx`, `src/components/ErrorNotice.tsx`, `src/components/ChartFrame.tsx`, `src/components/components.css`
- Test: `src/lib/explorer.test.ts`, `src/components/components.test.tsx`

**Interfaces:**
- Produces:
  - `explorerLinks(kind: 'address' | 'tx', id: string): { solscan: string; solanaExplorer: string }` → `https://solscan.io/account/{id}` · `https://solscan.io/tx/{id}` · `https://explorer.solana.com/address/{id}` · `https://explorer.solana.com/tx/{id}`. Open one real address and one real transaction in the browser once to confirm these formats before relying on them.
  - `chainLinkable(p: DataProvenance | null | undefined): boolean` → true only for `ON_CHAIN`.
  - `<DecisionTag action: Action />`, `<RiskTag level: RiskLevel | null />` (icon + label; null → "Not scored").
  - `identicon(address: string, size: number): string` (SVG markup, deterministic, BAY blues), `<Identicon address size />`.
  - `<AddressChip address: string; provenance: DataProvenance | null; full?: boolean />`, `<TxChip signature: string; provenance: DataProvenance | null />`: identicon (address only), Departure Mono text, Solscan/Explorer links, disabled with tooltip `ui.chain.synthetic` ("Synthetic data. Not on chain.") when not linkable.
  - `<RiskGauge score: number | null; level: RiskLevel | null; highThreshold: number />` (threshold from `rulesetConfig(...).highRiskThreshold`; null → hatched bar, "Not scored", and `ui.risk.notScored` "Some data was missing, so no overall score was produced. This is not a score of 0."; LOW → `ui.risk.lowCaveat` "No risk signal was found. This is not a safety guarantee.").
  - `<DitherLoader label: string />`: canvas 4×4 Bayer ordered dither of a moving gradient in BAY blues at ~12 fps while mounted; reduced motion → one static frame.
  - `<ErrorNotice error: StoredError; step?: RunStep; onRetry?: () => void />`: sentence from `copy.error(code)`, step name, Retry when `retryable && onRetry`, raw code and requestId in small text.
  - `<ChartFrame question: string; answer: string; table: ReactNode>{chart}</ChartFrame>` with a "Show as table" toggle.

- [ ] **Step 1: Write the failing tests:** exact URLs from `explorerLinks`; `chainLinkable({dataType:'SYNTHETIC',…}) === false`; `AddressChip` with synthetic provenance renders no `<a href>`; `RiskGauge` with `score={null}` shows "Not scored" and no element with text `0`; `DecisionTag action="BLOCK"` has visible text "Block"; `ChartFrame` toggles the table.
- [ ] **Step 2:** Run `pnpm exec vitest run src/lib/explorer.test.ts src/components` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 공통 UI 조각과 익스플로러 링크 추가`.

### Task 8: Dashboard

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Create: `src/pages/dashboard/DecisionMix.tsx`, `src/pages/dashboard/CaseRow.tsx`, `src/pages/dashboard/filter.ts`
- Test: `src/pages/dashboard/dashboard.test.tsx`, `src/pages/dashboard/filter.test.ts`

**Interfaces:**
- Consumes: `useCases()` (Task 3), `latestRun`, `DecisionTag`, `AddressChip`, `useCopy`.
- Produces: `type CaseFilter = 'all' | Action | 'failed' | 'running'`; `filterCases(cases: CaseRecord[], filter: CaseFilter, query: string): CaseRecord[]` (query matches case id, either address, or any stored transfer signature, case-insensitive substring).
- Page: question heading `ui.dashboard.title` "Cases" and answer line ("{n} transfers checked"); decision mix bar (status colours + icon + label + count, from the latest DONE run of each case); filter chips; search; one row per case: id, sender → recipient chips, formatted amount and asset, decision tag, every reason title joined with " · ", sender and recipient risk (number or "Not scored"), data source (Synthetic / On-chain / Mock), relative time. Row click → `#/cases/:id`. Empty state with "New case".

- [ ] **Step 1: Write the failing tests:** `filterCases` by `'BLOCK'`, by address prefix, by signature; dashboard with a memory store of 3 cases (sanctioned BLOCK, warn WARN, partial-sanctioned BLOCK with two reasons) → chip "Block" leaves 2 rows; the partial-sanctioned row shows both reason titles.
- [ ] **Step 2:** Run `pnpm exec vitest run src/pages/dashboard` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 케이스 대시보드 구현`.

### Task 9: New case

**Files:**
- Modify: `src/pages/NewCasePage.tsx`
- Create: `src/pages/newcase/TransferForm.tsx`, `src/pages/newcase/RunProgressView.tsx`
- Test: `src/pages/newcase/newcase.test.tsx`

**Interfaces:**
- Consumes: `runCase` (Task 5), `useCases`, `newCaseId`, `getIdentity`, `fixtureScenarios`/`policyVersions`/`rulesetVersions` (catalog), `parseDecimalToRaw`, `DitherLoader`, `ErrorNotice`.
- Form: mode (FIXTURE / LIVE); FIXTURE → sender fixture (default `sender`) and recipient fixture selects, addresses read-only; LIVE → two address fields (Base58 32–44 chars). Asset (SOL / SPL / Token-2022 with mint and decimals), amount (decimal → `amountRaw`), collapsed "Advanced": LIVE window (UTC) and max transactions, policy version, ruleset version. A scenario list shows recipient fixtures with the decision found in that fixture's `public-policy-response.json`, labelled `ui.newcase.expected` "Expected with fixture data".
- `NewCasePage` takes an optional prop `runOptions?: Partial<RunCaseOptions>` merged over the defaults (tests pass `{ pollIntervalMs: 0 }`); `CasePage` takes the same prop for Task 12's re-run.
- Run: save a RUNNING run first, update the record on each progress callback, show three steps (Sender wallet, Recipient wallet, Policy) with `DitherLoader` on the running step; DONE → navigate to `#/cases/:id`; FAILED → `ErrorNotice` at the failed step and "Retry", which adds a new run to the same case.

- [ ] **Step 1: Write the failing tests** (MSW mock backend, memory store, `runOptions={{ pollIntervalMs: 0 }}`):
  - FIXTURE sender → sanctioned, Run → URL becomes `#/cases/CL-0001` and the stored case has one DONE run.
  - LIVE with address `abc` → error text from `ui.newcase.badAddress`, no API call.
  - Amount `0.0000000001` SOL → error from `parseDecimalToRaw`.
  - LIVE valid addresses on Mock → FAILED at the sender step, `ErrorNotice` visible with Retry.
- [ ] **Step 2:** Run `pnpm exec vitest run src/pages/newcase` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 새 케이스 입력과 실행 진행 화면 구현`.

### Task 10: Case page, part 1: verdict, reasons and evidence, audit, runs

**Files:**
- Modify: `src/pages/CasePage.tsx`
- Create: `src/pages/case/VerdictHeader.tsx`, `src/pages/case/WhyChain.tsx`, `src/pages/case/AuditInfo.tsx`, `src/pages/case/RunSwitcher.tsx`
- Test: `src/pages/case/case.test.tsx`

**Interfaces:**
- Consumes: `useCases`, `latestRun`, `useCopy`, `DecisionTag`, `RiskGauge`, `AddressChip`, `TxChip`, `ErrorNotice`, `Term`.
- Produces: `CasePage` reads `:caseId`, shows the selected run (default latest) and a `RunSwitcher` when there are several runs; a "Simulate enforcement" button (enabled for DONE runs) that later opens Task 12's dialog via `onSimulate`.
- Verdict header: decision label and sentence, then every reason (title + detail) with equal weight, the transfer (sender → recipient chips, amount), and combined risk from `decision.riskScore/riskLevel`.
- Why chain: for each `decision.referencedEvidenceIds` id, find the evidence in `assessments.sender` or `.recipient`; show which wallet, the evidence sentence, related addresses, label references with `<Term id="sanctionsList">`, and each linked transfer from the stored transfers (time UTC or "No timestamp", amount, "Instruction {n}" or "Inner instruction {n}.{m}" with `<Term id="instruction">`, `TxChip`). An id not found → `ui.case.evidenceMissing` with the id.
- Audit: policy version, ruleset version, data provenance (type, source), label dataset (source, version, fetched at), evaluated at, analysis ids, request ids, decision id, raw reason codes, API mode of the run.
- FAILED run: `ErrorNotice` with the failed step and "Re-run case".

- [ ] **Step 1: Write the failing tests** (memory store seeded with runs built by `runCase` against the mock backend):
  - sanctioned case → heading text "Block", reason title "A wallet in this transfer is a sanctioned address.", label reference `synthetic-sanction-001` in the why chain, no `SANCTION_EXACT_MATCH` text outside the Audit section.
  - partial-sanctioned case → both reason titles present; combined risk "Not scored".
  - Audit section contains `SANCTION_EXACT_MATCH` and the decision id.
- [ ] **Step 2:** Run `pnpm exec vitest run src/pages/case/case.test.tsx` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 케이스 판정·근거·감사 정보 화면 구현`.

### Task 11: Case page, part 2: wallet panels, fund flow graph, timeline

**Files:**
- Create: `src/charts/buildFlow.ts`, `src/charts/FundFlowGraph.tsx`, `src/charts/ActivityTimeline.tsx`, `src/pages/case/WalletPanel.tsx`
- Modify: `src/pages/CasePage.tsx`
- Test: `src/charts/buildFlow.test.ts`, `src/pages/case/wallet.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface FlowNode { id: string; kind: 'sender' | 'recipient' | 'counterparty' | 'account'; address: string; ownerUnknown: boolean }
  interface FlowEdge { id: string; from: string; to: string; kind: 'recorded' | 'requested'; evidence: boolean; amountRaw: string; asset: Asset; timestamp: string | null; signature: string | null }
  buildFlow(args: { sender: string; recipient: string; requested: { amountRaw: string; asset: Asset }; senderTransfers: NormalizedTransfer[]; recipientTransfers: NormalizedTransfer[]; evidenceTransferIds: { sender: Set<string>; recipient: Set<string> } }): { nodes: FlowNode[]; edges: FlowEdge[]; hiddenCount: number }
  ```
  Transfers in both snapshots are merged by `signature + instructionIndex + innerInstructionIndex + transferOrdinal`. A missing owner (`fromAddress`/`toAddress` null) becomes an `account` node keyed by the token account with `ownerUnknown: true`. At most 12 counterparties; the rest are counted in `hiddenCount`. One `requested` edge sender → recipient.
- `FundFlowGraph`: fixed layout (sender left, recipient middle, counterparties right ordered by first timestamp), node ring colour = that wallet's risk level, evidence edges in `--accent`, requested edge dashed, hover tooltip per edge (time, amount, signature), table view through `ChartFrame`. Question "Who did these wallets transact with?", answer line from the counts.
- `ActivityTimeline`: one lane per wallet, x zoomed to the first–last timestamp (window shown as text), evidence transfers highlighted, "No timestamp" bucket, hover tooltip, table view.
- `WalletPanel`: `RiskGauge`, rules fired (`copy.rule(id, rulesetConfig(version).rules[id])` with `<Term>` for fan-out, repeat, direct exposure), coverage sentence(s) via `copy.coverage`, counts, `<Term id="partialAnalysis">` when PARTIAL.

- [ ] **Step 1: Write the failing tests:**
  - `buildFlow` on sender + warn snapshots: 3 evidence edges from the recipient to 3 counterparties, 1 recorded edge sender → recipient, 1 requested edge; a transfer present in both snapshots appears once.
  - `buildFlow` on the `unresolved` fixture: an `account` node with `ownerUnknown: true`.
  - `wallet.test.tsx`: warn recipient panel shows "Rapid fan-out" and a detail containing "300 seconds".
- [ ] **Step 2:** Run `pnpm exec vitest run src/charts src/pages/case/wallet.test.tsx` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 지갑 위험도·자금 흐름·타임라인 구현`.

### Task 12: Simulation dialog

**Files:**
- Create: `src/pages/case/simulation/SimulationDialog.tsx`, `GatewayTab.tsx`, `NetworkTab.tsx`, `RouteDiagram.tsx`, `StageStrip.tsx`, `SweepStrip.tsx`, `ProposerDiagram.tsx`, `stages.ts`
- Modify: `src/pages/CasePage.tsx`
- Test: `src/pages/case/simulation/simulation.test.tsx`, `src/pages/case/simulation/stages.test.ts`

**Interfaces:**
- Consumes: `runGatewaySet`, `runConstellationCompare`, `runAttestationSweep`, `isStale` (Task 6), `runCase` (Task 5), `useCases`, `constellationModelOptions`, `currentApiMode`, `defaultConstellationScenario`.
- Produces: `type Stage = 'proposerPath' | 'pslice' | 'attestation' | 'leaderExclusion'`; `type StageState = 'pass' | 'fail' | 'none' | 'notReported'`; `stagesFrom(result: ConstellationSimulationResult): Record<Stage, StageState>`, a display lookup only:
  NO_ACCEPTING_PROPOSER, NOT_SUBMITTED_TO_ACCEPTING_PROPOSER → proposerPath fail; `proposerPathAvailable` true → proposerPath pass; PSLICE_UNAVAILABLE → pslice fail; ATTESTATION_CONDITION_MET / NOT_MET → attestation pass / fail; LEADER_EXCLUSION_INVALID → leaderExclusion pass (the transfer stays), LEADER_EXCLUSION_VALID → leaderExclusion fail, NO_EXCLUSION_ATTEMPT → leaderExclusion none; anything not mentioned → notReported.
- Dialog (Radix Dialog + Tabs "Submission routes" / "Network"). Intro, exact copy: "A decision is enforced only for transfers that go through this app." / "These simulations show what happens to the same transfer on other routes and on the network."
- Gateway tab: question "If this app enforces the decision, does the transfer stop?"; Run → `runGatewaySet`, records saved into the run; one answer line per route ("{route name}: {outcome sentence} {reason sentences}"), `RouteDiagram`, and three fixed limitation lines: "No transaction is broadcast." / "'Submitted' means the route did not stop it, not that the network included it." / "The other route is a model, not an observation of a real service." `<Term id="gateway">`, `<Term id="unenforcedRoute">`.
- Network tab: question "Once submitted, can the transfer still be dropped?"; inputs (proposers, rejecting proposers, sent to an accepting proposer, pslice available, attestation %, leader tries to drop it) each with `<Term>`; model A and model B selects; Run → `runConstellationCompare`; per model: outcome sentence, `StageStrip`, explanation sentences, `ProposerDiagram`. Backend mode only: "Attestation sweep" → `runAttestationSweep` on model A → `SweepStrip` of outcome bands, no threshold line. Mock mode: hide model B and sweep, show `ui.sim.mockOnly` "The Mock API returns one placeholder result. Connect a Backend to compare models." Fixed notice: "Simulation only. Not a mainnet result. The rules are a team draft pending research approval."
- Stale: if `isStale` on the latest attempt → banner `ui.sim.stale` "The backend no longer has this run, probably because it restarted. Re-run the case to simulate again." with "Re-run case" (runs `runCase` with the same input, adds the run, keeps the dialog open on the new run). Saved results render read-only on open. `RouteDiagram`, `StageStrip` and `SweepStrip` each sit in a `ChartFrame` with a table view and hover tooltips.

- [ ] **Step 1: Write the failing tests:**
  - `stages.test.ts`: the mock-result codes → every stage `notReported` except proposerPath `pass`; a draft-style result with ATTESTATION_CONDITION_MET + LEADER_EXCLUSION_INVALID → attestation `pass`, leaderExclusion `pass`.
  - BLOCK case, Gateway tab, Run → text "The route refused to submit the transfer." and "This route does not apply the policy."
  - Fresh mock backend after the run was created → Run shows the stale banner and "Re-run case".
  - Mock mode Network tab → `ui.sim.mockOnly` text visible, no "Attestation sweep" button.
- [ ] **Step 2:** Run `pnpm exec vitest run src/pages/case/simulation` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 집행 시뮬레이션 다이얼로그 구현`.

### Task 13: Top bar: mode indicator, settings, export and import

**Files:**
- Modify: `src/app/AppShell.tsx`
- Create: `src/app/SettingsMenu.tsx`
- Test: `src/app/settings.test.tsx`

**Interfaces:**
- Consumes: `currentApiMode`, `setModeOverride`, `backendLabel`, `useCases().exportText/importText`, `signOut`.
- Top bar: wordmark, "Cases" link, mode indicator always visible ("Mock data" in Review violet with dot, or "Backend · {backendLabel()}"), signed-in name, settings menu: switch API mode (sets the override and reloads), "Export cases" (downloads `scl-cases-YYYY-MM-DD.json`), "Import cases" (file input → `importText`, shows "{n} cases imported" or the parse error), "Sign out".

- [ ] **Step 1: Write the failing tests:** choosing "Use Mock data" calls `setModeOverride('mock')` (spy) and `location.reload` (stub); importing a file with `{"format":"other"}` shows the error and leaves the case count unchanged; export creates a Blob whose text parses with `parseCaseExport`.
- [ ] **Step 2:** Run `pnpm exec vitest run src/app/settings.test.tsx` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (if approved): `feat(frontend): 모드 표시와 설정 메뉴 추가`.

### Task 14: Wire the real Backend locally, write the wiring guide, prepare deployment

**Files:**
- Create: `apps/frontend/docs/backend-wiring.md`, `apps/frontend/.env.production.example`
- Modify: `apps/frontend/.env.backend`, `apps/frontend/README.md`

- [ ] **Step 1:** Tell Henry in one line that this installs JDK 17 with Homebrew, then run `brew install openjdk@17` and put it on PATH for the session (`export PATH="$(brew --prefix openjdk@17)/bin:$PATH"`). Expected: `java -version` prints 17.
- [ ] **Step 2:** `gh repo clone baypeline/be ~/Documents/GitHub/be` (sibling of the monorepo, as `be/README.md` expects). In the monorepo root: `python3.12 -m venv .venv && .venv/bin/pip install -e '.[test]'`.
- [ ] **Step 3:** In `~/Documents/GitHub/be`: `scripts/run-local.sh start`, then `scripts/run-local.sh status`. Expected: kyt, policy, gateway, constellation, backend all `[UP]`.
- [ ] **Step 4:** Read the registered model versions in `be/simulations/constellation/src/main/java/com/baypeline/constellation/` and make `VITE_CONSTELLATION_MODELS` in `.env.backend` match them exactly.
- [ ] **Step 5:** `pnpm dev:backend`, open it in the browser and walk: sign in → New case FIXTURE sender → sanctioned (expect Block) → simulation both tabs (expect two routes; draft vs single-leader compare; sweep bands) → New case sender → direct-flow with policy 1.1.0 (expect what the Policy Engine returns) → New case sender → partial-sanctioned → stop the Backend, reopen a case, Run a simulation (expect the stale banner) → restart, Re-run case. Write down what each step showed.
- [ ] **Step 6:** Write `docs/backend-wiring.md` (Korean, for the Backend owner): services and ports (Backend 8080, KYT 8001, Policy 8002, Gateway 8003, Simulator 8004), `LOCAL_COLLECTOR_ENABLED`/`LOCAL_COLLECTOR_FIXTURES_DIR` until a Collector exists, `CONSTELLATION_MOCK_ENABLED`, a public HTTPS address, adding the deployed frontend origin to `CORS_ALLOWED_ORIGINS`, the frontend build variables (`VITE_API_MODE=backend`, `VITE_API_BASE_URL`, `VITE_CONSTELLATION_MODELS`, `VITE_BASE_PATH`), and how to check the connection (`/health` on each port, the top-bar mode indicator, one sanctioned case).
- [ ] **Step 7:** `.env.production.example` with those four variables and placeholder values. `VITE_API_MODE=backend VITE_API_BASE_URL=http://127.0.0.1:8080 pnpm build && pnpm preview --port 4173`; with the local Backend running, one sanctioned case works through the absolute base URL (this exercises CORS from `http://localhost:4173`; if the Backend rejects that origin, start it with `CORS_ALLOWED_ORIGINS` including it and note this in the guide).
- [ ] **Step 8:** Rewrite `README.md`: what the app is, the three modes, commands, the completion-criteria table (Notion 04 §6, 8 rows, status and where each lives, rows 2 and 6 OPEN with the reason), link to the design, plan and wiring guide. Under "Open", add: the Constellation glossary definitions (pslice, attestation, proposer, leader) were drafted from `baypeline/be` and should be confirmed by the Simulator owner.
- [ ] **Step 9:** Stop the local services (`scripts/run-local.sh stop`). Commit (if approved): `docs(frontend): Backend 연결 가이드와 배포 설정 추가`.

### Task 15: Final verification

- [ ] **Step 1:** `pnpm test && pnpm lint && pnpm exec tsc -b && pnpm build`. Expected: all pass, no lint warnings.
- [ ] **Step 2:** `pnpm dev` (Mock) in the browser: sign in → New case → case page → simulation (both tabs) → dashboard lists the case → export → clear site data → import → the case is back → reload keeps it.
- [ ] **Step 3:** Check at 375 px wide: no horizontal page scroll on login, dashboard, new case, case page, dialog.
- [ ] **Step 4:** With `prefers-reduced-motion: reduce` emulated, the dither loader is static.
- [ ] **Step 5:** Read every visible sentence on a sanctioned, a warn and a partial-sanctioned case: no contract code outside Audit and tooltips, every Solana term has a `?`.
- [ ] **Step 6:** Report results to Henry with what was checked and how; list anything not verified.
