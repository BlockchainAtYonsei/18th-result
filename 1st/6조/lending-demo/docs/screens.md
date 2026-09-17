# 화면 체크리스트 (P1b → P4 합/불 판정 기준)

14개 목업 화면(`scratchpad/design/gen.mjs` 산출물, `canvas.json`의 `pageB`/`pageA` 순서)을 실제 React 컴포넌트로 재현했는지 확인하는 목록입니다. P1b에서는 더미 데이터로 렌더만 확인합니다(`src/ui/dummy.ts`). P4에서 엔진/상태(`src/scenario/*`, `src/state/store.ts`)가 실 데이터를 이 뷰모델에 매핑하면 각 항목을 devnet 기준으로 재확인하세요.

공통 구조: 11개 화면(1~6, B-7~B-9, A-6~A-8)은 `TopBar` + `StepRail` + `FlowStage`(+`RoleCards`) + `LedgerPanel` + `TxLog` 4영역을 `MainScreen`이 조립합니다(`src/ui/MainScreen.tsx`). 0번은 `Landing`이 담당합니다.

## 자금 흐름 도형 (6개 노드 · 3열 × 2행)

`FlowStage`의 700×440 박스는 폭 190px 노드 6개를 3열 2행으로 놓습니다(좌표는 `src/ui/stage/flowPaths.ts`).

| 위치 | 노드 | `NodeVM` | 내용 |
|---|---|---|---|
| 1행 좌 (16, 40) | Depositor | `stat` | XRP 또는 share 잔액(이전 → 현재), 주소 축약 |
| 1행 중 (255, 40) | Vault | `kv` / `ghost` | `AssetsTotal` · `AssetsAvailable` · `LossUnrealized` |
| 1행 우 (494, 40) | Borrower | `stat` | XRP 잔액(이전 → 현재), 납부기한 또는 Loan 상태 |
| 2행 좌 (16, 250) | Broker 계정 | `stat` | Broker 소유 계정의 XRP 잔액(이전 → 현재), 배지 `AUTO`, 주소 축약 |
| 2행 중 (255, 250) | Broker cover | `kv` / `ghost` | `CoverAvailable` · `DebtTotal` |
| 2행 우 (494, 250) | Loan | `kv` / `ghost` | `PrincipalOutstanding` · `TotalValueOutstanding` · `NextPaymentDue`, 머리말 알약이 `Flags`(`—` / `IMPAIRED` / `DEFAULTED` / `종료`) |

`ghost`는 해당 원장 객체가 아직 없다는 뜻입니다 — Vault는 `VaultCreate` 전, Broker cover는 `LoanBrokerSet` 전, Loan은 `LoanSet` 전. 전액 상환으로 `Loan`이 삭제된 뒤에는 ghost로 돌아가지 않고 `종료` 알약과 0 값을 그대로 보여줍니다.

경로는 7개입니다. `deposit`/`withdraw`는 1행 좌측 통로, `loan`/`repay`는 1행 우측 통로, `coverDeposit`(Broker 계정 → Broker cover)은 2행 좌측 통로에 있고, `cover`(Broker cover → Vault)와 `loanLink`(Borrower ↕ Loan)는 두 행 사이 85px 통로를 세로로 지납니다. 세로 경로는 노드 모서리에서 20px 이상 떨어져 시작·종료합니다. `loanLink`는 Loan이 생기면 `Loan 계약` 라벨이 붙고, default에서는 `blocked`, LoanPay에서는 `flow good`으로 바뀝니다.

노드 카드는 190px이므로 `.kv` 행이 줄바꿈하지 않습니다 — 키가 길면 말줄임표로 잘리고 전체 이름은 `title` 툴팁과 우측 원장 패널에 남습니다.

`lossSplit` · `balanceSummary` · `walletPopup` 오버레이는 2행이 쓰는 자리를 비우기 위해 440px 박스 안이 아니라 바로 아래 `.stage-strip`에 렌더됩니다.

지갑 경로는 삭제됐습니다(`docs/decisions.md` D20 — 확장이 XLS-65/66 트랜잭션 타입을 인코딩하지 못합니다). 목업 14개는 그대로 두지만 **3a(지갑 서명 대기)는 목업 전용**이며 실행 중에는 나오지 않습니다. 예금자를 포함한 세 역할 전부 localKeypair가 자동 서명합니다.

`npm run dev` 후 `?screen=<key>` 쿼리 파라미터로 각 화면을 확인할 수 있습니다(우측 상단 dev 스위처 링크 클릭도 가능). key는 아래 표의 "screen key" 열을 참고하세요.

| # | 화면 | screen key | 렌더 컴포넌트 | 상태를 결정하는 것 | 확인 |
|---|---|---|---|---|---|
| 0 | Landing | `landing` | `src/ui/screens/Landing.tsx` (`TopBar` 포함) | `LandingVM` (`DUMMY_LANDING`): 시나리오 A/B 카드 내용, 강조 카드 여부 | [x] |
| 1 | 계정 준비 | `step1` | `MainScreen` (`TopBar`+`StepRail`+`FlowStage`+`LedgerPanel`+`TxLog`) | `MainScreenVM` (`DUMMY_STEP1`): `steps` cur=2, `stage.nodes.vault/broker/loan`이 `ghost`, `stage.extra.kind='note'` | [x] |
| 2 | VaultCreate | `step2` | `MainScreen` | `DUMMY_STEP2`: `steps` cur=3, `vault` 노드 `accent:'hot'`+`pulse:'blue'`+pill `NEW`, `labels`에 VaultID | [x] |
| 3a | 지갑 서명 대기 (목업 전용, D20) | `step3signing` | `MainScreen` (`StepRail`의 `footer.kind='signing'`, `FlowStage.extra.kind='walletPopup'`) | `DUMMY_STEP3_SIGNING`: `railFooter`가 signing 패널, depositor `subBPill`, `txRows[0]`가 pending(`resultTone:'none'`). **라이브 앱은 이 화면을 만들지 않습니다** | [x] |
| 3 | VaultDeposit | `step3deposit` | `MainScreen` | `DUMMY_STEP3_DEPOSIT`: `steps` cur=4, `chips`에 deposit 칩(tone `wallet`), Vault `AssetsTotal/AssetsAvailable` up | [x] |
| 4 | LoanBrokerSet | `step4` | `MainScreen` | `DUMMY_STEP4`: `steps` cur=5, `broker` 노드가 `ghost`→`kv`(`accent:'hot'`+`pulse:'blue'`)로 전환 | [x] |
| 5 | CoverDeposit | `step5` | `MainScreen` | `DUMMY_STEP5`: `steps` cur=6, `broker` 노드 `accent:'gain'`, `CoverAvailable` 50 up, `brokerAccount` `accent:'loss'`(−50), `coverDeposit` 경로에 칩 | [x] |
| 6 | LoanSet (B 레일) | `step6` | `MainScreen` | `DUMMY_STEP6` (공유 `loanSetStage`/`loanSetPanel`): `steps` STEPS_B cur=7, `chips`에 loan 칩, `loan` 노드가 `ghost`→`kv`(NEW 알약 3행) | [x] |
| B-7 | Impair 완료 · Default 대기 | `b7` | `MainScreen` (`StepRail.footer.kind='action'` + `state:'disabled'` + `countdown`) | `DUMMY_B7`: countdown `'1:12'`, vault `accent:'loss'`+`pulse:'crit'`+pill `IMPAIRED`, `blockedMarkers` | [x] |
| B-8 | Default 완료 | `b8` | `MainScreen` (`FlowStage.extra.kind='lossSplit'`) | `DUMMY_B8`: vault pill `DEFAULTED`, `loan` 알약 `DEFAULTED` + `loanLink` `blocked`, `lossSplit` extra (coverPct 10, 스테이지 아래 스트립) | [x] |
| B-9 | 손실 결과 | `b9` | `MainScreen` (`StepRail.footer.kind='result'` tone `crit`, `FlowStage.extra.kind='balanceSummary'`) | `DUMMY_B9`: `steps` cur=10(전원 done), depositor `bigTone:'down'`, `balanceSummary` 3열 | [x] |
| A-6 | LoanSet (상환 대기, A 레일) | `a6` | `MainScreen` (공유 `loanSetStage`/`loanSetPanel`, A 레일 라벨만 다름) | `DUMMY_A6`: `steps` STEPS_A cur=7, `footer.countdown='0:47'` | [x] |
| A-7 | LoanPay | `a7` | `MainScreen` | `DUMMY_A7`: `steps` cur=8, `chips`에 repay 칩(tone `good`), broker `DebtTotal` 0 down, `loan` 알약 `종료` + `loanLink` `flow good` | [x] |
| A-7b | LoanBrokerCoverWithdraw | (라이브 전용) | `MainScreen` | 실 실행에서만: 상환 뒤 Broker가 cover 전액 회수. `coverWithdraw` 경로에 초록 칩, Broker 계정 XRP 증가(초록), `CoverAvailable 6 → 0`. 목업 화면 없음 | [x] |
| A-8 | 이자 수령 결과 | `a8` | `MainScreen` (`StepRail.footer.kind='result'` tone `good`) | `DUMMY_A8`: `steps` cur=10(전원 done), depositor `bigTone:'up'`, `balanceSummary` 3열(인출 후 up) | [x] |

## 뷰모델 계약

컴포넌트 props는 전부 `src/ui/viewModel.ts`의 순수 뷰모델 타입(`StepVM`, `NodeVM`, `FlowStageVM`, `LedgerSectionVM`, `TxRowVM`, `MainScreenVM` 등)이며 `xrpl` 타입을 참조하지 않습니다. P3/P4에서 엔진 상태를 이 타입으로 매핑하면 `src/ui/dummy.ts`의 상수를 실 데이터로 교체하는 것만으로 화면이 갱신됩니다.

## 값 변화 표시 (이전 값 → 현재 값)

`.kv` 격자의 행은 `KVTuple`(`[key, value, tone?]`)이거나 `KVRowVM`(`{ k, v, prev?, delta?, isNew? }`)입니다. `prev`와 `delta`가 함께 있으면 `이전 값 → 현재 값`으로 그려지고, 새 값은 방향에 따라 색이 붙습니다 — 증가 초록, 감소 빨강, 순서가 없는 값(플래그·날짜) 앰버. 직전 스냅샷에 객체 자체가 없었던 필드는 화살표 대신 `NEW` 알약이 붙습니다. 변한 행은 약 2초에 걸쳐 사라지는 배경 틴트로 한 번 깜빡이며, `prefers-reduced-motion: reduce`에서는 애니메이션이 꺼집니다.

비교 기준은 `AppState.prevSnapshot`(직전에 성공한 단계가 시작될 때의 원장)과 `AppState.snapshot`입니다. 다음 단계가 성공하면 이 쌍이 함께 한 칸 이동합니다. 렌더는 `src/ui/KVGrid.tsx`, 비교는 `src/ui/mapping.ts`의 `diffRow` / `bigDiff`가 합니다. 목업으로 확인하려면 `?screen=b8`(Default, 감소 위주), `?screen=a7`(LoanPay, 증가 위주), `?screen=step2`(VaultCreate, `NEW` 알약)를 보세요.
