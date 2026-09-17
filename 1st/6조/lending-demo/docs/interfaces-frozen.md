# 동결 인터페이스 (P0)

- 상태: **동결됨**
- 근거: `.omc/plans/xls6566-lending-demo.md` 2절, `.omc/artifacts/probe-env.json`
- 측정 시각: 2026-09-11, devnet `wss://s.devnet.rippletest.net:51233` (rippled 3.4.0-rc3, networkID 2)

이 문서는 P1(시나리오 spike)과 P1b(UI 셸)가 **동시에** 작업해도 충돌하지 않도록 경계를 고정한다.
아래 시그니처를 바꾸려면 먼저 이 문서를 고치고 양쪽 담당자에게 알린다.

---

## 0. P0 실측이 인터페이스에 미친 영향

| 항목 | 계획서 가정 | P0 실측 | 인터페이스 반영 |
|---|---|---|---|
| `signLoanSetByCounterparty` | 이름 미확인 | `xrpl` 루트에서 export, `function` | 그대로 사용 |
| `combineLoanSetCounterpartySigners` | 이름 미확인 | `xrpl` 루트에서 export, `function` | 그대로 사용 |
| LoanManage 플래그 | 이름 미확인 | `LoanManageFlags.{tfLoanDefault=65536, tfLoanImpair=131072, tfLoanUnimpair=262144}` | 상수 직접 사용 |
| LoanPay 플래그 | `tfLoanLatePayment` 부재 우려 | `LoanPayFlags.{tfLoanOverpayment=65536, tfLoanFullPayment=131072, tfLoanLatePayment=262144}` 모두 존재 | **A7 대체 경로 불필요** |
| ID 추출 | `extractVaultId(meta)` 등 meta 파싱 | `hashes.hashVault(account, seq)`, `hashes.hashLoanBroker(account, seq)`, `hashes.hashLoan(loanBrokerId, loanSeq)` 존재 | 결정론적 파생을 1차, meta 파싱을 교차검증으로 |
| close time 필드 | 미확인 | `ledgerClosed` 스트림의 `ledger_time` (ripple 초) | `LedgerAnchor.ledgerTime` |
| `vault_info` | 존재 여부 미확인 | 존재 (더미 id에 `entryNotFound` 응답) | 부가 표시용으로만 허용 |
| client 주입 | `submit(tx, signer, onState)` | 클라이언트에 닿을 경로가 없음 | **`submit(tx, signer, onState, opts)`로 확장** |

측정 원본은 `.omc/artifacts/probe-env.json`에 있다.

---

## 1. `src/wallet/types.ts` — 서명만 담당

```ts
export type SignerKind = 'crossmark' | 'gemwallet' | 'localKeypair';

export type SignOutcome =
  | { mode: 'blob'; txBlob: string; hash: string }   // 지갑이 서명만 반환 → 앱이 제출
  | { mode: 'submitted'; hash: string };             // 지갑이 서명+제출까지 수행

export interface Signer {
  kind: SignerKind;
  address: string;
  /** autofill이 끝난 tx를 서명. 거부 / 미지원 / 30s 무응답 → SignRejectedError */
  sign(tx: Record<string, unknown>): Promise<SignOutcome>;
}

export interface SignerProvider {
  for(role: Role): Signer;
  /** 예금자 서명 실패 시 1회 한정 강등. 서명자와 ctx.accounts.depositor를 fallback
   *  localKeypair 계정으로 **동시에** 전환한다. 동결 후 또는 2회째 호출 시 예외 */
  downgradeDepositorOnce(ctx: ScenarioCtx): void;
  freeze(): void;
  isFrozen(): boolean;
}

export class SignRejectedError extends Error {
  readonly kind: SignerKind;
  readonly reason: 'rejected' | 'unsupported' | 'timeout' | 'unavailable';
}
```

**계획서 대비 변경**: `SignRejectedError`가 주석이 아니라 구체 클래스로 존재한다. `reason`으로
"확장 없음(`unavailable`)"과 "사용자 거부(`rejected`)"를 구분해 RoleCards 배지 문구를 나눈다.

`Role`은 `src/scenario/types.ts`에 산다. `wallet/types.ts`는 타입만 역참조하므로
순환 import는 타입 단계에서 소거된다.

---

## 2. `src/xrpl/submit.ts` — 두 경로의 유일한 관문

```ts
export interface TxResult {
  hash: string;
  engineResult: string;      // 검증 후에는 meta.TransactionResult, 그 전에는 제출 시 engine_result
  validated: boolean;
  ledgerIndex: number;
  sequence: number;
  lastLedgerSequence: number;
  explorerUrl: string | null;
  meta: unknown;
}

export interface SubmitOptions {
  client: Client;
  explorerTxUrl?: (hash: string) => string | null;  // 기본 () => null (R8)
  pollIntervalMs?: number;                          // 기본 1000
  maxWaitMs?: number;                               // 기본 120000
  onNotice?: (message: string) => void;             // 비치명적 진단
}

export function submit(
  tx: Record<string, unknown>,
  signer: Signer,
  onState: (state: StepState) => void,
  opts: SubmitOptions,
): Promise<TxResult>;

export class TxSubmitError extends Error { engineResult: string; hash: string | null }
export class TxExpiredError extends Error { hash: string; lastLedgerSequence: number }
export class TxTimeoutError extends Error { hash: string }
```

**계획서 대비 변경 (필수)**: 4번째 인자 `SubmitOptions`가 추가됐다. 계획서의 3인자 시그니처로는
`Client`에 닿을 방법이 없다. 싱글턴을 모듈 내부에서 import하지 않고 주입받는 이유는, Node 러너와
브라우저가 같은 엔진을 쓰되 테스트에서 모의 client를 넣을 수 있어야 하기 때문이다.

### submit 정책 (구현 완료, localKeypair 경로 실동작)

1. `onState('Signing')` → `client.autofill(tx)` → `signer.sign(prepared)`
2. `mode: 'blob'` → 앱이 `submit` 명령으로 제출. engine result가 `tem` / `tef` / `tel`로
   시작하면 원장에 닿지 않은 것이므로 즉시 `TxSubmitError`. `ter` / `tes` / `tec`는 대기로 넘어간다.
3. `mode: 'submitted'` → 앱은 제출하지 않는다. 대신 **hash로 `tx`를 조회해 실제 `Sequence`와
   `LastLedgerSequence`를 읽어 갱신한다** (지갑이 자체 autofill을 했을 수 있다). 최대 10초 동안
   500ms 간격으로 재조회하고, 끝내 보이지 않으면 앱이 만든 값을 보수적 하한으로 쓰고 `onNotice`로 알린다.
4. `onState('Confirming')` → 1초 간격으로 `tx` 조회. `validated`면 성공.
5. 현재 원장 인덱스가 갱신된 `LastLedgerSequence`를 넘기면 **만료**로 판정한다.
   기존 blob을 재제출하지 않는다. `LastLedgerSequence`는 서명 대상 필드이므로
   **재autofill → 재서명 → 신규 제출**이 유일한 경로다. `onState('Resigning')`을 올린다.
6. 재서명 후에도 만료되면 `TxExpiredError`. 단계는 `Failed`가 되고 `recover`를 노출한다. 자동 재시도는 없다.
7. `maxWaitMs`를 넘겼는데 만료도 아니면 `TxTimeoutError`를 던진다. 이 경우 **재서명하지 않는다**
   (같은 Sequence로 두 번 서명하면 충돌한다).

`api_version` 1과 2의 `tx` 응답 형태(`tx_json` 중첩 여부)를 모두 방어적으로 읽는다.

---

## 3. `src/scenario/types.ts` — 엔진 계약

```ts
export type Role = 'depositor' | 'broker' | 'borrower';

export type StepState =
  | 'Pending' | 'Gated' | 'Signing' | 'Confirming'
  | 'Resigning' | 'Succeeded' | 'Failed';

export type EngineState = 'Landing' | 'Ready' | 'Running' | 'Done';

/** P4에서 리터럴 유니온으로 좁힌다. 엔진은 이 값을 역참조하지 않는다. */
export type FlowPathId = string;

export interface ScenarioParams {
  depositDrops: string;        // VaultDeposit 금액, drops 문자열
  principalDrops: string;      // LoanSet PrincipalRequested
  coverDrops: string;          // LoanBrokerCoverDeposit 금액
  coverRateMinimum: number;    // rippled 스케일 (100_000 == 100% (1/10 bp, D7))
  coverRateLiquidation: number;
  interestRate: number;
  paymentInterval: number;     // 초
  gracePeriod: number;         // 초
  paymentTotal: number;
}

export interface TxLogEntry {
  at: number;                  // unix ms, 클라이언트 시계. 표시 전용
  level: 'info' | 'warn' | 'error';
  stepId: string;
  message: string;
  hash?: string;
  explorerUrl?: string | null;
  raw?: unknown;               // rippled 원본 페이로드를 그대로 보관
}

export interface LedgerSnapshot {
  fetchedAtLedger: number;
  vault: Record<string, unknown> | null;
  loanBroker: Record<string, unknown> | null;
  loan: Record<string, unknown> | null;
  xrpBalances: Record<Role, string>;    // drops 원본
  shareBalances: Record<Role, string>;  // Vault share MPToken 잔액
}

export interface ScenarioCtx {
  client: Client;
  signers: SignerProvider;
  accounts: Record<Role, string>;
  params: ScenarioParams;
  ids: { vault?: string; loanBroker?: string; loan?: string };
  fallbackDepositor: { address: string; seed: string };
  snapshot: LedgerSnapshot | null;   // 각 단계 after 훅 직후 엔진이 교체
  log(entry: TxLogEntry): void;
}

export interface StepGate {
  locked: boolean;
  unlockAtRipple?: number;     // ripple 초. 검증된 close time과 비교한다
}

export interface StepDef {
  id: string;
  label: string;
  description: string;
  signer: Role;
  state: StepState;
  flowPath?: FlowPathId;
  build(ctx: ScenarioCtx): Promise<Record<string, unknown>>;
  after?(ctx: ScenarioCtx, result: TxResult): Promise<void>;
  gate?(ctx: ScenarioCtx): StepGate;
  expect?(snapshot: LedgerSnapshot): string | null;
  recover?: StepDef[];
}
```

**계획서 대비 변경**
- `XrplClient` → `Client` (xrpl.js의 실제 export 이름).
- `gate`의 반환 타입에 `StepGate`라는 이름을 붙였다. 내용은 동일하다.
- `ScenarioParams`의 필드를 구체화했다. 금액은 **drops 문자열**이고 앱은 이 값을 재계산하지 않는다.
- `TxLogEntry`를 명세했다. 계획서에는 이름만 있었다.

---

## 4. `src/xrpl/client.ts` — 싱글턴 + 원장 앵커

```ts
export const DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233';
export const DEVNET_FAUCET_URL = 'https://faucet.devnet.rippletest.net/accounts';

export interface LedgerAnchor {
  ledgerTime: number;   // ledgerClosed 스트림의 `ledger_time`, ripple 초 (P0 실측 확정)
  ledgerIndex: number;
  perfNow: number;      // 이벤트 도착 시점의 performance.now()
}

export function getClient(url?: string): Promise<Client>;
export function getLatestAnchor(): LedgerAnchor | null;
export function onLedgerAnchor(listener: (anchor: LedgerAnchor) => void): () => void;
export function disconnectClient(): Promise<void>;
```

재연결 시 rippled가 구독을 버리므로 `connected` 이벤트마다 `subscribe`를 다시 건다.

**게이트와 표시의 분리 (R5)**
- 게이트 판정은 검증된 `ledgerTime`만 쓠다. 브라우저 시계는 개입하지 않는다.
- 표시용 잔여 시간은 `(perfNow 기준 경과) + ledgerTime`으로 보간한다.

```ts
// scenario/countdown.ts — P3에서 구현
export function gateUnlocked(unlockAtRipple: number, validatedCloseTime: number): boolean;
export function displayRemaining(
  anchor: { ledgerTime: number; perfNow: number },
  unlockAtRipple: number,
): number;
```

> 주의: 계획서는 `displayRemaining(anchor: { rippleTime, perfNow }, ...)`로 적혀 있었다.
> 필드명을 `LedgerAnchor`와 맞춰 **`ledgerTime`**으로 통일한다.

---

## 5. `src/lib/rippleTime.ts`

```ts
export const RIPPLE_EPOCH_OFFSET_SECONDS = 946_684_800;
export function rippleToUnixSeconds(rippleSeconds: number): number;
export function unixToRippleSeconds(unixSeconds: number): number;
export function rippleToUnixMs(rippleSeconds: number): number;
export function unixMsToRippleSeconds(unixMs: number): number;
export function rippleToIso(rippleSeconds: number): string;
export function nowRippleSeconds(): number;
```

xrpl.js의 `rippleTimeToUnixTime` / `unixTimeToRippleTime`은 **밀리초** 단위다. 원장 필드
(`ledger_time`, `NextPaymentDueDate`)는 전부 **초**이므로 초 기준 API를 따로 둔다.

---

## 6. `src/xrpl/read/ids.ts` — P1 구현 예정

```ts
export function extractVaultId(meta: unknown): string;
export function extractLoanBrokerId(meta: unknown): string;
export function extractLoanId(meta: unknown): string;
```

P0에서 `xrpl.hashes`에 결정론적 파생 함수가 있음을 확인했다.

```ts
hashes.hashVault(account: string, sequence: number): string
hashes.hashLoanBroker(account: string, sequence: number): string
hashes.hashLoan(loanBrokerId: string, loanSequence: number): string
```

**P1 구현 지침**: 파생을 1차 값으로 쓰고, meta의 `CreatedNode` 스캔 결과와 일치하는지
`assert`로 교차검증한다. 불일치하면 즉시 실패시킨다(계획서 원칙 2).

---

## 7. 금액 파라미터 (P0 재스케일 결과)

`probe-env.ts`가 실측값으로 산출하고 두 부등식을 검산했다. **두 검산 모두 PASS.**

| 항목 | 값 |
|---|---|
| faucet 지급액 F | 100 XRP |
| account base reserve | 1 XRP |
| owner reserve 증분 | 0.2 XRP |
| 예치액 D | 78 XRP (`78000000` drops) |
| 원금 P | 39 XRP (`39000000` drops) |
| cover C | 6 XRP (`6000000` drops) |
| CoverRateMinimum | 10% |
| CoverRateLiquidation | 100% |
| InterestRate | 10% |

- (i) `cover ≥ (DebtTotal + Principal + InterestDue) × CoverRateMinimum` → `6 ≥ 4.29` PASS
- (ii) `min(cover, MinimumCover × CoverRateLiquidation) < DefaultAmount` → `4.29 < 42.9` PASS

**미확정 가정 (P1에서 실측 후 갱신)**
- Vault / LoanBroker / Loan 각각의 owner reserve 증분은 미측정이며 보수적 상한 **2 XRP**로 잡았다.
- share MPToken 보유가 owner reserve 증분 1건(0.2 XRP)을 소모한다고 가정했다.
- `interestDue ≈ Principal × InterestRate`로 근사했다. 실제 이자는 `PaymentTotal` /
  `PaymentInterval`에 따라 달라지므로 P1에서 실측값으로 대체한다.

---

## 8. P1 실측이 인터페이스에 미친 영향 (2026-09-11, devnet rippled 3.4.0-rc3)

P1 spike를 devnet에서 완주시키는 과정에서 아래 항목이 실제 원장과 달랐다. 근거와 상세는
`docs/decisions.md` D7~D13에 있고, 여기에는 **인터페이스 변경분만** 적는다.

| 항목 | P0 동결 내용 | P1 devnet 실측 | 인터페이스 반영 |
|---|---|---|---|
| 요율 스케일 | `100_000 == 100% (1/10 bp, D7)` | 1/10 베이시스포인트, `100000 == 100%` | `ScenarioParams` 주석 정정, `percentToRate()` 헬퍼 추가 |
| `xrpl` 버전 | 5.1.0 | closed-ended Vault 필드가 codec에 없음 | **5.2.0-beta.0 고정** + `ripple-binary-codec` 2.11.0-beta.0, `ripple-keypairs` 3.0.0 명시 의존성 |
| LoanSet 서명 | `Signer` 1개 | Account + Counterparty 2개 서명 필수 | `StepDef.coSigner?: Role` **추가** |
| Vault 종류 | 언급 없음 | LoanBroker는 closed-ended Vault만 허용 | `ScenarioParams.subscriptionLeadSeconds` / `investmentPeriodSeconds` **추가** |
| `defaultUnlockAtRipple` | `due + grace` | rippled는 초과(strict) 비교 | `due + grace + 1` |

### 8.1 `StepDef.coSigner`

```ts
export interface StepDef {
  // ...
  signer: Role;
  /** CounterpartySignature를 엇는 두 번째 서명자. 현재 LoanSet에만 쓠다. */
  coSigner?: Role;
  // ...
}
```

엔진이 `coSigner`를 보면 `makeCounterpartySignedSigner(primary, counterparty)`로 두 서명자를
하나의 `Signer`로 합성한다. 따라서 **`submit.ts`의 시그니처와 단일 관문 정책은 그대로다**.
합성 서명자는 `mode: 'blob'`만 반환하므로 지갑이 자체 제출하는 경로는 LoanSet에 쓸 수 없고,
그 경우 `SignRejectedError('unsupported')`를 던진다. 데모에서 depositor만 지갑 후보이고
LoanSet 서명자는 borrower·broker이므로 실제 제약은 아니다.

### 8.2 `ScenarioParams` 추가 필드

```ts
export interface ScenarioParams {
  // ...
  /** VaultCreate 시각 대비 SubscriptionDate 오프셋(초). 예치는 이 구간에서만 가능하다. */
  subscriptionLeadSeconds: number;
  /** RedemptionDate - SubscriptionDate. 프로토콜 하한 180초. 출금은 이 구간이 끝나야 열린다. */
  investmentPeriodSeconds: number;
}
```

P1 실행값은 `subscriptionLeadSeconds: 45`, `investmentPeriodSeconds: 180`이다.

### 8.3 `src/xrpl/read/vault.ts` 확장

```ts
export interface VaultView {
  // ... assetsTotal / assetsAvailable / lossUnrealized / shareMPTID / account / owner
  vaultKind: number;         // 0 open-ended, 1 closed-ended
  subscriptionDate: number;  // ripple 초
  redemptionDate: number;    // ripple 초
}
export type VaultPhase = 'NoPhase' | 'Subscription' | 'Investment' | 'Redemption';
export function vaultPhaseAt(vault: VaultView, closeTime: number): VaultPhase;
export function investmentOpensAtRipple(vault: VaultView): number;  // subscriptionDate + 1
export function redemptionOpensAtRipple(vault: VaultView): number;  // redemptionDate
```

UI는 이 세 값으로 "예치 마감 / 대출 개시 / 출금 개시" 카운트다운을 그린다. 게이트 판정은
`gateUnlocked(unlockAtRipple, validatedCloseTime)` 그대로이고 표시만 `displayRemaining`을 쓠다.

### 8.4 계획서 폴더 레이아웃과의 차이

`src/xrpl/read/entry.ts`(4개 리더가 공유하는 `ledger_entry` 호출)와 `src/scenario/steps.ts`
(A·B가 공유하는 단계 팩토리), `src/wallet/nodeProvider.ts`(Node 러너용 `SignerProvider`)가
계획서 목록에 없는 파일로 추가됐다. 셋 다 내부 헬퍼이며 새 공개 계약을 만들지 않는다.
