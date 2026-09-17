# 리허설 체크리스트

- 대상: `.omc/plans/xls6566-lending-demo.md` P6, 인수 기준(6절) AC1~AC5
- 실측 근거: `.omc/artifacts/probe-env.json`, `run-B.json`, `run-A.json`, `docs/decisions.md`
- 이 문서의 수치는 전부 D0~D20(`docs/decisions.md`)에서 확정된 값이거나 위 아티팩트의 실측값이다. **추측치 없음.**
- **지갑 경로는 없다(D20).** 확장이 `VaultDeposit`을 인코딩 단계에서 거절한다
  (`Invalid field TransactionType: VaultDeposit`). 세 역할 모두 faucet 계정의 localKeypair가
  자동 서명하므로 리허설에 지갑 확장을 준비할 필요가 없고, 서명 팝업을 기다리는 구간도 없다.

---

## 1. 발표 전(D-1) 점검

| # | 항목 | 방법 | 통과 기준 |
|---|---|---|---|
| 1 | amendment 활성 확인 | `npm run probe` (= `npx tsx scripts/probe-env.ts`) 실행 | 종료 코드 0. `SingleAssetVault`/`LendingProtocol` 둘 다 Amendments 원장 엔트리에서 활성으로 보고됨(D1). 재스케일 부등식 (i)(ii) 둘 다 PASS 출력 |
| 2 | devnet 리셋 여부 확인 | 1번 실행 결과를 `.omc/artifacts/probe-env.json`의 이전 실행과 diff | amendment id·close 간격·reserve 수치가 이전과 동일하면 리셋 없음. 값이 바뀌었으면 `docs/decisions.md` D1/D13 수치를 해당 회차 기준으로 재확인하고, 재스케일 부등식이 여전히 PASS인지 확인 |
| 3 | faucet 상태 확인 | `npm run probe`가 계정을 실제로 조달하는 과정에서 실패 없이 완료되는지 확인 | rate limit(429) 없이 조달 성공. 실패 시 잠시 후 재시도하거나 발표 30분 전으로 시도 시각을 당김 |
| 4 | 계정 사전 조달(재사용) | 브라우저 세션을 한 번 띄워 depositor/broker/borrower 3개 계정이 조달되고 잔액이 충분한지 확인 | D13 최소 재사용 잔액 기준: **depositor 82 XRP / broker 12 XRP / borrower 4 XRP** 이상. 미달 시에만 앱이 자동으로 faucet을 재호출하므로, 발표 직전에는 재호출이 일어나지 않는 상태가 이상적이다. faucet 이름은 D20에서 `depositorLocal` → `depositor`로 바뀌었으므로, 이전 회차의 `localStorage` 캐시를 쓰던 브라우저는 depositor 계정을 한 번 새로 조달한다 |
| 5 | 값 변화 표시 확인 | `npm run dev` 후 `?screen=b8` / `?screen=a7` / `?screen=step2`를 열어 `이전 값 → 현재 값`이 그려지는지 확인 | b8은 감소(빨강), a7은 증가(초록), step2는 `NEW` 알약. 변한 행이 한 번 깜빡인다. 발표 화면의 `prefers-reduced-motion` 설정이 켜져 있으면 깜빡임만 사라지고 색과 화살표는 남는다 |
| 6 | 브라우저 줌/해상도 | 발표 화면(프로젝터·공유 화면)에서 `TopBar`/`StepRail`/`FlowStage`/`LedgerPanel`/`TxLog` 4영역과 `RoleCards`의 배지 문구가 뒷자리에서도 읽히는지 확인 | 125~150% 줌에서도 잘림 없음. 잘리면 브라우저 창 폭을 넓히거나 줌을 낮춘다 |
| 7 | dev 서버 기동 확인 | `npm run dev` 실행 후 접속 URL 확인. `docs/screens.md`의 `?screen=` 쿼리로 14개 화면이 전부 렌더되는지 사전 확인 | 콘솔 에러 없음. `npm run build`도 사전에 한 번 통과시켜 배포용 산출물이 깨지지 않는지 확인(AC5) |
| 8 | 백업 녹화본 결정 | 아래 5절 절차대로 1번 결과에 따라 백업 사용 여부를 확정 | 결정 사항을 이 문서 또는 발표 노트에 기록 |

---

## 2. 리허설 런스루 — 시나리오 B (부도)

값 출처: `.omc/artifacts/run-B.json`(2026-09-10 UTC 실측, `params`/`ids`/`steps`/`stepTimings`/`final`). 화면 매핑은 `docs/screens.md`의 screen key를 함께 적는다.

| # | 단계 | 서명자 | 화면 예상 값 | 실측 소요 |
|---|---|---|---|---|
| - | 계정 준비 | - | `step1`: Vault/Broker 노드 ghost | 약 15s(재사용 시 0) |
| 1 | VaultCreate | broker | `step2`: `VaultKind=1`(closed-ended), `SubscriptionDate`/`RedemptionDate`가 스케줄 로그에 표시(리드타임 75s — 2026-09-11 D22로 45→75 상향, 투자기 240s — D23으로 180→240 상향, LoanSet 창 120초) | 8.8s |
| 2 | VaultDeposit | depositor (성공 시 서명자 동결) | `step3deposit`: `Vault.AssetsTotal` **78,000,000** drops(78 XRP) | 5.9s |
| 3 | LoanBrokerSet | broker | `step4`: `LoanBroker` 신규 생성 | 5.9s |
| 4 | LoanBrokerCoverDeposit | broker | `step5`: `LoanBroker.CoverAvailable` **6,000,000** drops(6 XRP) | 5.9s |
| ⏳ | **카운트다운 1 — 대출 개시까지**(Investment 개시, `SubscriptionDate+1`) | - | `StepRail` 게이트 표시, `gateUnlocked`/`displayRemaining` | 게이트 대기 14.0s |
| 5 | LoanSet | borrower + broker(coSigner, `CounterpartySignature`) | `step6`: `Loan.PrincipalOutstanding`, `LoanBroker.DebtTotal` **39,000,000** drops(39 XRP), `InterestRate 10000`(10%), `PaymentInterval/GracePeriod` 60s | 7.8s(게이트 제외) |
| ⏳ | **카운트다운 2(B 전용) — 연체(Impair 가능) 대기**(`NextPaymentDueDate+1`) | - | 아직 별도 화면 게이트 없음 — `LoanManage(Impair)` 스텝 자체가 게이트됨 | 게이트 대기 68.1s(≈ `PaymentInterval` 60s) |
| 6 | LoanManage(`tfLoanImpair`) | broker | `b7`: `Vault.LossUnrealized` **39,000,000** drops, `Loan.Flags`에 `lsfLoanImpaired`(0x20000) 비트, pill `IMPAIRED` | 7.3s(게이트 제외) |
| ⏳ | **카운트다운 3(B 전용) — 부도(Default) 가능 대기**(`NextPaymentDueDate+GracePeriod+1`) | - | `b7` 화면의 countdown 배지 | 게이트 대기 52.0s(≈ `GracePeriod` 60s, impair 이후 남은 시간만큼) |
| 7 | LoanManage(`tfLoanDefault`) | broker | `b8`: `Vault.AssetsTotal` **78,000,000 → 42,900,000** drops, `LoanBroker.CoverAvailable` **6,000,000 → 2,100,000** drops, pill `DEFAULTED`, `lossSplit` extra | 8.9s(게이트 제외) |
| ⏳ | **카운트다운 4 — 출금 개시까지**(Redemption 개시, `RedemptionDate`) | - | `StepRail` 게이트 표시 | 게이트 대기 36.0s |
| 8 | VaultWithdraw | depositor(동결된 서명자) | `b9`: 예금자 수령액 **42,899,999** drops(≈42.9 XRP), 예치 원금 대비 순손실 **-35,100,002** drops, `depositorShares` 0(전량 상환) | 7.5s(게이트 제외) |

**B 총 소요(실측, `startedAt`→`finishedAt`): 약 232초(3분 52초).** AC4(5분=300초) 대비 여유 약 68초.

카운트다운은 총 4개다(계획서 R12의 "부도 대기 1개"에서 D9 실측 후 "예치 마감/대출 개시/출금 개시" 3개(Vault 위상)로 늘었고, B는 impair/default용 연체·유예 대기가 추가로 붙는다). `gateUnlocked`는 검증된 `close_time`만 보고, 화면 표시는 `displayRemaining`이 원장 앵커 + `performance.now()`로 보간한다(R5) — 리허설 중 브라우저 시계를 일부러 어긋나게 해도 게이트가 먼저 풀리지 않는지 한 번 확인해두면 좋다.

---

## 3. 리허설 런스루 — 시나리오 A (상환)

값 출처: `.omc/artifacts/run-A.json`. 1~5단계는 B와 공유(같은 팩토리 함수, `src/scenario/steps.ts`).

| # | 단계 | 서명자 | 화면 예상 값 | 실측 소요 |
|---|---|---|---|---|
| 1~4 | VaultCreate~CoverDeposit | (B와 동일) | (B와 동일) | 7.9+4.3+7.2+4.5s |
| ⏳ | **카운트다운 1 — 대출 개시까지** | - | - | 게이트 대기 26.0s |
| 5 | LoanSet | borrower + broker(coSigner) | `a6`: `DebtTotal` 39,000,000 drops, footer countdown | 7.7s(게이트 제외) |
| 6 | LoanPay | borrower | `a7`: 금액은 항상 `Loan.TotalValueOutstanding` 원장값 그대로(재계산 없음) — run-A.json 실측 **39,000,008** drops. `PaymentRemaining<=1`이므로 플래그 없는 정규 납입(`kind='regular'`), `tfLoanFullPayment`는 마지막 회차에서 `tecKILLED`이므로 쓰지 않는다 | 6.4s |
| ⏳ | **카운트다운 2 — 출금 개시까지**(Redemption 개시) | - | `a7`/`a8` 전환 구간의 게이트. **A는 이 대기가 가장 길다**(LoanSet이 Investment 초반에 성립해 Redemption까지 남은 시간이 크다) | 게이트 대기 164.3s |
| 6b | LoanBrokerCoverWithdraw | broker | 상환으로 `DebtTotal`이 0이므로 cover **6,000,000** drops 전액 회수. `LoanBroker.CoverAvailable 6,000,000 → 0`, Broker 계정 XRP 증가(초록). 대출이 남아 있으면 `CoverAvailable − Amount ≥ DebtTotal × CoverRateMinimum` 위반으로 거절됨 | 약 6s |
| 7 | VaultWithdraw | depositor | `a8`: 예금자 수령액 **78,000,008** drops, 예치 원금 78,000,000 drops 대비 **순증 +6** drops(AC1 기준 A). drops 단위 원시 정수로 표시해야 함(D15 — XRP로 반올림하면 차이가 사라짐) | 43.6s→ 실측 172.0s(게이트 포함, 상기 게이트 대기가 이 안에 포함) |

**A 총 소요(실측): 약 241초(4분 1초).** AC4 대비 여유 약 59초.

카운트다운은 2개뿐이다(B의 impair/default 연체·유예 대기가 A에는 없다). "예치 마감까지" 카운트다운(`SubscriptionDate`)은 VaultDeposit이 그 안에서 이미 끝나므로 정상적으로는 화면에 거의 노출되지 않는다 — 리허설 중 일부러 VaultDeposit 서명을 늦춰 마감 임박 상태를 한 번 보여줄지는 발표 판단에 맡긴다.

---

## 4. 장애 대응 플레이북

| 증상 | 원인 | 조치 |
|---|---|---|
| `tecEXPIRED` (LoanPay) | `closeTime > Loan.NextPaymentDueDate`인데 플래그 없이(또는 `tfLoanFullPayment`로) 제출 | 이미 코드에 내장된 복구 경로: `stepLoanPay()`의 `recover`가 `stepLoanPay({ forceLate: true })`(id `loanPayLate`, `tfLoanLatePayment`)로 자동 재시도한다(`src/scenario/steps.ts`, `runStepWithRecovery`). 리허설에서는 **1회만** 재시도되고 그 재시도 스텝엔 추가 `recover`가 없음을 확인해둔다(무한 재시도 방지) |
| `tecEXPIRED` (VaultDeposit) | 발표자가 단계 사이에서 지체해 폐쇄형 Vault의 `SubscriptionDate`를 넘겼다 | 단계 레일에 "Vault 다시 만들기(예치 창 120초)" 버튼이 뜬다. `restartFromVaultCreate()`가 리드타임을 max(2배, 120초)로 올려 VaultCreate부터 다시 진행한다(계정·서명자 유지). 같은 Vault로 재시도하면 반드시 다시 실패한다 |
| 제출 타임아웃(`TxTimeoutError`) / 만료(`TxExpiredError`) | `maxWaitMs` 초과(타임아웃, 재서명 없음) 또는 `LastLedgerSequence` 경과(만료, 재autofill→재서명→신규 제출) | 화면은 `Resigning` 상태를 `Signing`과 구분해 "재서명 중…"으로 표시한다. 재서명도 실패하면 `Failed`가 되고 `recover` 버튼 노출 — 자동 재시도는 없으므로 발표자가 직접 눌러야 한다는 점을 미리 숙지 |
| devnet 연결 끊김 | 웹소켓 drop | `xrpl/client.ts`가 `connected` 이벤트마다 구독을 재등록한다. 화면에 연결 상태 표시가 있으면 재연결 후 정상 복귀를 확인. 재연결이 끝내 안 되면 **새로고침 없이는 복구 불가**할 수 있으므로(AC4가 "새로고침 없이 완주"를 요구) 이 경우는 아래 5절의 백업 녹화본으로 전환 |

공통 원칙: 자동 재시도는 어디에도 없다(D5). 모든 복구는 `recover` 버튼을 사람이 눌러야 진행된다 — 리허설에서 발표자가 이 버튼의 위치와 클릭 타이밍을 미리 손에 익혀야 한다.

---

## 5. explorer 링크 육안 확인 (D14 잔여 확인)

- `SubmitOptions.explorerTxUrl`은 `https://devnet.xrpl.org/transactions/{hash}`로 활성화돼 있다(D14).
- **`curl`로는 확인이 끝나지 않는다.** devnet.xrpl.org는 클라이언트 렌더링 SPA라 `curl` 응답 200은 "라우트가 존재한다"만 보장하고, Vault/Loan 트랜잭션이 실제로 상세 렌더링되는지는 보증하지 않는다.
- **체크리스트**: 리허설 중 `TxLog`에서 LoanSet 또는 LoanManage(Default) 행의 explorer 링크를 실제 브라우저 새 탭으로 열어, 탭이 로딩된 후 트랜잭션 상세(계정, 결과, Vault/Loan 관련 필드)가 렌더링되는지 눈으로 확인한다.
- 렌더링되지 않으면(빈 화면/에러) 발표 스크립트에서 explorer 링크 클릭 시연을 빼고 앱 내부의 raw 패널(`TxLog`의 `raw`)을 1차 증거로 대신 사용한다(R8 원안).

---

## 6. D-1 백업 녹화 결정 (R2)

1. `npm run probe`가 실패(종료 코드 1)하거나 amendment 판정이 불합격이면, **즉시 D-1 성공 리허설을 녹화**해 백업 자료로 확정한다.
2. `npm run probe`가 통과해도, 1절 2번(devnet 리셋 확인)에서 수치가 이전 실측과 크게 어긋나면(재스케일 부등식이 아슬아슬하거나 실패) 보수적으로 백업을 녹화해둔다.
3. 둘 다 정상이면 백업 없이 라이브로 진행하되, 직전 성공한 리허설 1회차의 화면 녹화만이라도 남겨 장애 시 대체 자료로 쓴다.
4. 결정 결과(백업 유/무, 녹화 파일 위치)를 발표 당일 아침에 팀에 공유한다.

---

## 7. AC1~AC5 체크박스

| # | 기준 | 측정 방법 | 확인 |
|---|---|---|---|
| AC1 | 시나리오 A 전 단계(7개) `tesSUCCESS`이고 예금자 이득 성립 | **기준 A로 확정**(D15): 예금자 XRP 잔액 순증. `run-A.json` 실측 순증 **+6 drops**(130,899,995→130,900,001). 리허설 중 `Result` 화면(`a8`)의 예치 원금/상환 가치/순증 행이 이 값과 일치하는지 확인. 이자가 drops 단위로만 나타나므로(D15 한계) XRP 반올림 없이 원시 정수로 표시되는지도 함께 확인 | [ ] |
| AC2 | 시나리오 B에서 `LoanManage(tfLoanDefault)`가 `tesSUCCESS`, `Vault.AssetsTotal` 감소, `VaultWithdraw` 수령액 < 예치액 | `run-B.json` 실측: `AssetsTotal` 78,000,000→42,900,000 drops, 수령액 42,899,999 drops < 예치 78,000,000 drops. default 전후 `ledger_entry` 스냅샷을 `b8` 화면에서 비교 | [ ] |
| AC3 | **지갑 경로 없음 — 삭제(D20)** | 브라우저 확장이 XLS-65/66 트랜잭션 타입을 인코딩하지 못해(Crossmark: `Invalid field TransactionType: VaultDeposit`) 지갑 경로 자체를 제거했다. 강등도 fallback 배지도 없다. 세 역할 모두 localKeypair가 서명하며 예금자 배지는 언제나 `AUTO`다 | — |
| AC4 | 새로고침 없이 완주, 시작 버튼 클릭~Result 최종 잔액 표시까지 5분 이내 | 리허설 스톱워치로 직접 측정. 프로토콜 실측 하한은 `subscriptionLeadSeconds + investmentPeriodSeconds` = 45+180 = 225초(더 줄일 수 없음, D9). B 실측 232초(여유 약 68초), A 실측 241초(여유 약 59초) — **사람 조작 시간을 더하면 여유가 이보다 줄어드니 리허설에서 실제 사람 클릭 포함 총 시간을 반드시 재야 한다** | [ ] |
| AC5 | `xrpl` ≥ 5.1.0, `npm run build` 성공 | `npm ls xrpl`(현재 `5.2.0-beta.0`, D10)로 버전 확인. `npm run build` 실행해 빌드 로그에 에러 없는지 확인 | [ ] |

---

## 8. 부록 — 코드베이스에서 발견한 사소한 문서 불일치 (수정 범위 밖, 참고용)

P6은 `src/**/__tests__/**`, 본 문서, `vitest.config.ts`만 소유하고 다른 소스 파일은 편집하지 않는 경계라서 아래 항목은 고치지 않고 기록만 남긴다.

- `src/scenario/types.ts`의 `ScenarioParams` 주석(`coverRateMinimum`/`coverRateLiquidation`/`interestRate`)이 여전히 "rippled scale (1_000_000_000 == 100%)"라고 적혀 있다. D7이 이를 뒤집었고(1/10 베이시스포인트, 100000==100%), 실제 런타임 값(`10000`, `100000`, `RATE_SCALE_100_PERCENT`)은 이미 D7 기준을 쓰고 있다. 주석만 stale.
- `src/xrpl/tx/loan.ts`의 `buildLoanImpair` 주석("Also moves `NextPaymentDueDate` to the impairment time when the due date has not passed yet")과 `src/xrpl/read/loan.ts`의 `LoanView.nextPaymentDueDate` 주석("Impairment moves this to the impairment time")이 D11과 모순된다. D11 실측: impair는 `NextPaymentDueDate`를 이동시키지 않으며, 연체 전에는 `tecTOO_SOON`으로 거절된다. `src/scenario/scenarioB.ts` 파일 헤더 주석("impairment pulls the due date to now")도 같은 이유로 stale.
- 두 항목 모두 로직 버그는 아니다(값을 실제로 계산·이동하는 코드가 없으므로 동작에는 영향 없음). 다음에 해당 파일을 만지는 사람이 주석을 D11/D7 기준으로 고치면 된다.
