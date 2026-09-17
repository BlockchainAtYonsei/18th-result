# 결정 기록

계획서 `.omc/plans/xls6566-lending-demo.md`가 P0/P1에 확정하도록 지정한 항목만 적는다.
확정된 항목은 이후 페이즈에서 바꾸지 않는다.

---

## D1. amendment 활성 판정의 단독 합격 조건 (P0, 확정)

- **결정**: Amendments 원장 엔트리(`ledger_entry`, index `7DB0788C…6EF4`)의 `Amendments` 배열에
  대상 amendment id가 있으면 합격으로 본다. `feature` 명령과 malformed `VaultCreate`는 보조다.
- **amendment id 산출**: `sha512half(ASCII(featureName))`. devnet `feature` 응답 106건 전부에 대해
  이름→id 재현이 일치(불일치 0)하는 것으로 알고리즘을 검증했다.
- **실측(2026-09-11 devnet, rippled 3.4.0-rc3)**
  - `SingleAssetVault` = `81BD2619B6B3C8625AC5D0BC01DE17F06C3F0AB95C7C87C93715B87A4FD240D8` → 활성
  - `LendingProtocol` = `565B90CA1AB2B9D42208ED10884188C64F9E19083DECB9634AAF06EB03299509` → 활성
- **실효 판정(참고)**: `WithdrawalPolicy: 99`인 `VaultCreate`가 `temMALFORMED`를 받았다.
  `temDISABLED`가 아니므로 amendment가 실제로 동작 중임을 뒷받침한다.

## D2. A7 대체 복구 경로는 불필요 (P0, 확정)

- **결정**: `LoanPayFlags.tfLoanLatePayment`(= 262144)가 xrpl.js 5.1.0에 존재하므로
  계획서 R6의 대체 경로(A 한정 `PaymentInterval` 상향, A6→A7 자동 연속 제출)는 **활성화하지 않는다**.
- P1에서 devnet 제출이 실제로 실패할 경우에만 재검토한다.

## D3. 객체 ID는 결정론적 파생을 1차 값으로 쓴다 (P0, 확정)

- **결정**: `hashes.hashVault` / `hashes.hashLoanBroker` / `hashes.hashLoan`로 파생한 값을 1차로 쓰고,
  tx meta의 `CreatedNode` 스캔 결과와 `assert`로 교차검증한다. 불일치는 즉시 실패다.
- **근거**: meta 파싱은 노드 순서와 필드 존재에 의존하지만, 파생은 계정과 시퀀스만으로 결정된다.

## D4. `submit`은 client를 주입받는다 (P0, 확정)

- **결정**: 계획서의 `submit(tx, signer, onState)`를 `submit(tx, signer, onState, opts)`로 확장한다.
  `opts.client`가 필수다.
- **근거**: 3인자 형태로는 `Client`에 닿을 경로가 없고, 모듈 내부에서 싱글턴을 import하면
  테스트에서 모의 client를 넣을 수 없다.
- 상세는 `docs/interfaces-frozen.md` 2절.

## D5. 만료 복구는 재서명 1회, 타임아웃은 재서명하지 않는다 (P0, 확정)

- **결정**: `LastLedgerSequence` 경과가 확인된 경우에만 재autofill·재서명한다(1회). 기존 blob은
  절대 재제출하지 않는다. 검증도 만료도 아닌 상태로 `maxWaitMs`를 넘기면 `TxTimeoutError`를 던지고
  재서명하지 않는다.
- **근거**: 만료가 확정되지 않은 상태에서 재서명하면 같은 `Sequence`로 두 번 제출하게 된다.

## D6. `explorerUrl`은 P1까지 null (P0, 유지)

- **결정**: `SubmitOptions.explorerTxUrl`의 기본값은 `() => null`이다. P1에서 devnet explorer가
  Vault/Loan tx를 실제로 표시하는지 확인한 뒤에만 링크를 주입한다(계획서 R8).

---

## D7. 요율 스케일은 1/10 베이시스포인트다 (P1, 확정)

- **결정**: `InterestRate` / `CoverRateMinimum` / `CoverRateLiquidation` / `OverpaymentFee` 등은
  **1/10 베이시스포인트**이며 유효 범위가 `0..100000`, 즉 **`100000 == 100%`**다.
  `ManagementFeeRate`만 상한이 `10000`(= 10%)이다.
  `docs/interfaces-frozen.md` 3절이 적었던 `1_000_000_000 == 100%`는 **오류이며 폐기한다**.
- **근거**: `node_modules/xrpl/dist/npm/models/transactions/{loanSet,loanBrokerSet}.js`의
  `MAX_INTEREST_RATE = 100000`, `MAX_COVER_RATE_MINIMUM = 100000`, `MAX_MANAGEMENT_FEE_RATE = 10000`.
  XLS-66 3.8.1 필드표도 "in 1/10th basis points ... between 0 and 100000 inclusive (0 - 100%)"로 적는다.
  devnet 실측: `InterestRate: 10000`으로 제출한 LoanSet의 `Loan.InterestRate`가 `10000`으로 저장됐고
  이자가 연 10% 기준값과 일치했다(D12 참조).
- **반영**: `percentToRate(percent)` 헬퍼(`src/xrpl/tx/loanBroker.ts`)만 쓰고 리터럴을 직접 쓰지 않는다.

## D8. LoanSet 상호서명은 `StepDef.coSigner`로 표현한다 (P1, 확정)

- **결정**: `StepDef`에 `coSigner?: Role`을 추가한다. 엔진이 `coSigner`를 보면
  `makeCounterpartySignedSigner(primary, counterparty)`로 두 서명자를 하나의 `Signer`로 합성한다.
  `submit.ts`의 시그니처와 "단일 관문" 정책은 그대로다.
- **근거**: XLS-66 3.8.3에 따라 LoanSet은 Borrower와 LoanBroker.Owner **양쪽 서명**이 필요하다.
  기존 `StepDef.signer: Role` 하나로는 표현할 수 없고, `submit`에 인자를 더하면 동결한 관문 계약이 깨진다.
  합성 서명자는 `Signer` 인터페이스를 그대로 만족하므로 확장이 가장 작다.
- **데모 배치**: Borrower 개시 흐름을 쓴다. `Account = borrower`, `Counterparty = broker`,
  `CounterpartySignature`는 broker가 만든다.
- **한계**: 합성 서명자는 `mode: 'blob'`만 처리한다. 지갑이 자체 제출하는 경로는 LoanSet에 쓸 수 없고
  `SignRejectedError('unsupported')`를 던진다. 데모에서 지갑 후보는 depositor뿐이고 LoanSet 서명자는
  borrower·broker이므로 실제 제약이 되지 않는다.
- **`combineLoanSetCounterpartySigners`는 쓰지 않는다.** 그 함수는 `CounterpartySignature.Signers`
  (다중서명) 병합 전용이고, 데모의 counterparty는 항상 단일 로컬 키페어다.

## D9. Vault는 closed-ended여야 하고, 3단계 위상이 데모 시간을 규정한다 (P1, 확정)

- **결정**: `VaultCreate`는 항상 `VaultKind = 1`(closed-ended)과 `SubscriptionDate` /
  `RedemptionDate`를 함께 보낸다. `ScenarioParams`에 `subscriptionLeadSeconds`(기본 45)와
  `investmentPeriodSeconds`(기본 180)를 추가한다.
- **근거**: devnet rippled에 `LendingProtocolV1_1`이 활성이다. `LoanBrokerSet.cpp` preclaim이
  `getVaultKind(sleVault) != VaultKind::ClosedEnded`이면 **`tecNO_PERMISSION`**을 반환한다.
  open-ended vault로 만든 첫 시도가 정확히 이 코드로 실패했다
  (tx `BD2E7836355EBB26766403F38B26EB26A67163B81DB2A9D0DDD9EAD5C3E85C78`).
- **위상별 제약 (rippled 소스 실측)**

  | 트랜잭션 | 허용 위상 | 위반 시 |
  |---|---|---|
  | `VaultDeposit` | Subscription만 | `tecEXPIRED` |
  | `LoanSet` | Investment만 | Subscription `tecTOO_SOON` / Redemption `tecEXPIRED` |
  | `VaultWithdraw` | Subscription, Redemption | Investment `tecTOO_SOON` |
  | `LoanBrokerSet` / `CoverDeposit` / `LoanManage` / `LoanPay` | 제약 없음 | - |

- **경계**: Investment는 `parentCloseTime > SubscriptionDate`부터, Redemption은
  `parentCloseTime >= RedemptionDate`부터다. 게이트는 검증된 close time과 비교하므로 항상 보수적이다.
- **하한**: `kMinInvestmentPeriod = 180초`, `kMaxInvestmentPeriod = 30년`.
  LoanSet은 추가로 `StartDate + PaymentInterval x PaymentTotal + 60 <= RedemptionDate`를 요구한다
  (`kLoanRedemptionBuffer = 60`).
- **결과**: 1회 완주의 **하한이 약 3분 45초**다. 이 값은 줄일 수 없다. R12 예산표를 갱신했다.

## D10. `xrpl` 5.2.0-beta.0으로 올리고 counterparty 서명은 직접 만든다 (P1, 확정)

- **결정 1**: `xrpl`을 **5.2.0-beta.0**으로 고정하고 `ripple-binary-codec` 2.11.0-beta.0,
  `ripple-keypairs` 3.0.0을 명시 의존성으로 추가한다.
- **근거 1**: 5.1.0이 쓰는 `ripple-binary-codec` 2.10.0의 `definitions.json`에는
  `VaultKind` / `SubscriptionDate` / `RedemptionDate` 필드 정의가 **없다**. 인코딩 자체가 불가능하므로
  D9의 closed-ended vault를 만들 수 없다. 2.11.0-beta.0에는 세 필드가 모두 있다.
  AC5의 `xrpl >= 5.1.0`은 계속 만족한다.
- **결정 2**: `signLoanSetByCounterparty`를 쓰지 않고 `src/wallet/localKeypair.ts`의
  `signLoanSetAsCounterparty`를 쓴다.
- **근거 2**: rippled는 `CounterpartySignature`를 `HashPrefix::CounterpartyTxSign`(`"CPT\0"` =
  `0x43505400`)로 검증하는데(`STTx::checkSign` + `signingPrefix(SignatureRole::Counterparty, ...)`),
  xrpl.js는 5.2.0-beta.0까지도 `encodeForSigning`의 일반 프리픽스(`"STX\0"` = `0x53545800`)로 서명한다.
  devnet이 제출 시점에 `fails local checks: Counterparty: Invalid signature.`로 거절했다.
  서명 대상 필드 집합은 동일하므로 **앞 4바이트만 교체**하면 된다. 프리픽스가 예상과 다르면 즉시 예외를 던진다.
- **후속**: xrpl.js가 이 프리픽스를 고치면 자체 구현을 제거하고 라이브러리 함수로 되돌린다.

## D11. Impair는 대기를 단축하지 못한다 — R7 종결 (P1, 확정)

- **결정**: 계획서 R7("impair가 due date를 당긴다")의 완화책은 **불필요하며, 전제가 틀렸다**.
  impair는 `NextPaymentDueDate`를 움직이지 않는다.
- **근거**: devnet에 `fixCleanup3_4_0`이 활성이다. `LoanManage::impairLoan`은
  (a) `isPaymentLate`가 거짓이면 **`tecTOO_SOON`**으로 거절하고,
  (b) due date 이동 코드를 `if (!fixEnabled340)` 안에 가둔다.
  실측: LoanSet 직후 impair가 `tecTOO_SOON`
  (`45F9806CB951EEDE6AF5086FE2C514F56866366D793D0FF18F92FB60254B5CC7`).
  연체 후 성공한 impair 전후로 `NextPaymentDueDate`가 `842378721`로 동일했다.
- **default 성립 시각 공식 (확정)**:
  `NextPaymentDueDate + GracePeriod`를 **초과**해야 한다(strict).
  `NextPaymentDueDate = StartDate + PaymentInterval`이므로
  **LoanSet 시점부터 `PaymentInterval + GracePeriod`초 뒤**가 최초 성립 시각이다.
  실측 B: StartDate `842378661`, NextPaymentDueDate `842378721`, default 게이트 해제 `842378782`.
  `src/scenario/countdown.ts`의 `defaultUnlockAtRipple`이 `due + grace + 1`을 돌려준다.
- **impair 게이트**: `NextPaymentDueDate + 1`. 실패를 막기 위해 엔진이 대기한다.

## D12. Vault는 현금주의 회계다 (P1, 확정)

- **결정**: devnet이 만드는 Vault는 `LEVersion = 1`, 즉 `VaultVersion::CashBasis`다.
  **LoanSet은 `AssetsTotal`을 늘리지 않는다.** 예정 이자는 실제로 상환될 때 반영된다.
- **근거**: `VaultCreate.cpp`가 `vault->at(sfLEVersion) = VaultVersion::CashBasis`로 고정한다.
  실측 B: LoanSet 후 `AssetsTotal` 78000000 유지, `AssetsAvailable`만 78000000 → 39000000.
- **파급**: 부도 노출액은 `TotalValueOutstanding`이 아니라 **`PrincipalOutstanding`**이다.
  - impair 직후 `Vault.LossUnrealized = 39000000` (= 원금), `TotalValueOutstanding`은 `39000008`.
  - default 시 `DefaultAmount = 39000000`, `MinimumCover = DebtTotal x CoverRateMinimum = 3900000`,
    `DefaultCovered = min(3900000 x 100%, 39000000, 6000000) = 3900000`,
    `VaultLoss = 35100000`.
  - 실측이 이 계산과 **정확히 일치**했다: `AssetsTotal` 78000000 → 42900000,
    `CoverAvailable` 6000000 → 2100000.
- **앱 정책 불변**: 화면은 계속 `ledger_entry` raw 값만 표시한다. 위 식은 검증용이다.

## D13. owner reserve와 수수료 실측 (P1, 확정)

devnet 기준 base reserve 1 XRP, owner reserve 증분 0.2 XRP(200000 drops), base fee **1 drop**.
`ownerCount` 증분과 잔액 변화를 단계마다 대조해 얻었다(`.omc/artifacts/run-B.json`의 `ownerProbes`).

| 단계 | 계정 | ownerCount 증분 | 예약금 | 별도 소각/수수료 |
|---|---|---|---|---|
| `VaultCreate` | broker | **+3** (Vault, MPTokenIssuance, owner MPToken) | 0.6 XRP | 수수료 **200000 drops** (pseudo-account 생성분, `AccountDelete`류 특수 수수료) |
| `VaultDeposit` | depositor | **+1** (share MPToken) | 0.2 XRP | 1 drop |
| `LoanBrokerSet` (신규) | broker | **+2** (LoanBroker, pseudo-account) | 0.4 XRP | 1 drop |
| `LoanBrokerCoverDeposit` | broker | 0 | - | 1 drop |
| `LoanSet` | borrower | **+1** (Loan) | 0.2 XRP | **2 drops** (counterparty 서명 1개만큼 가산) |
| `LoanManage` (impair/default) | broker | 0 | - | 1 drop |
| `VaultWithdraw` (전량) | depositor | **-1** (MPToken 삭제) | 0.2 XRP 회수 | 1 drop |

P0가 Vault/LoanBroker/Loan에 각 2 XRP로 잡았던 보수적 상한은 **과대**였다.
실제 broker 소요는 base 1 + 0.6 + 0.4 + cover 6 + VaultCreate 수수료 0.2 = 약 **8.2 XRP**,
depositor는 base 1 + 0.2 + 예치 78 = 약 **79.2 XRP**, borrower는 base 1 + 0.2 = 약 **1.2 XRP**다.
faucet 100 XRP로 세 계정 모두 여유가 있다. 러너의 최소 잔액 기준은 각각 82 / 12 / 4 XRP다.

## D14. explorer 링크는 활성화한다 (P1, 확정)

- **결정**: `SubmitOptions.explorerTxUrl`에 `https://devnet.xrpl.org/transactions/{hash}`를 주입한다.
  D6의 "P1까지 null" 유예를 해제한다.
- **근거**: B 실행의 LoanSet / LoanManage 해시로 `curl`했을 때 **HTTP 200**을 받았다.
- **한계**: devnet.xrpl.org는 클라이언트 렌더링 SPA라 `curl` 본문에는 tx 내용이 없다.
  **200은 라우트가 존재한다는 뜻이며, Vault/Loan 트랜잭션의 상세 렌더링 여부는 확인하지 못했다.**
  리허설 때 브라우저로 한 번 눈으로 확인해야 한다(계획서 R8 잔여분).

## D15. AC1 판정 기준은 **기준 A**로 확정한다 (P1, FROZEN)

- **결정**: AC1은 **기준 A — 예금자 XRP 잔액 순증**으로 판정한다. 이후 변경하지 않는다.
- **근거 (시나리오 A devnet 실측, `.omc/artifacts/run-A.json`)**

  | 항목 | drops |
  |---|---|
  | 예금자 시작 잔액 | 130899995 |
  | 예치 원금 | -78000000 |
  | VaultDeposit 수수료 | -1 |
  | VaultWithdraw 수령액(총액) | +78000008 |
  | VaultWithdraw 수수료 | -1 |
  | 예금자 종료 잔액 | 130900001 |
  | **순증** | **+6** |

  share MPToken owner reserve 0.2 XRP는 실행 중 잠기지만 전량 상환 시 MPToken이 삭제되며
  `ownerCount`가 -1로 되돌아온다. 즉 **비용이 아니라 일시적 잠금**이고 순증 계산에 들어가지 않는다.
  기준 B(share 상환 가치 78000008 > 예치 원금 78000000)도 동시에 성립하지만,
  계획서 6절이 "기준 A가 성립하면 채택한다"고 정했으므로 기준 A를 쓴다.

- **중요한 한계 — 이자 규모는 구조적으로 drops 단위다.**
  이자는 `principal x InterestRate x PaymentInterval / 31,536,000`(연환산)이다.
  39 XRP · 연 10% · 60초 = **8 drops**(올림)이 전부다.
  `InterestRate`를 프로토콜 최대인 100%로 올려도 60초에 **74 drops**이다.
  5분 예산 안에서 XRP 단위로 보이는 이자를 만드는 것은 **수학적으로 불가능**하다
  (0.5 XRP를 만들려면 연 100%로 약 4.7일이 필요하다).
  따라서 계획서 6절의 "InterestRate 상향·기간 조정으로 1회 재시도"는 **실행하지 않는다**.
  기준 A가 이미 성립하고, 재시도해도 자릿수가 바뀌지 않기 때문이다.

- **UI 요구사항**: Result 화면의 이득 행은 **drops 단위와 원시 정수**로 표시한다.
  XRP로 반올림하면 `78.000008 -> 78.000001`처럼 차이가 사라져 데모의 요점이 지워진다.
  "예치 원금 / 상환 가치 / 수수료 합"을 각각 drops 정수로 나란히 보여준다.

## D16. 두 시나리오의 실측 결과 (P1, 기록)

두 실행 모두 전 단계 `tesSUCCESS`, `expect` 위반 경고 **0건**이다.
원본은 `.omc/artifacts/run-A.json` / `run-B.json`에 있다.

### 시나리오 B (부도) — 총 232초

B는 **연속 2회 완주**했고 두 번 모두 같은 수치가 나왔다. 아래는 `.omc/artifacts/run-B.json`에
남아 있는 2회차다(1회차 default 해시는 `7F271562E0D4C70D67E1131E0B1788F0764BCA44AF9D482C153ACD8A693E57FD`).

| # | 단계 | tx hash | engineResult |
|---|---|---|---|
| 1 | VaultCreate | `680AD16FAA25963F1A3F90706A283B44509E3CE34C54F21B364B78D4AE494CCC` | tesSUCCESS |
| 2 | VaultDeposit | `B377C252A16E0EC157989D5B0512E9515E74ED34E343DB33ABFE83CB96A9DDDC` | tesSUCCESS |
| 3 | LoanBrokerSet | `D40E11893B3B2BAE6E7CB8937B4E03CE31B3B9AA5D0A6169CA246FDD8ED57D77` | tesSUCCESS |
| 4 | LoanBrokerCoverDeposit | `5342DA5A52AB8CA1E5B05F611BACF9B9C981DFF8D1FC71B3E80C38808589822C` | tesSUCCESS |
| 5 | LoanSet | `6A6A1354CA31BBAFF5C95DAF0D17FA8E76517CC54AAF56D4E7D29C3098430D4D` | tesSUCCESS |
| 6 | LoanManage tfLoanImpair | `743269763EC5A8D44E0F7F738E59C0C159F23C5B1E37447180D8C5AEA99688C5` | tesSUCCESS |
| 7 | LoanManage tfLoanDefault | `956288C13486605A4EA68442343EB340F9B893BE2DCFA3992857C51EDCCAF94E` | tesSUCCESS |
| 8 | VaultWithdraw | `61825DBBD2F9F19255AC0D09D638344B5BD100E066C7D07561FCEB7E1E308033` | tesSUCCESS |

`AssetsTotal` 78000000 → **42900000**, `CoverAvailable` 6000000 → 2100000,
예금자 78 XRP 예치 → 42.899999 XRP 수령(순 -35100002 drops). **AC2 충족.**

### 시나리오 A (상환) — 총 241초

| # | 단계 | tx hash | engineResult |
|---|---|---|---|
| 1 | VaultCreate | `173D2D379B5D28EB0E7C743ADB90D06292EBA6F073864B0A4238C2CFC1068D73` | tesSUCCESS |
| 2 | VaultDeposit | `4B475C12F0DC0ABBBBD0174E91287C36A5A00AB6744485D7FCFEED225C06AE7A` | tesSUCCESS |
| 3 | LoanBrokerSet | `55E26057BA900D355FAC0C0DEC0CBFC879C36AF0D9F06056559A95B7E89575A2` | tesSUCCESS |
| 4 | LoanBrokerCoverDeposit | `E2581CD8F0F2715447260511563B3D511976411B8EEAA50A1E574331C9E42D4F` | tesSUCCESS |
| 5 | LoanSet | `62009DB60ED0D61476F06EACA69D4BC27253462BF7E655AECDFC34567AE69B43` | tesSUCCESS |
| 6 | LoanPay (regular) | `3EAA608753277B9A09C4E0A362553FB4D3B3145B410D794ACC9C1D7D3B6637A9` | tesSUCCESS |
| 7 | VaultWithdraw | `FDC23FEF5A1A51F0A351F3CDA580A55B08083BA9912ED1150536CCED47B500A2` | tesSUCCESS |

`AssetsTotal` 78000000 → **78000008**. 예금자 순증 +6 drops.

**A는 7단계다.** 계획서 AC1의 "8단계"는 계정 준비를 한 단계로 셌던 것으로 보이며,
tx 단계는 7개다. AC1 문구를 "전 단계 `tesSUCCESS`"로 읽는다.

### LoanPay 플래그 정정

계획서와 지시는 A6에 `tfLoanFullPayment`를 쓰라고 했으나, **`PaymentTotal = 1`에서는 쓸 수 없다**.
XLS-66 3.11.4.2 조건 14가 `PaymentRemaining == 1`이면 `tecKILLED`로 거절한다(마지막 회차는
정규 납입으로 내야 한다). 따라서 `stepLoanPay`는 on-chain `Loan`을 읽어 다음처럼 고른다.

- 연체(`closeTime > NextPaymentDueDate`) → `tfLoanLatePayment`
- `PaymentRemaining <= 1` → 플래그 없음(정규 납입)
- 그 외 → `tfLoanFullPayment`

금액은 항상 원장의 `TotalValueOutstanding`을 그대로 쓴다. 실측에서 정규 납입 경로로
`tesSUCCESS`가 났고 `tecEXPIRED` 재시도(`recover`)는 발동하지 않았다.

---

## 미확정 (담당 페이즈에서 채운다)

P1이 담당하던 4건은 모두 확정됐다.

- ~~AC1 판정 기준~~ → **D15** (기준 A, FROZEN)
- ~~Vault / LoanBroker / Loan owner reserve 증분~~ → **D13** (각 3 / 2 / 1 증분)
- ~~impair가 `NextPaymentDueDate`를 앞당기는지~~ → **D11** (앞당기지 않는다)
- ~~default 성립 시각 공식~~ → **D11** (`NextPaymentDueDate + GracePeriod` 초과)

남은 항목

- **explorer가 Vault/Loan tx를 실제로 렌더링하는지** — 브라우저 육안 확인 필요 (D14 한계)
- **지갑(Crossmark / GemWallet) 서명 API 형태** — P5

## D17. 지갑 SDK는 번들 형태에 무관하게 리졸버로 접근한다 (P5 후속, 확정)

- **문제**: 타입 선언과 브라우저 런타임 형태가 다르다. Vite가 브라우저에 제공하는 `@crossmarkio/sdk` UMD 번들은
  기본 export가 `{ vanilla, modules, typings, default }`이고 SDK 인스턴스는 `.default`에 있다.
  `@gemwallet/api` 3.8.0(CJS)은 브라우저에서 이름 있는 export가 전부 `undefined`이고 함수는 `default`에 있다.
  headless Chromium + dev 서버에서 실측(2026-09-11). 그 결과 두 탐침 모두 예외 → "확장 없음"으로 오판했다.
- **결정**: `src/wallet/crossmarkSdk.ts`의 `resolveCrossmarkSdk()`, `src/wallet/gemwalletApi.ts`의
  `resolveGemWalletApi()`가 직접/중첩 두 형태를 모두 처리한다. 지갑 코드는 SDK를 직접 import하지 않는다.
- **추가**: Crossmark는 확장 감지와 사이트 연결(사인인)이 별개다. `ProbeResult.detected`를 분리하고
  `connectCrossmark()`(`signInAndWait`, 60초)로 명시적 연결 버튼을 제공한다.

## D18. 지갑 경로의 예치 창은 90초 이상, 마감 초과 시 Vault 재생성으로 복구 (확정)

- **실측**: Crossmark로 서명한 VaultDeposit(`F2BA…8379`)이 SubscriptionDate(03:43:17Z) 4초 뒤 검증되어 `tecEXPIRED`.
  로컬 키 기준 45초 창은 사람이 팝업을 승인하기에 짧다.
- **결정**: `continueWithWallet`는 `subscriptionLeadSeconds`를 최소 90초로 올린다(`WALLET_MIN_SUBSCRIPTION_LEAD_SECONDS`).
  예치가 `tecEXPIRED`로 실패하면 단계 레일에 "Vault 다시 만들기(예치 창 120초)" 복구 버튼을 노출하고,
  `restartFromVaultCreate()`가 리드를 max(2배, 120초)로 올려 VaultCreate부터 다시 진행한다(계정·서명자 유지).
- **대가**: 지갑 경로의 총 소요가 45~75초 늘어 5분 예산을 넘길 수 있다. 발표 전 리허설로 실제 팝업 승인 시간을 재고
  리드를 조정한다.

## D19. 지갑 레이어를 `xrpl-connect` 0.8.2로 교체한다 (확정)

- **왜**: D17이 기록한 문제(두 SDK의 타입 선언과 브라우저 런타임 형태 불일치)를 앱이 직접 떠안고
  있었다. `crossmarkSdk.ts` / `gemwalletApi.ts`의 리졸버, 지갑별 서명 어댑터 2개, 탐침 2개를 앱이
  유지해야 했고 지갑이 하나 늘 때마다 같은 양이 늘어난다. `xrpl-connect`는 어댑터 등록·설치 감지·
  연결 모달·서명을 하나의 `WalletManager`로 묶어 제공하므로 그 표면을 라이브러리로 옮긴다.
- **제거**: `src/wallet/crossmark.ts`, `gemwallet.ts`, `crossmarkSdk.ts`, `gemwalletApi.ts`,
  `probe.ts`. 의존성 `@crossmarkio/sdk`, `@gemwallet/api`도 `package.json`에서 뺐다
  (두 SDK는 `xrpl-connect` 번들 안에 들어 있다).
- **추가**: `src/wallet/xrplConnect.ts`(단일 `WalletManager` + `Signer` 어댑터),
  `src/wallet/xrpl-connect.d.ts`(수기 타입 선언).

### 관측한 모듈 형태 (Vite dev + headless Chromium, 2026-09-11)

D17과 달리 **named export가 런타임에서 그대로 실값**이었다. 리졸버 shim이 필요 없다.

```
typeof WalletManager    === 'function'   typeof CrossmarkAdapter === 'function'
typeof GemWalletAdapter === 'function'   typeof isWalletError    === 'function'
typeof STANDARD_NETWORKS=== 'object'     default export          === undefined
new CrossmarkAdapter().id === 'crossmark'   new GemWalletAdapter().id === 'gemwallet'
STANDARD_NETWORKS.devnet === { id:'devnet', name:'Devnet', wss:'wss://s.devnet.rippletest.net:51233/', … }
typeof customElements.get('xrpl-wallet-connector') === 'function'  // import 시점에 자체 등록
export 개수 52개, page error / console error 0건
```

- **다만 타입 선언은 없다.** README는 "Full TypeScript support"라고 쓰지만 패키지에는 `.d.ts`가
  한 개도 없고 `types` 필드도 없다(`xrpl-connect.mjs`, `xrpl-connect.umd.js`, 청크 2개, `package.json`뿐).
  그래서 번들(`index-BUfllfzr.mjs`, 난독화되지 않아 원본 JSDoc이 남아 있다)을 읽어
  `src/wallet/xrpl-connect.d.ts`를 직접 작성했다. 각 선언 옆에 근거 줄 번호를 남겼다.

### 사용한 API

`new WalletManager({ adapters:[new CrossmarkAdapter(), new GemWalletAdapter()], network: DEVNET_NETWORK, autoConnect:false })`,
`manager.wallets`, `adapter.isAvailable()`, `manager.connect(walletId, { network })`,
`manager.account` / `manager.wallet` / `manager.connected`, `manager.on/off('connect')`,
`manager.disconnect()`, `manager.sign(tx)`, `isWalletError(e)` + `WalletError.code`,
그리고 web component `<xrpl-wallet-connector>`의 `setWalletManager()` / `open()` / `close()`와
`close` 이벤트. Xaman 어댑터는 **등록하지 않는다** — `XamanAdapter`는 apiKey 없이는
`CONNECTION_FAILED("API key is required for Xaman")`을 던진다.

- 서명은 항상 `manager.sign(tx)`만 쓴다(`signAndSubmit` 금지). 제출 관문은 `src/xrpl/submit.ts` 하나로 유지된다.
- 두 확장 어댑터 모두 `sign()`이 **`{ hash: '', tx_blob }`**을 돌려준다. hash가 빈 문자열이므로
  `hashes.hashSignedTx(tx_blob)`로 직접 파생한다 → `SignOutcome`은 `{mode:'blob', txBlob, hash}`.
  `mode:'submitted'` 분기는 blob 없이 hash만 주는 어댑터를 위해 남겨 뒀다.
- 오류는 `WalletErrorCode`로 분기한다: `SIGN_REJECTED`/`CONNECTION_REJECTED`→`rejected`,
  `WALLET_NOT_*`/`NOT_CONNECTED`/`CONNECTION_FAILED`→`unavailable`,
  `UNSUPPORTED_METHOD`/`NETWORK_*`→`unsupported`, `SIGN_FAILED`(어댑터의 포괄 코드)는 메시지에
  reject/denied/cancel이 없으면 `unsupported`. 30초 무응답은 기존대로 `Promise.race` 타이머로 `timeout`.

### 라이브러리가 주지 못한 것

1. **지갑의 실제 네트워크를 읽지 못한다.** `CrossmarkAdapter.connect()` / `GemWalletAdapter.connect()`는
   `account.network = resolveNetwork(options.network)`, 즉 **우리가 설정한 네트워크를 되돌려줄 뿐**이고
   확장이 실제로 어느 네트워크에 있는지 조회하지 않는다(`adapter.getNetwork()`도 이 값을 반환한다).
   그래서 devnet 판정(`isDevnetNetwork`: wss 호스트 `devnet.rippletest.net` 또는 id/name에 'devnet')은
   "앱이 devnet을 요청했다"만 증명한다. 삭제된 `probe.ts`는 Crossmark `session.network`와 GemWallet
   `getNetwork()`로 진짜 네트워크를 읽었으므로 **이 한 가지는 기능 후퇴**다. 다른 네트워크의 지갑은
   서명·제출 실패로 드러나고, 기존 1회 강등(`downgradeDepositorOnce`)이 그대로 받아낸다.
2. **모달에 키보드 닫기가 없다.** 번들 어디에도 `keydown`이 없어 Escape로 닫히지 않는다.
   `connectWallet()`이 모달을 열 때 `document`에 Escape 핸들러를 붙여 `element.close()`를 부른다.
   (없으면 Escape를 누른 사용자가 열린 모달과 비활성 버튼 앞에 갇힌다. 실측으로 확인했다.)
3. **설치 감지가 즉시 참이 되지 않는다.** Crossmark 어댑터의 `isAvailable()`은 번들된 SDK의
   `Mount.isDetected`를 읽는데, 이 값은 `window.xrpl.isCrossmark`를 500ms 주기로 도는 루프가 채운다.
   그래서 `probeWallets()`는 3초/250ms로 짧게 폴링한 뒤에야 "확장 없음"을 결론짓는다.

### 바뀌지 않은 것

- `Signer` / `SignerProvider` / `SignOutcome` / `SignRejectedError`(동결, `docs/interfaces-frozen.md` §1),
  localKeypair 서명자, depositor = 지갑(연결 시) / localKeypair(그 외), `downgradeDepositorOnce`,
  `freeze`, D18의 90초 예치 리드와 `restartFromVaultCreate`(예치 창 120초) 복구.
- **확장이 XLS-65/66 트랜잭션을 서명할 수 있는지는 이 교체로 전혀 달라지지 않는다.** 라이브러리는
  tx를 그대로 확장에 넘길 뿐이다. D17·D18에서 본 Crossmark의 VaultDeposit 서명 가부와 그 뒤의
  `tecEXPIRED` 위험은 동일하게 남아 있고, 판정 시점도 그대로 예치 단계다.

### 검증 (2026-09-11)

- `npm run typecheck`, `npm test`(7 파일 143건), `npm run build` 모두 통과. `oxlint`는 기존 경고 1건뿐.
- headless Chromium, 확장 없음: 탐침 화면이 "확장 없음"으로 뜨고 "지갑 연결"이 모달을 열어
  Crossmark·GemWallet을 나열한다. page error·console error 0건.
- 같은 브라우저에 `window.xrpl = { isCrossmark: true }`만 주입: 탐침이 "확장 발견 · 미연결 / Crossmark"로
  바뀌고 모달이 Crossmark를 사용 가능 지갑으로 나열한다. 오류 0건.
- "지갑 없이 계속" 경로로 devnet 실행: VaultCreate `5CDB…81F4`, VaultDeposit `A88F…30D6`,
  LoanBrokerSet `0486…69FA` 모두 `tesSUCCESS`.

## D20. 지갑 경로를 제거한다 — 확장이 XLS-65/66을 서명하지 못한다 (확정, 2026-09-11)

- **결정**: 브라우저 확장 지갑 경로를 **삭제한다**. Depositor·Broker·Borrower **세 역할 모두**
  faucet 계정의 localKeypair로 서명한다. D17·D18·D19가 쌓아 올린 지갑 레이어는 전부 걷어낸다.
- **근거**: Crossmark가 `VaultDeposit`을 **인코딩 단계에서** 거절했다.
  `Invalid field TransactionType: VaultDeposit`. 확장이 번들한 `ripple-binary-codec`의
  `definitions.json`에 XLS-65/66 트랜잭션 타입이 없기 때문이며, 앱이 고칠 수 있는 문제가 아니다.
  D19가 "확장이 XLS-65/66을 서명할 수 있는지는 라이브러리 교체로 달라지지 않는다"고 적어 둔
  그 지점이 실제로 막힌 것이다. 지갑은 이 데모의 어느 단계도 서명할 수 없다.
- **제거한 것**
  - `src/wallet/xrplConnect.ts`, `src/wallet/xrpl-connect.d.ts`,
    `src/wallet/__tests__/xrplConnect.test.ts`, `src/ui/screens/WalletProbe.tsx`
  - 의존성 `xrpl-connect`
  - 화면: 지갑 탐침 인터스티셜(`screen: 'probe'`), `?screen=walletProbe` 더미,
    `toWalletProbeVM` / `WalletProbeVM`
  - 스토어: `probeBusy` / `probeResults` / `chosenProbe`,
    `connectWallet` / `continueWithWallet` / `continueWithoutWallet`,
    `maybeDowngradeDepositor`, `DepositorInfo.fallback` / `fallbackAddress`
  - `WALLET_MIN_SUBSCRIPTION_LEAD_SECONDS` (D18의 90초 상향). `subscriptionLeadSeconds`는
    기본 45초로 되돌아간다 — 로컬 키는 즉시 서명하므로 사람이 팝업을 승인할 시간이 필요 없다.
- **남긴 것**
  - `src/wallet/types.ts`의 `Signer` / `SignerProvider` / `SignOutcome` / `SignRejectedError`는
    **동결 계약이라 그대로**다. `SignerProvider.downgradeDepositorOnce`는 강등할 대상이 없으므로
    `'no wallet path'` 예외를 던진다(`nodeProvider.ts`와 같은 모양). 조용한 no-op으로 두면
    지갑 경로가 아직 있다고 믿는 호출부를 숨기게 된다.
  - `ScenarioCtx.fallbackDepositor`도 동결 계약이라 필드는 남기되 depositor 계정 자신을 가리킨다.
  - `restartFromVaultCreate()`(예치 창 120초)는 유지한다. 발표자가 단계 사이에서 지체해
    `SubscriptionDate`를 넘기는 경우가 여전히 있다.
  - `RailFooterVM.kind === 'signing'` / `StageExtraVM.kind === 'walletPopup'` 타입과
    `?screen=step3signing` 목업은 14개 화면 보존을 위해 남지만 **실행 중에는 절대 나오지 않는다**.
- **파급**: AC3(1회 강등 + fallback 배지)은 **삭제**한다. 계획서 6절에 표시했다.
  RoleCards의 예금자 배지는 언제나 `AUTO`다. 계정은 3개(depositor / broker / borrower)뿐이고
  faucet 이름도 `depositorLocal` → `depositor`로 바꿨다(`SETUP_ACCOUNT_NAMES`).
- **되돌릴 조건**: 확장이 번들하는 codec이 XLS-65/66 트랜잭션 타입을 싣는 날. 그때 D19가 기록한
  `xrpl-connect` 어댑터 구조를 그대로 복원하면 된다.
- **대안(보류)**: 지갑이 Vault tx를 서명하지 못해도 **일반 `Payment`는 서명할 수 있다.**
  발표에서 지갑을 꼭 보여줘야 한다면 "지갑이 데모용 depositor 계정에 XRP를 보내 자금을 대는"
  Payment 한 건만 지갑 서명으로 처리하는 방법이 남아 있다. 이번에는 넣지 않는다.

## D21. 시나리오 A에 LoanBrokerCoverWithdraw 단계 추가 (확정)

- **결정**: A는 `loanPay` 뒤, `vaultWithdraw` 앞에 `coverWithdraw`를 둔다(8단계). Broker가 상환 완료 후 cover 전액을 회수해
  "Broker는 담보를 걸고 심사 책임을 지며, 손실이 없으면 담보를 돌려받는다"는 이야기를 완결한다.
- **금액**: build 시점에 `ledger_entry`로 읽은 `CoverAvailable` 전액. `DebtTotal !== 0`이면 build에서 즉시 실패한다
  (rippled 조건 `CoverAvailable − Amount ≥ DebtTotal × CoverRateMinimum`).
- **이유**: 데모의 `ManagementFeeRate`가 0이라 Broker 수입이 화면에 보이지 않는데, cover 회수가 Broker 관점의 유일한 "돌아오는 돈"이다.

## D22. VaultDeposit에 마감 게이트, 기본 예치 창 75초 (확정)

- **실측**: 지갑 경로를 뺀 뒤에도 발표자가 화면을 읽고 누르는 데 2분 넘게 걸려 VaultDeposit이 SubscriptionDate 83초 뒤 검증되어
  `tecEXPIRED` (`BF58…3F37`). 45초는 자동 서명 기준 값이었다.
- **결정**: (1) `stepVaultDeposit.gate()`가 `deadlineRipple = SubscriptionDate`를 반환하고, UI는 버튼에 "마감 m:ss" 카운트다운을
  붙이며(15초 이하 강조), 검증된 close time이 마감을 넘기면 트랜잭션을 제출하지 않고 "Vault 다시 만들기(예치 창 2배, 최소 120초)"만 제공한다.
  (2) `subscriptionLeadSeconds` 기본값 45 → 75. 1회 완주는 약 4분 25초 → 약 4분 55초.
- **대가**: AC4의 5분 여유가 수 초로 줄어든다. 발표자는 Vault 생성 직후 예치 버튼을 바로 누르는 리허설이 필요하다.

## D23. LoanSet 마감 게이트, 투자 기간 기본 240초 (확정)

- **실측**: 발표자가 Investment 개시 후 약 2분 뒤 LoanSet을 눌러 `tecNO_PERMISSION` 2회 (`C85F…B219`, `6C6D…F618`).
  D9의 규칙 `StartDate + PaymentInterval × PaymentTotal + 60 ≤ RedemptionDate` 때문에 180초 투자 기간에서는
  LoanSet 창이 Investment 개시 후 **60초**뿐이었다.
- **결정**: (1) `stepLoanSet.gate()`가 `deadlineRipple = RedemptionDate − (PaymentInterval × PaymentTotal + 60) − 8`을 함께 반환한다.
  UI는 버튼에 "마감 m:ss"를 붙이고, 원장 시각 패널에 "대출 실행 마감까지"를 추가하며, 마감이 지나면 제출 대신
  "Vault 다시 만들기"(예치 창은 유지)를 제공한다. (2) `investmentPeriodSeconds` 기본값 180 → 240으로 LoanSet 창을 120초로 넓힌다.
- **대가**: 1회 완주 약 5분 55초. AC4(5분)를 넘긴다. 발표자가 빠르면 파라미터에서 180으로 되돌려 4분 55초로 줄일 수 있다.

## D24. Vault 재생성 복구 시 객체 id와 단계 객체를 초기화한다 (확정)

- **실측**: 예치 마감 경과 → "Vault 다시 만들기" → VaultCreate가 온체인에서는 성공했지만 앱은
  `vault id already set to …, refusing to overwrite`로 단계를 실패 처리했다(`setId`의 덮어쓰기 금지).
- **결정**: `restartFromVaultCreate()`가 `ctx.ids = {}`, `snapshot`/`prevSnapshot` 초기화, VaultCreate 이후 단계 객체를
  `buildScenarioA/B()`로 새로 만들어 교체한다(클로저에 남은 스케줄·LoanSequence 제거). 재현 검증: 재생성 후 예치 `tesSUCCESS`.
