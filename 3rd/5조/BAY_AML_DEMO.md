# BAY AML Demo — 근거가 남는 동결 (ReasonedFreeze)

ERC-3643 공식 구현 위에 얇은 래퍼 컨트랙트 하나를 추가해, 지갑 동결마다
사유 코드, 근거 해시, 운영자, 만료 시점을 남기고 만료 후에는 누구나 해제할 수 있게 한 데모다.
위험 판단은 하지 않으며, 판단은 테스트 시나리오에서 운영자가 입력한다.

## 기준

- 저장소: https://github.com/ERC-3643/ERC-3643
- 커밋: `2f0704dee9658ad9cd5b6ed82e7427da74c28345` (패키지 버전 4.1.3)
- Solidity 0.8.17, Hardhat (저장소 설정 그대로)
- 이 저장소는 위 커밋에서 포크했고, 데모 코드는 `bay-aml-demo` 브랜치에 있다.

## 추가한 파일

| 파일 | 내용 |
|---|---|
| `contracts/aml/ReasonedFreeze.sol` | 동결 래퍼 컨트랙트 |
| `test/aml/reasoned-freeze.test.ts` | 실험 1~4와 한계 테스트 (11개) |

## 실행

```bash
git clone https://github.com/lejuho/bay-aml-demo.git
cd bay-aml-demo
git switch bay-aml-demo
npm install
npx hardhat test test/aml/reasoned-freeze.test.ts
```

## 계정

| 역할 | fixture 계정 | 상태 |
|---|---|---|
| 운영자 | `tokenAgent` | 토큰 Agent, ReasonedFreeze 운영자 |
| 사용자 A | `aliceWallet` | 신원 등록, 1000 토큰 |
| 사용자 B | `bobWallet` | 신원 등록, 500 토큰, 동결 대상 |
| 사용자 C | `charlieWallet` | 미등록 |

## 테스트가 확인하는 것

| 실험 | 기대 |
|---|---|
| 1. 등록 여부 | A→B 성공, A→C는 `Transfer not possible`로 실패 |
| 2. 동결과 해제 | 동결 시 사유·근거·만료 기록, A→B와 B→A가 `wallet is frozen`으로 실패, 운영자 해제 후 재개, 기록 유지 |
| 3. 거부되는 조치 | 근거 없는 동결, 기한 없는 동결, 30일 초과 동결, 무권한 동결·해제 |
| 4. 만료 | 만료 전 해제 불가, 만료 후 당사자가 직접 해제, 연장에는 새 근거 필요 |
| 한계 | `forcedTransfer`는 동결을 우회, 래퍼를 거치지 않는 토큰 직접 동결은 기록 없이 집행 |

## 한계

- 만료 해제는 자동 실행이 아니다. 만료 후 누군가 `releaseExpired`를 호출해야 한다.
- 근거 해시는 문서의 존재만 고정한다. 근거의 타당성은 검증하지 않는다.
- ERC-3643 v4의 Agent 권한은 세분화되어 있지 않다. 래퍼도 Agent로 등록되므로 토큰의 다른 Agent 기능을 호출할 권한을 갖지만, 코드상 `setAddressFrozen`만 호출한다.
- 다른 Agent가 토큰에 직접 접근하는 경로는 래퍼로 막을 수 없다.
