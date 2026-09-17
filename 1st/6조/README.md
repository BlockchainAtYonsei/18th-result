# 6조 Sixth Sense: Lending Protocol의 신뢰 기반, 취약점, 방어 레이어

한 줄 소개: Lending Protocol 사고 여섯 건을 오라클 가격과 심사자 판단이라는 두 신뢰 지점으로 정리하고, 다음 세대 상품(Morpho Midnight, XLS-65/66)이 그 취약점을 상속함을 보인 뒤, 방어 레이어 가운데 LoanBroker 하네스를 XLS-65/66의 EVM 포크 위에 구현했다.

## 팀원과 역할

- 최현수(팀장): 프레이밍, 아티클 1장·4장·마치며, 신용대출(Maple v1, XLS-65/66), 전체 편집, 그림, 발표 자료
- 노제희: 담보대출 사고 사례 조사(Blizz/Venus, Mango, Aave 10·10, MAMO, TONIC), 2장·3.1 1차 자료
- 유태연: Morpho Midnight 조사, 3.2 1차 자료, `xls6566-evm` 구현(Vault·LoanBroker·Harness, Foundry 테스트 50건, Sepolia 배포·데모)
- 윤민섭: `xls65-66-evm` 구현(기준 LoanBroker / Harness LoanBroker 이중 경로, 프론트엔드)
- 최재민: XLS-65/66 Lending 데모

## 결과물

- 리서치 아티클: https://www.notion.so/3d68f1ec11b48040b094e4aa39df8692
- 프로젝트 진행 보고서: https://www.notion.so/3de8f1ec11b4813b8e65ede25a589332
- 발표 자료: `<TBD>`
- 배포된 데모: https://jaesimin0903.github.io/xls6566-lending-demo/ , https://xls6566-evm.vercel.app/
- 원본 저장소:
  - https://github.com/YoonMin02/xls65-66-evm
  - https://github.com/xodus0721/xls6566-evm
  - https://github.com/jaesimin0903/xls6566-lending-demo

## 배포된 컨트랙트

두 EVM 구현 모두 고정 주소 파일이 없다. `xls65-66-evm`에는 `public/deployment.json`이 없고, 프론트가 Sepolia에서 비교용 Vault/Broker를 브라우저마다 새로 배포한다. `xls6566-evm`도 데모 앱이 Sepolia에 컨트랙트를 배포하며 `docs/`, `app/`, README에 고정 Sepolia 주소가 없다. `lending-demo`는 XRPL Devnet 네이티브 트랜잭션 데모라 EVM 주소가 없다.

| 구현 | 네트워크 | 컨트랙트 | 주소 |
| --- | --- | --- | --- |
| `xls65-66-evm` | Sepolia | MockUSDC | `<TBD>` (브라우저 배포) |
| `xls65-66-evm` | Sepolia | XLS65Vault (baseline / harness) | `<TBD>` (브라우저 배포) |
| `xls65-66-evm` | Sepolia | XLS66LoanBroker | `<TBD>` (브라우저 배포) |
| `xls65-66-evm` | Sepolia | XLS66LoanBrokerHarness | `<TBD>` (브라우저 배포) |
| `xls6566-evm` | Sepolia | DemoUSD (dUSD) | `<TBD>` (브라우저 배포) |
| `xls6566-evm` | Sepolia | Vault | `<TBD>` (브라우저 배포) |
| `xls6566-evm` | Sepolia | LoanBroker | `<TBD>` (브라우저 배포) |
| `xls6566-evm` | Sepolia | LoanBrokerHarness | `<TBD>` (브라우저 배포) |

공개 RPC: `https://ethereum-sepolia-rpc.publicnode.com` (`xls65-66-evm`), API 키가 없는 공개 엔드포인트만 사용한다.

## 폴더 구성

- `xls65-66-evm/` : XLS-65 Vault + 기준 브로커 / 하네스 브로커 비교 구현 (Foundry + 프론트)
- `xls6566-evm/` : ERC-4626 Vault + EIP-712 LoanBroker + LoanBrokerHarness, 시나리오 A~D, React 데모
- `lending-demo/` : 브라우저 데모 소스 (XRPL Devnet)

## 실행

각 하위 폴더 README 참조. 공통: Foundry, Node 20+. `forge install` 후 `forge test`.

```bash
# xls65-66-evm
cd xls65-66-evm
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-commit
forge install foundry-rs/forge-std --no-commit
forge test
cd frontend && npm ci && npm run dev

# xls6566-evm
cd xls6566-evm
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-commit
forge test
cd app && npm install && npm run dev

# lending-demo
cd lending-demo
npm install
npm run dev
```
