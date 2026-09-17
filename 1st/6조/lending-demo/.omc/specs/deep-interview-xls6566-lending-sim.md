# Spec: XLS-65/66 Lending & Exploit Demo (XRPL Devnet)

## Metadata
- interview_id: di-xls6566-20260911
- project_type: greenfield
- rounds: 6 (Round 0 topology + 6 scoring rounds)
- final_ambiguity: 15% (threshold 20%, source: default)
- date: 2026-09-11
- status: pending approval

## Goal (one sentence)
발표용 웹앱: XRPL Devnet에서 XLS-65 Vault + XLS-66 Lending 네이티브 트랜잭션을 실제로 제출하며, 정상 렌딩 흐름과 "차입자 default → Broker first-loss cover 소진 → Vault 예금자 손실" 시나리오를 단계별 tx 해시와 온체인 잔액 변화로 증명한다.

## Topology (Round 0 confirmed, 5 active, 0 deferred)
1. **protocol-sim → xrpl-client**: xrpl.js(≥5.1.0) 기반 devnet 클라이언트 레이어. Vault/LoanBroker/Loan tx 빌드·서명·제출, ledger 오브젝트 조회(vault_info, ledger_entry).
2. **lending-scenario**: 정상 흐름 스텝 시퀀스.
3. **exploit-scenario**: default 손실 스텝 시퀀스.
4. **web-ui**: 시나리오 선택, 단계 진행 버튼, 역할별 계정 카드, tx 로그, Vault/Broker/Loan 상태 패널.
5. **xrpl-integration**: 지갑 연결(Crossmark/GemWallet) + faucet 계정 자동 생성 + fallback 자동서명.

## Decisions (from interview)
| Round | Decision |
|---|---|
| R1 | 렌딩 로직은 devnet 네이티브 amendment(SingleAssetVault, LendingProtocol). 스마트 컨트랙트 없음 |
| R2 | Exploit = 차입자 default → cover 소진 → 예금자 share 가치 희석. 다른 exploit 유형은 범위 밖 |
| R3/R5 | 발표자는 **예금자** 역할로 Crossmark 또는 GemWallet 서명. Broker/차입자는 앱이 faucet 계정으로 자동 서명 |
| R4 | 성공 기준은 발표 데모: 단계마다 실제 tx 해시, 마지막에 온체인 잔액으로 예금자 손실 증명 |
| R6 | Vite + React SPA, 백엔드 없음, faucet 키는 브라우저 메모리에만. 지갑이 Vault/Loan tx를 서명 못 하면 예금자도 앱 자동서명 fallback + 화면에 표시 |

## Verified Facts (research, 2026-09)
- Devnet에 두 amendment 모두 활성. 엔드포인트 `wss://s.devnet.rippletest.net:51233`, faucet `https://faucet.devnet.rippletest.net/accounts`. Mainnet 미활성(투표 중).
- Tx types: VaultCreate/Set/Delete/Deposit/Withdraw/Clawback; LoanBrokerSet/Delete/CoverDeposit/CoverWithdraw/CoverClawback; LoanSet/Delete/Manage/Pay.
- LoanSet은 borrower + broker owner 상호서명 필요. xrpl.js 4.6.0+ `signLoanSetByCounterparty`, `combineLoanSetCounterpartySigners`.
- LoanManage 플래그 tfLoanDefault로 default 처리. LoanPay 플래그 tfLoanFullPayment 등.
- 경제 공식(원문 재대조 필요):
  - LoanSet 실패: `CoverAvailable < (DebtTotal + Principal + InterestDue) × CoverRateMinimum`
  - Default: `DefaultAmount = PrincipalOutstanding + InterestOutstanding`, `DefaultCovered = min(DebtTotal × CoverRateMinimum × CoverRateLiquidation, DefaultAmount[, CoverAvailable?])`, `VaultLoss = DefaultAmount − DefaultCovered`
  - Vault 반영: default 시 `AssetsTotal −= VaultLoss`, `AssetsAvailable += DefaultCovered` → 예금자 share 가치 희석.

## Unverified / Risks
- (a) Crossmark/GemWallet이 Vault/Loan tx type 서명 가능한지 미확인 → fallback 자동서명 필수 구현.
- (b) 공개 devnet explorer에서 Vault/Loan 오브젝트 표시 여부 미확인 → 앱 내 "tx 결과 패널"이 1차 증명 수단. `https://devnet.xrpl.org/transactions/{hash}` 링크는 구현 시 동작 확인 후 노출.
- (c) default 공식의 CoverAvailable 상한 포함 여부 → 구현 시 실제 devnet 결과값(ledger_entry)으로 화면 표시하고, 앱은 공식 재계산 대신 온체인 값을 우선 표시.
- (d) 시나리오가 NextPaymentDueDate 경과를 요구하면 GracePeriod/PaymentInterval을 최소값으로 설정해 데모 시간 내 default 가능하게 함. 불가하면 tfLoanImpair 등 대안 확인.

## Scenarios
### A. 정상 렌딩 (lending-scenario)
1. Setup: faucet으로 Broker/Borrower 계정 생성, 예금자는 지갑 연결(또는 faucet fallback). 자산은 XRP.
2. Broker: VaultCreate (Asset=XRP)
3. Depositor: VaultDeposit (예: 1,000 XRP) → share 수령
4. Broker: LoanBrokerSet (VaultID, CoverRateMinimum, CoverRateLiquidation, ManagementFeeRate)
5. Broker: LoanBrokerCoverDeposit (예: 100 XRP)
6. Borrower+Broker: LoanSet 상호서명 (예: 500 XRP 원금, 짧은 기간)
7. Borrower: LoanPay (tfLoanFullPayment)
8. Depositor: VaultWithdraw → 예치금 + 이자 수령. 잔액 증가 확인

### B. Exploit: default → 예금자 손실 (exploit-scenario)
1~6 동일하되 cover를 최소 허용치로, 원금은 cover 대비 크게 설정.
7. (기한 경과 또는 impair) Broker: LoanManage tfLoanDefault
8. 상태 패널: Vault AssetsTotal 감소, LoanBroker CoverAvailable 소진, VaultLoss 표시
9. Depositor: VaultWithdraw → 예치금보다 적게 수령. 지갑 잔액으로 손실 증명

## UI Requirements
- 좌: 시나리오 선택(A/B) + 단계 리스트(현재 단계 강조, "다음 단계" 버튼 하나로 진행)
- 중: 역할 카드 3개(Depositor/Broker/Borrower): 주소, XRP 잔액, share 잔액, 서명 방식(지갑/자동)
- 우: Vault·LoanBroker·Loan 오브젝트 라이브 상태(AssetsTotal, AssetsAvailable, CoverAvailable, DebtTotal, PrincipalOutstanding 등)
- 하: tx 로그(타입, 해시, 결과 코드, explorer 링크)
- 각 단계 파라미터(금액, cover rate)는 편집 가능하되 기본값 제공
- 오류(tec/tem 코드)는 원문 그대로 표시

## Acceptance Criteria
1. 시나리오 A를 끝까지 실행하면 8개 단계 모두 `tesSUCCESS` 해시가 tx 로그에 남고, 예금자 최종 XRP 잔액 > 예치 전 잔액(수수료 제외).
2. 시나리오 B를 끝까지 실행하면 LoanManage(tfLoanDefault)가 `tesSUCCESS`이고, Vault AssetsTotal이 default 전보다 감소하며, 예금자 VaultWithdraw 수령액 < 예치액.
3. 지갑 서명 실패 시 앱이 자동서명으로 계속 진행하고 UI에 "fallback 자동서명" 배지 표시.
4. 페이지 새로고침 없이 처음부터 끝까지 진행 가능. 총 소요 5분 이내(ledger close 대기 포함).
5. xrpl.js 버전 ≥ 5.1.0, `npm run build` 성공.

## Non-goals
- 다른 exploit 유형(share 가격 조작, 악의적 broker 등), 백엔드, 배포, mainnet/testnet, 멀티자산(IOU/MPT), 상태 영속화.

## Ontology (final, stability 1.0)
Vault, LoanBroker, Loan, Depositor, Borrower, Scenario(Step), DevnetAccount, FirstLossCover, Share, Default, Wallet, TxRecord(hash/explorer).

## Proposed execution path
1. `npm create vite` (React + TS), xrpl ≥5.1.0 설치, devnet 연결 smoke test
2. xrpl-client 레이어: 계정 생성, Vault/Broker/Loan tx 빌더, 상태 조회
3. 시나리오 A CLI-level 스크립트로 devnet 검증 (UI 전에 프로토콜 사실 확정)
4. 시나리오 B 검증 (default 타이밍 문제 해결)
5. UI 구현 + 지갑 연동/fallback
6. 인수 기준 1~5 검증

## Simulation Method (confirmed 2026-09-11)
- 자산: XRP. 계정: Depositor(지갑, fallback 자동서명), Broker(faucet), Borrower(faucet).
- 대출 파라미터: PaymentInterval=60s, GracePeriod=60s, PaymentTotal=1 (스펙 최소값). LoanSet 후 약 120s 경과 시 tfLoanDefault 가능.
- Exploit 시나리오는 LoanSet 직후 LoanManage(tfLoanImpair)로 LossUnrealized를 먼저 표시하고, 카운트다운 종료 후 LoanManage(tfLoanDefault).
- 단계 진행: 한 단계씩 수동 클릭 (자동 재생 없음).
- A/B 시나리오는 각각 독립 실행 (매번 새 Vault/Broker).
- 기본 수치: 예치 1,000 XRP / cover 50 XRP / 대출 500 XRP / CoverRateMinimum 10% / CoverRateLiquidation 100% / InterestRate 10%.
  - B 기대값: DefaultAmount≈500+이자, DefaultCovered=min(50×100%, DefaultAmount, 50)=50, VaultLoss≈450+이자.
- 스펙 원문 확인: tfLoanDefault 조건 `now > NextPaymentDueDate + GracePeriod`, DefaultCovered = min(MinimumCover×CoverRateLiquidation, DefaultAmount, CoverAvailable).

## UX Flow Document
- https://claude.ai/code/artifact/d88b4fa6-472f-4bf7-9d02-494e749f6a6b (2026-09-11)
- UI 목업 캔버스: https://claude.ai/code/artifact/6b7c2913-16dd-4309-9eba-e3c06d833416 (2026-09-11, 4화면, 중앙 자금 흐름 애니메이션 스테이지)

## 구현 중 실측으로 갱신된 사실 (2026-09-11, devnet rippled 3.4.0-rc3)
- amendment `SingleAssetVault`, `LendingProtocol`, `LendingProtocolV1_1` 활성. faucet 계정당 100 XRP → 금액 재스케일: 예치 78 / 대출 39 / cover 6 XRP.
- Vault는 closed-ended 고정: Subscription(예치) → Investment(대출, 최소 180초) → Redemption(출금). 1회 완주 약 4분.
- Impair는 연체(NextPaymentDueDate 경과) 후에만 가능하고 기한을 당기지 않음. LoanSet → 60초 → Impair → 60초 → Default.
- 시나리오 B 실측: Default 시 cover 3.9 소진, Vault AssetsTotal 78 → 42.9, 예금자 회수 42.9 (손실 35.1, 45%).
- 60초 대출 이자는 0.000008 XRP 수준이라 AC1은 share 상환 가치 기준(B)으로 판정 예정.
- xrpl.js 5.1.0은 closed-ended Vault 필드를 인코딩하지 못해 5.2.0-beta.0 사용. `signLoanSetByCounterparty` 버그로 상호서명은 직접 구현.
- 요율 스케일 1/10 bp (100000 = 100%). explorer 링크 `https://devnet.xrpl.org/transactions/{hash}` 형식 사용.
