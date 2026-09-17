# Plan: XLS-65/66 Lending & Default 데모 웹앱

- plan_id: plan-xls6566-20260911
- status: pending approval
- revision: r5 (Architect/Critic 4회차 리뷰 반영)
- source_spec: `.omc/specs/deep-interview-xls6566-lending-sim.md`
- target_dir: `/Users/jaemin/Developer/BAY/xls6566`
- **발표 예정일: `[미정 — 사용자 확인 필요]`**

### 일정 여유 계산
- 총 소요 예산 **4.5일** (P1b는 P1과 병렬이라 합산 제외): P0 0.5 + P1 1.0 + P2 0.5 + P3 0.5 + P4 1.0 + P5 0.5 + P6 0.5
- 여유 일수 = (착수일 ~ 발표 전일 영업일 수) − 4.5
- **여유 < 0일 때 덜어낼 항목(우선순위 순)**
  1. 중앙 스테이지 `offset-path` 칩 애니메이션 (이미 선택 항목)
  2. 단계 파라미터 편집 UI → 기본값 하드코딩 ※ **스펙의 UI 요구사항 축소, 사용자 승인 대상**
  3. 리셋 흐름 → 회차 전환 시 새로고침 허용 ※ **AC4 완화 필요, 사용자 승인 대상**
  4. 지갑 연동 → 전원 localKeypair 고정 ※ **AC3 삭제 필요, 사용자 승인 대상**
  5. 시나리오 A 제외, B만 시연 ※ **AC1 삭제 필요, 사용자 승인 대상**

---

## 1. RALPLAN-DR 요약

### Principles
1. **온체인 사실 우선**: 화면 수치는 `ledger_entry` 응답의 raw 값이다. 계산은 스크립트가 하고 화면은 표시만 한다.
2. **추측 금지**: 필드명·플래그·메서드·지갑 API 형태는 typings와 devnet 실제 응답으로만 확정한다. 미확인은 assert로 즉시 실패시킨다.
3. **경계 단일화**: 서명은 지갑, 제출·검증 대기·복구·정규화는 앱이 독점한다.
4. **하나의 엔진, 두 런타임**: 엔진은 Node 러너와 브라우저가 공유하고 차이는 주입되는 SignerProvider뿐이다.
5. **탐침을 위한 별도 tx를 만들지 않는다**: 지갑 지원 여부는 시나리오의 실제 단계에서 판정한다.

### Decision Drivers (top 3)
1. **프로토콜·지갑 API 불확실성**: 필드명, 플래그, default 성립 조건, 지갑 서명 API 반환 형태가 모두 미검증이다.
2. **타이밍이 UX를 규정**: 60s 주기/유예와 ledger close 대기, 그리고 사람의 조작 시간이 5분 예산을 지배한다.
3. **자금 규모 미확정**: faucet 지급액과 reserve가 스펙 수치(1000/500/50)의 성립 여부를 결정한다.

### Viable Options

| 옵션 | 개요 | 장점 | 단점 |
|---|---|---|---|
| **O1. 환경 실측 선행 + B 단독 spike + 셸 병렬 (선택)** | P0에서 환경을 assert로 실측하고, B만 먼저 devnet 검증하며 UI 셸을 병렬 진행 | 최대 리스크를 최단 경로로 제거하면서 진척 확보 | 인터페이스를 P0에 동결해야 병렬이 충돌하지 않음 |
| **O2. UI-first + mocked client** | 목업 먼저, 호출은 mock | 화면 진척이 빠름 | 가정 오류 시 상태 모델 재작업, 실 tx 검증이 끝으로 밀림 |
| **O3. Vertical slice per step** | 단계마다 tx+UI 동시 완성 | 항상 동작하는 데모 존재 | B의 default는 앞 단계 전부 필요, 리스크 잔존 |

### 선택: **O1**
근거: Driver 1·3은 실측으로만 해소된다. A는 B의 1~6단계를 공유하므로 B 단독 spike가 A까지 대부분 검증한다. 목업 14화면이 확정되어 UI 셸은 프로토콜과 무관하게 착수 가능하다.

---

## 2. 아키텍처

### 폴더 레이아웃
```
xls6566/
├─ index.html, vite.config.ts, tsconfig.json, package.json
├─ docs/{screens.md, interfaces-frozen.md, decisions.md, rehearsal-checklist.md}
├─ scripts/{probe-env.ts, run-scenario.ts, inspect-objects.ts}
└─ src/
   ├─ main.tsx, App.tsx
   ├─ xrpl/
   │  ├─ client.ts              # 단일 Client, ledgerClosed 앵커 발행
   │  ├─ faucet.ts              # 계정 생성/재사용, fallback 예금자 계정 조달, 지갑 자금 조달
   │  ├─ submit.ts              # 서명 요청·제출·검증대기·복구·정규화 (단일 관문)
   │  ├─ tx/{vault,loanBroker,loan}.ts
   │  └─ read/{vault,loanBroker,loan,account,shares,ids}.ts
   ├─ wallet/{types,crossmark,gemwallet,localKeypair,probe}.ts
   ├─ scenario/{types,engine,machine,countdown,scenarioA,scenarioB}.ts
   ├─ state/store.ts
   ├─ ui/{TopBar,StepRail,LedgerPanel,TxLog,RoleCards,ParamEditor}.tsx
   ├─ ui/stage/{FlowStage,flowPaths,Chip}.tsx
   ├─ ui/screens/{Landing,WalletProbe,WalletWait,Countdown,Result}.tsx
   └─ lib/{format,rippleTime}.ts
```

### 핵심 인터페이스 (P0에서 `docs/interfaces-frozen.md`로 동결)

```ts
// wallet/types.ts — 서명만 담당
export type SignerKind = 'crossmark' | 'gemwallet' | 'localKeypair';
export type SignOutcome =
  | { mode: 'blob'; txBlob: string; hash: string }       // 서명만 반환
  | { mode: 'submitted'; hash: string };                 // 지갑이 서명+제출까지 수행
export interface Signer {
  kind: SignerKind; address: string;
  /** autofill이 끝난 tx를 서명. 거부/미지원/30s 무응답 → SignRejectedError */
  sign(tx: Record<string, unknown>): Promise<SignOutcome>;
}
export interface SignerProvider {
  for(role: Role): Signer;
  /** 예금자 서명 실패 시 1회에 한해 강등. 서명자와 ScenarioCtx.accounts.depositor를
   *  setup에서 미리 조달해 둔 fallback localKeypair 계정으로 **동시에** 전환한다.
   *  동결 후 호출하면 예외를 던진다 */
  downgradeDepositorOnce(ctx: ScenarioCtx): void;
  freeze(): void;
  isFrozen(): boolean;
}

// xrpl/submit.ts — 두 경로의 유일한 관문
export interface TxResult {
  hash: string; engineResult: string; validated: boolean;
  ledgerIndex: number; sequence: number; lastLedgerSequence: number;
  explorerUrl: string | null; meta: unknown;
}
export function submit(tx, signer, onState: (s: StepState) => void): Promise<TxResult>;
```

**submit 정책**
1. `autofill` → `signer.sign` (상태 `Signing`)
2. `mode: 'blob'` 이면 앱이 제출한다. `mode: 'submitted'` 이면 지갑이 이미 제출했으므로 앱은 제출하지 않는다.
3. **`mode: 'submitted'` 보정 단계**: 반환된 hash로 `tx`를 조회해 **실제 `Sequence`와 `LastLedgerSequence`를 읽어 앱 상태를 갱신한다**(지갑이 자체 autofill을 했을 수 있으므로 앱이 만든 값과 다를 수 있다). 이 갱신된 값을 기준으로만 이후 복구를 판정한다. 조회가 아직 비어 있으면 짧게 재시도한다.
4. 검증 대기(상태 `Confirming`)가 만료되면 갱신된 `LastLedgerSequence` 경과를 판정하고 `tx`로 재조회한다. validated면 성공 처리한다.
5. 미발견 + 시퀀스 경과면 **기존 blob을 재제출하지 않는다**. `LastLedgerSequence`는 서명 대상 필드이므로 **재autofill → 재서명 → 신규 제출**이 유일한 경로다. 지갑 경로에서는 **팝업이 다시 뜬다**. 상태를 `Resigning`으로 올리고 WalletWait 화면에 "지갑 승인 창이 다시 열립니다"를 표시한다.
6. 재서명을 거부하면 `Failed`가 되고 `recover` 버튼(재시도 / 대체 단계)을 노출한다. 자동 재시도는 하지 않는다.

```ts
// scenario/types.ts
export type Role = 'depositor' | 'broker' | 'borrower';
export type StepState =
  | 'Pending' | 'Gated' | 'Signing' | 'Confirming'
  | 'Resigning' | 'Succeeded' | 'Failed';
export type EngineState = 'Landing' | 'Ready' | 'Running' | 'Done';
export interface ScenarioCtx {
  client: XrplClient; signers: SignerProvider;
  accounts: Record<Role, string>;
  params: ScenarioParams;
  ids: { vault?: string; loanBroker?: string; loan?: string };
  /** 강등 시 depositor 주소가 fallback 계정으로 교체될 수 있다 */
  fallbackDepositor: { address: string; seed: string };
  snapshot: LedgerSnapshot | null;   // 각 단계 after 훅 직후 엔진이 재조회해 갱신
  log(entry: TxLogEntry): void;
}
export interface StepDef {
  id: string; label: string; description: string; signer: Role;
  state: StepState; flowPath?: FlowPathId;
  build(ctx: ScenarioCtx): Promise<Record<string, unknown>>;
  after?(ctx: ScenarioCtx, r: TxResult): Promise<void>;   // ids 추출, 서명자 동결 등
  gate?(ctx: ScenarioCtx): { locked: boolean; unlockAtRipple?: number };
  expect?(s: LedgerSnapshot): string | null;              // 위반 문구 → tx 로그 warn 행
  recover?: StepDef[];
}

// scenario/countdown.ts — 게이트/표시 분리
export function gateUnlocked(unlockAtRipple: number, validatedCloseTime: number): boolean;
export function displayRemaining(anchor: { rippleTime: number; perfNow: number }, unlockAtRipple: number): number;

// xrpl/read — ledger_entry 단일 원천 (vault_info는 있으면 부가 표시용)
export interface LedgerSnapshot {
  fetchedAtLedger: number;
  vault: Record<string, unknown> | null;
  loanBroker: Record<string, unknown> | null;
  loan: Record<string, unknown> | null;
  xrpBalances: Record<Role, string>;    // drops 원본
  shareBalances: Record<Role, string>;  // Vault share MPToken 잔액
}
export function extractVaultId(meta: unknown): string;       // read/ids.ts
export function extractLoanBrokerId(meta: unknown): string;
export function extractLoanId(meta: unknown): string;
```

### 지갑 판정 절차 (별도 탐침 tx 없음)
- **setup 선행 조건**: 계정 준비 단계에서 Broker·Borrower·(지갑 미사용 시 Depositor)에 더해 **fallback 예금자 localKeypair 계정을 faucet으로 미리 생성·조달**한다. 조달액은 정규 예치액 + account reserve + share MPToken reserve + 수수료 여유를 감당해야 한다. 브라우저 실행은 최대 4계정, Node 러너는 강등 경로가 없으므로 3계정이다.
- **탐침 1 (자금 불필요, P1b)**: 확장 존재 여부, 네트워크(devnet) 일치, 계정 주소 조회. 실패하면 즉시 localKeypair로 확정하고 동결한다. setup에서 fallback 예금자 계정 조달(4번째 faucet 호출)이 실패하면 강등 경로가 없어지므로, 이 경우에도 지갑 사용을 포기하고 localKeypair(Depositor 계정 직접 조달)로 확정한다.
- **예치 단계 통합 판정 (A3/B3)**: 탐침 1을 통과했으면 예금자 서명자는 지갑 상태로 A3/B3 `VaultDeposit`에 진입한다. 예치 금액은 **항상 P0 재스케일로 확정된 정규 예치액**이며 별도의 최소 금액 예치는 없다.
  - 서명 성공 → 예치가 `Succeeded`가 된 **직후 서명자를 동결**한다.
  - 서명 실패(거절 / 미지원 / 30s 무응답) → `downgradeDepositorOnce(ctx)`가 **서명자와 `ctx.accounts.depositor`를 fallback 계정으로 동시에 전환**하고 같은 단계를 재실행한다. 성공하면 그 직후 동결한다. 강등 후에도 실패하면 `Failed` + `recover`.
  - 강등 시 RoleCards의 예금자 카드는 **주소가 바뀐 사실**과 **"AUTO · fallback" 배지**를 함께 표시한다. tx 로그에도 전환 행을 남긴다.
- 동결 이후에는 VaultWithdraw를 포함한 모든 예금자 tx가 같은 계정·같은 서명자를 쓴다. shares 귀속 계정과 출금 서명자가 어긋나는 상황이 원천적으로 생기지 않는다.
- **LedgerSnapshot 갱신 주체**: 각 단계의 `after` 훅이 끝난 직후 엔진이 `ledger_entry`를 재조회해 `ctx.snapshot`을 교체한다. 개별 단계나 UI가 직접 갱신하지 않는다.

---

## 3. 작업 분해

### P0. 스캐폴드 + 환경 실측 — 0.5일
- 생성: 빌드 스캐폴드, `scripts/probe-env.ts`, `scripts/inspect-objects.ts`, `docs/interfaces-frozen.md`, `docs/decisions.md`
- `probe-env.ts` 측정·assert 항목 (하나라도 실패하면 종료 코드 1)
  1. `xrpl` typings에 `signLoanSetByCounterparty`, `combineLoanSetCounterpartySigners` export 존재
  2. 플래그 상수 `tfLoanDefault` / `tfLoanImpair` / `tfLoanFullPayment` / `tfLoanLatePayment` 존재 여부 (개별 리포트. `tfLoanLatePayment` 부재는 경고로 처리하고 A7 대체 경로를 활성화)
  3. **amendment 판정**: Amendments ledger entry 조회를 **1차이자 단독 합격 조건**으로 한다. `feature` 메서드는 보조이며 admin 거부 시 무시한다. 실효 판정은 **의도적으로 malformed한 VaultCreate**를 1건 제출해 `temDISABLED`(amendment 미활성)인지 `temMALFORMED`(활성이나 필드 오류)인지로 구분한다. 두 코드의 우선순위가 불명확하면 이 실효 판정은 참고 정보로만 남기고 **Amendments ledger entry 판정만으로 합격 처리**한다. amendment 이름 문자열도 실측 확정 대상이다.
  4. faucet 실지급액(계정당 XRP), 지갑 자금 조달 경로(faucet destination 지원 여부 / 앱 계정 Payment)
  5. **P0 측정**: 계정 base reserve, MPToken owner reserve 증분. Vault·LoanBroker·Loan owner reserve 증분은 **P1 spike에서 측정**하며 P0 시점에는 각 2 XRP로 보수적 상한 가정 후 P1에서 갱신한다.
  6. `ledgerClosed` 스트림의 시각 필드명
  7. `vault_info` 메서드 존재 여부
  8. **지갑 서명 API 형태**: Crossmark / GemWallet이 blob을 반환하는지, 서명+제출을 수행하는지 → `SignOutcome` 갈래 확정
  9. **ledger close 실측 간격**: 연속 close 이벤트 10회의 평균·최대 간격 (시간 예산 산정 입력)
- **재스케일 공식**: 가용액 = faucet 지급액 − base reserve − 예상 owner reserve 합 − 수수료 여유. 아래 두 부등식을 만족시키고 `probe-env` 출력에서 검산한다.
  - (i) LoanSet 성립: `cover ≥ (DebtTotal + Principal + InterestDue) × CoverRateMinimum`
  - (ii) B에서 VaultLoss 발생: `min(cover, MinimumCover × CoverRateLiquidation) < DefaultAmount`
- 수용 체크: `npm run build` 성공. `probe-env.ts` 종료 코드 0, 측정값이 `.omc/artifacts/probe-env.json`에 기록, 두 부등식 검산 결과가 출력에 표기. `docs/interfaces-frozen.md`에 `Signer`/`SignerProvider`/`SignOutcome`/`TxResult`/`submit` 시그니처 확정 기재.

### P1. 시나리오 B 단독 spike — 1.0일 (병렬: P1b)
- 생성: `scripts/run-scenario.ts`, `src/xrpl/*` 초안, `src/scenario/*` 초안
- B를 devnet에서 완주: 계정 3개(Node 러너는 강등 경로 없음) → VaultCreate → VaultDeposit → LoanBrokerSet → CoverDeposit → LoanSet(상호서명) → Impair → 카운트다운 → Default → VaultWithdraw
- 확정 대상: tx 필수 필드, ID 추출 경로, default 성립 시각 공식, impair의 NextPaymentDueDate 이동 여부, share MPToken 잔액 조회, Vault/LoanBroker/Loan owner reserve 증분, explorer 링크 동작
- 미확인 항목은 `assert`로 즉시 실패시킨다
- A는 1~6단계를 공유하므로 spike 성공 후 A7/A8만 추가 검증한다
- **A7 대체 복구 경로**: `tfLoanLatePayment` 부재 시 (a) A 한정 PaymentInterval 상향(예: 600s)으로 만료 회피, (b) 보조로 A6 검증 직후 A7 자동 연속 제출
- **AC1 판정 기준을 P1 종료 시점에 하나로 확정하고 이후 변경하지 않는다.** 확정 내용은 `docs/decisions.md`에 기록한다. 기준 B(share 상환 가치)를 쓰는 경우 **계산은 P1 스크립트가 수행해 문서에 수치를 남기고, 앱 화면은 `ledger_entry` raw 값만 표시한다.**
- 수용 체크: B가 default `tesSUCCESS`로 완주, `AssetsTotal` 감소가 raw 로그에 기록. AC1 기준이 `docs/decisions.md`에 확정 기재. 산출물이 `.omc/artifacts/`에 저장

### P1b. UI 셸 + 탐침 1 (P1과 병렬) — 0.5일
- 생성: `docs/screens.md`, `src/ui/{TopBar,StepRail,LedgerPanel,TxLog,RoleCards}.tsx`, `src/ui/screens/{Landing,WalletProbe}.tsx`, `src/wallet/*`
- 자금이 필요한 서명 판정은 여기서 하지 않는다(A3/B3 예치 단계로 통합)
- 수용 체크: 더미 데이터로 4영역이 렌더되고, 확장 유/무 두 프로필에서 탐침 1이 정상 판정한다

### P2. 클라이언트 레이어 확정 — 0.5일
- 생성/정리: `src/xrpl/submit.ts`, `client.ts`, `faucet.ts`, `tx/*`, `read/*`
- 수용 체크: `LastLedgerSequence`를 짧게 준 tx에서 재autofill·재서명 경로가 동작하고 기존 blob 재제출이 없다. `mode: 'submitted'`를 흉내낸 모의 signer에서 **`tx` 조회로 Sequence/LastLedgerSequence를 갱신한 뒤** 복구 판정이 이루어진다. 리팩터 후 `run-scenario.ts --scenario B`가 P1과 동일 결과. `npm run build` 성공

### P3. 엔진 + 상태 — 0.5일
- 생성: `src/scenario/*`, `src/state/store.ts`
- 수용 체크: 상태 머신·카운트다운 단위 테스트 통과. Node SignerProvider로 A/B 전 단계가 UI 없이 실행. 강등 1회 후 동결 규칙이 테스트로 검증됨

### P4. UI 완성 — 1.0일
- 생성: `src/ui/stage/*`, `ui/ParamEditor.tsx`, `ui/screens/{WalletWait,Countdown,Result}.tsx`
- 필수: 4영역 정적 렌더, 역할 카드의 XRP·share 잔액, 파라미터 편집 UI, 리셋 흐름, `recover` 버튼, `expect` 위반 경고 행, **WalletWait 화면이 `Signing`/`Resigning`을 구분 표시**, **강등 시 예금자 카드의 주소 변경 + "AUTO · fallback" 배지**
- **Result 화면(A/B)**: "예치 원금"과 "상환 가치" 두 행을 나란히 표시한다. 두 값 모두 `ledger_entry` raw 값이며 앱은 재계산하지 않는다. AC1 기준 B를 화면에서 직접 비교할 수 있게 한다
- 선택: 중앙 스테이지 `offset-path` 칩 애니메이션 (미구현이어도 합격)
- **리셋 정의**: 앱 상태 초기화 + 새 Vault/LoanBroker/Loan 생성. 계정은 재사용하고(브라우저 4개, Node 3개), 잔액이 다음 회차 요구액에 미달할 때만 faucet을 재호출한다. 리셋은 예금자 서명자 동결도 초기화한다. 즉 두 번째 회차도 탐침 1 → 예치 통합 판정 → 1회 강등 규칙을 처음부터 다시 탄다
- 수용 체크(합불): `docs/screens.md` 14개 항목이 모두 체크되고 각 화면이 실제 컴포넌트에 대응됨. **localKeypair 경로 한정으로** 리셋 후 연속 2회 완주하며 faucet 재호출은 잔액 부족 시에만 발생 (지갑 경로 완주 검증은 P5/P6)

### P5. 지갑 연동 마감 — 0.5일
- 생성/보강: `src/wallet/{crossmark,gemwallet}.ts`, 예치 단계 통합 판정 및 1회 강등 로직
- 수용 체크(합불): 확장 없는 프로필에서 A·B 완주 + fallback 배지. 확장 있는 프로필에서 A3 예치 서명 결과(blob형 / 제출형 / 미지원→강등)가 로그로 남고 어느 쪽이든 완주

### P6. 검증 + 리허설 — 0.5일
- 생성: `docs/rehearsal-checklist.md`, `src/**/__tests__/*`
- 수용 체크: 6절 인수 기준 전부 통과. **지갑 경로에서 리셋 후 연속 2회 완주**가 별도로 확인됨

---

## 4. 리스크 & 완화

| # | 리스크 | 담당 페이즈 | 완화 |
|---|---|---|---|
| R1 | 필드명/플래그 추측 오류 | P0/P1 | typings·devnet 응답으로만 확정, 미확인은 assert 실패 |
| R2 | devnet amendment 비활성 또는 리셋 **/ devnet이 라이브러리보다 앞서감** | P0/P6 | Amendments ledger entry 단독 합격 판정 + malformed VaultCreate 참고 판정, 상단 바 표시. **발표 D-1까지 미해결이면 성공 리허설 녹화본을 백업 자료로 확정** |
| R3 | faucet 지급액 부족 / rate limit | P0/P4 | P0 실측 후 재스케일. 브라우저는 fallback 예금자를 포함해 **회차당 최대 4계정**을 조달하므로 rate limit 여유가 그만큼 줄어든다. 계정 4개를 세션 내 재사용하고 잔액 부족 시에만 재호출한다 |
| R4 | 지갑이 신규 tx type 미지원 | P1b/P5 | 탐침 1 + 예치 단계 통합 판정, 실패 시 1회 강등 후 동결 |
| R5 | 브라우저 시계 오차 | P3 | 게이트는 검증된 close time, 표시는 원장 앵커 + `performance.now` 보간 |
| R6 | A7 만료 / `tfLoanLatePayment` 부재 | P1 | A 한정 PaymentInterval 상향 + A6→A7 자동 연속 제출 |
| R7 | impair가 due date를 당김 | ~~P1~~ **종결** | **전제가 틀렸다.** `fixCleanup3_4_0`이 활성이라 impair는 due date를 움직이지 않고, 연체된 대출만 impair할 수 있다 (`docs/decisions.md` D11) |
| R8 | explorer가 Vault/Loan tx 미표시 | P1 | 확인 전까지 `explorerUrl = null`, 앱 내 raw 패널이 1차 증명 |
| R9 | default 공식의 CoverAvailable 상한 불확실 | ~~P1~~ **종결** | 실측이 `DefaultCovered = min(DebtTotal x CoverRateMin x CoverRateLiq, DefaultAmount, CoverAvailable)`와 정확히 일치 (D12). 앱은 계속 온체인 값만 표시 |
| R10 | 검증 대기 만료 후 결과 미확정 | P2 | `tx` 조회로 시퀀스 갱신 → 재autofill·재서명 신규 제출, 거부 시 `recover` |
| R11 | share reserve가 예금자 순증을 잠식 | ~~P1~~ **종결** | share MPToken reserve는 전량 상환 시 회수되므로 비용이 아니다. AC1은 기준 A로 확정 (D15). 다만 이자가 drops 단위라 화면은 drops 정수로 표시해야 한다 |
| R12 | 사람 조작 시간 포함 시 5분 초과 | P4/P6 | 아래 **개정된** 예산표 참조. 실측 약 4분, 여유 약 1분. 시간의 80%가 프로토콜 강제 대기이므로 **단계 묶기는 효과가 없다** |

### R12 시간 예산 — **P1 devnet 실측으로 전면 개정 (2026-09-11)**

> 개정 사유: devnet rippled에 `LendingProtocolV1_1`과 `fixCleanup3_4_0`이 활성이라
> (1) Vault가 closed-ended여야 하고 Subscription / Investment / Redemption 3위상을 가지며,
> (2) impair가 `NextPaymentDueDate`를 앞당기지 못한다.
> 근거는 `docs/decisions.md` D9·D11. 아래 수치는 `.omc/artifacts/run-{A,B}.json`의 `stepTimings`다.

**시간을 지배하는 것은 사람의 조작이 아니라 프로토콜이 강제하는 대기다.**

| 구간 | 성격 | 실측 |
|---|---|---|
| faucet setup (계정 3개 신규) | 가변, 재사용 시 0 | 약 15s |
| Subscription 창 (`subscriptionLeadSeconds`) | 설정값 | 45s |
| VaultCreate → CoverDeposit 4건 | tx 검증 | 약 23s (창 안에서 소진) |
| Investment 개시 대기 (LoanSet 게이트) | **프로토콜 강제** | 14~26s |
| LoanSet | tx 검증 | 약 8s |
| B: 연체 대기 (`PaymentInterval`) | **프로토콜 강제** | 68s |
| B: 유예 대기 (`GracePeriod`) | **프로토콜 강제** | 52s |
| A: LoanPay | tx 검증 | 약 6s |
| Redemption 개시 대기 (VaultWithdraw 게이트) | **프로토콜 강제** | B 38s / A 164s |
| VaultWithdraw | tx 검증 | 약 8s |
| **B 실측 합계** | | **239s (3분 59초)** |
| **A 실측 합계** | | **241s (4분 1초)** |
| **AC4(5분) 대비 여유** | | **약 59초** |

**하한**: `subscriptionLeadSeconds + investmentPeriodSeconds` = 45 + 180 = **225초**.
`investmentPeriodSeconds`의 180초는 rippled 상수 `kMinInvestmentPeriod`이므로 **더 줄일 수 없다**.

**여유가 부족할 때 줄일 수 있는 것 (우선순위 순)**
1. `subscriptionLeadSeconds` 45 → 30 (예치까지 4건이 약 23초이므로 30초면 충분하다). **-15초**
2. faucet 계정 재사용 보장(리허설 전 미리 조달). **-15초**
3. 단계 묶기(계정 setup + VaultCreate 등)는 **효과가 거의 없다.** 총 시간의 80%가 대기이고
   tx 검증은 건당 약 2초에 불과하다. 기존 R12의 묶기 전략은 폐기한다.

**UI 요구사항 변경**: 카운트다운이 1개(부도 대기)에서 **3개**로 늘었다.
"예치 마감까지"(SubscriptionDate), "대출 개시까지"(SubscriptionDate+1),
"출금 개시까지"(RedemptionDate). 각각 `gateUnlocked` / `displayRemaining`을 그대로 쓴다.

## 5. 테스트 계획

### Unit (Vitest)
- `lib/rippleTime.ts`: ripple epoch ↔ unix 경계값
- `scenario/countdown.ts`: `gateUnlocked`(경계·미검증 시각), `displayRemaining`(앵커 보간, 음수·0)
- `scenario/machine.ts`: StepState 전이표. 특히 `Signing → Confirming → Resigning → Failed → recover`
- `wallet` 강등 규칙: 예치 실패 시 1회 강등 시 서명자와 `accounts.depositor`가 함께 바뀌는지, 동결 후 재강등 시 예외
- `xrpl/tx/*`: 빌더 반환 tx 스냅샷(필드 누락 회귀 방지)
- `xrpl/read/ids.ts`: meta 픽스처에서 ID 3종 추출
- `xrpl/submit.ts`: blob형/제출형 signer 각각, 제출형의 시퀀스 갱신, 만료 후 재서명, 기존 blob 재제출 없음

### Integration (devnet, 수동 트리거)
- `npx tsx scripts/probe-env.ts` → 종료 코드 0, 두 부등식 검산 통과, close 간격 기록
- `npx tsx scripts/run-scenario.ts --scenario B` → default `tesSUCCESS`, `AssetsTotal` 감소, 출금액 < 예치액
- `--scenario A` → 전 단계 `tesSUCCESS`, AC1 판정값 출력
- raw 출력을 `.omc/artifacts/`에 보존해 회귀 비교

### E2E (수동 리허설 체크리스트)
1. devnet 연결 + amendment 판정 배지
2. 탐침 1 결과, A3 예치 시 서명자 동결, 강등 시 예금자 주소 변경 표시 확인
3. 시나리오 A 완주, 단계별 hash, AC1 판정
4. 리셋 후 B 완주: impair 시 `LossUnrealized`, 카운트다운, default, `AssetsTotal` 감소, 출금액 < 예치액
5. 확장 비활성 프로필 fallback 배지, 확장 있는 프로필 강등 경로
6. 새로고침 없음, AC4 구간 스톱워치 측정

---

## 6. 인수 기준

| # | 기준 | 측정 방법 |
|---|---|---|
| AC1 | 시나리오 A 8단계 전부 `tesSUCCESS`이고 예금자 이득이 성립한다 | **판정 기준은 P1 종료 시점에 아래 둘 중 하나로 확정해 `docs/decisions.md`에 기록하고 이후 변경하지 않는다.** P1에서 이자 실수령액·tx 수수료 합·share reserve 증감을 측정해 (기준 A) 예금자 XRP 잔액 순증이 성립하면 채택한다. 불성립이면 InterestRate 상향·기간 조정으로 1회 재시도하고, 그래도 불성립이면 (기준 B) **share 상환 가치 > 예치 원금**을 채택한다. 기준 B의 계산은 P1 스크립트가 수행하며 **앱 화면은 raw 값만 표시하고 수수료·reserve를 별도 행으로 명시**한다 |
| AC2 | 시나리오 B에서 `LoanManage(tfLoanDefault)`가 `tesSUCCESS`, Vault `AssetsTotal`이 default 직전보다 감소, VaultWithdraw 수령액 < 예치액 | default 전후 `ledger_entry` 스냅샷 비교 |
| AC3 | ~~지갑이 부재하거나 예치 서명에 실패하면 1회 강등으로 localKeypair 완주하고 "fallback 자동서명" 배지가 표시된다~~ | **삭제됨 (D20)** — 확장이 XLS-65/66 트랜잭션 타입을 인코딩하지 못해 지갑 경로 자체를 제거했다 |
| AC4 | 새로고침 없이 완주하고 **시나리오 시작 버튼 클릭부터 Result 화면의 최종 잔액 표시까지** 5분 이내 (사람 조작 시간 포함, R12 예산표 기준) | 리허설 스톱워치 |
| AC5 | `xrpl` ≥ 5.1.0, `npm run build` 성공 | `npm ls xrpl`, 빌드 로그 |

---

## 7. ADR: 지갑 지원 판정을 실제 예치 단계에 통합한다

- **Decision**: (1) P0에서 환경을 assert로 실측하고 금액을 재스케일한다. (2) B를 단독 spike로 먼저 검증하고 UI 셸·탐침 1을 병렬 진행한다. (3) 엔진은 SignerProvider를 주입받아 Node·브라우저가 공유한다. (4) 제출·검증·복구는 `submit.ts`가 독점하고 만료 복구는 재서명으로만 한다. (5) **자금이 필요한 지갑 판정을 위한 별도 tx를 만들지 않고, A3/B3 정규 예치에 통합해 성공 직후 서명자를 동결하며 실패 시 1회만 강등한다.**
- **Drivers**: 신규 amendment API 미검증, 사람 조작을 포함한 5분 예산, faucet 지급액 제약.
- **Alternatives**: 별도 탐침 tx(예치 이전 동결과 순환하고 최소 금액 예치가 재스케일·AC 기준을 깨뜨림), UI-first + mocked client, vertical slice, 지갑에 제출까지 위임.
- **Why chosen**: 탐침을 정규 단계에 통합하면 판정 tx가 곧 시나리오의 일부가 되어 추가 자금·추가 시간·기준 왜곡이 모두 사라진다. 1회 강등 규칙이 "동결"의 취지를 지키면서 발표 중단을 막는다.
- **Consequences**: 초반 반나절은 시각 산출물이 제한된다. 인터페이스를 P0에 동결해야 병렬 작업이 충돌하지 않는다. 예치 단계가 지갑 판정을 겸하므로 이 단계의 실패 처리 테스트가 중요해진다. 만료 복구가 팝업을 다시 띄우므로 리허설에 재승인 시나리오를 포함한다.
- **Follow-ups**: (a) 발표 예정일 확인 후 여유 일수 산출 및 축소 항목 결정, (b) P0 결과로 금액 기본값·amendment 이름·close 간격 반영, (c) P1 종료 시 AC1 기준을 `docs/decisions.md`에 확정, (d) explorer 링크 동작으로 `explorerUrl` 정책 확정, (e) R2 백업 녹화 판단은 발표 D-1.
