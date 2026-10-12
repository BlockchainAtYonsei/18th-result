# Moa Contracts

Moa의 네이티브 자산용 3-of-5 멀티시그 계좌 구현입니다.

## 구성

- `MoaFactory`: 다섯 Owner로 새 공동계좌 생성 및 Owner별 계좌 인덱싱
- `MoaAccount`: 입금, 지출 제안, 승인, 취소, Intent 검증 및 실행
- `mocks/ExecutionTarget`: 실행 성공·실패 테스트용 컨트랙트

## 상태 전이

```text
Pending ── executeProposal ──> Executed
   │
   └──── cancelProposal ─────> Cancelled
```

- 제안 생성자는 자동 승인되지 않음
- 서로 다른 Owner 세 명의 승인 필요
- 실행 및 취소가 끝난 제안은 다시 승인하거나 실행할 수 없음
- 취소는 Pending 상태에서 제안자만 가능

## Intent 검증

제안 생성 시 다음 값을 묶어 `intentHash`로 저장합니다.

```text
account address
chain ID
proposal ID
target
value
keccak256(data)
```

실행 시 전달받은 `target`, `value`, `data`로 해시를 다시 계산합니다. 승인된 해시와 다르면 `IntentMismatch`로 실행을 차단합니다.

## 주요 함수

### MoaFactory

- `createAccount(address[5] owners)`: 호출자를 포함하는 5인 공동계좌 생성
- `accountsOf(address owner)`: Owner가 참여하는 계좌 목록 조회
- `accountAt(uint256 index)`: 생성 순서 기준 계좌 조회

### MoaAccount

- `createProposal(address target, uint256 value, bytes data)`: 지출 Intent 생성
- `approveProposal(uint256 proposalId)`: Owner 승인 기록
- `executeProposal(uint256 proposalId, address target, uint256 value, bytes data)`: 승인 수와 Intent를 검증한 후 실행
- `cancelProposal(uint256 proposalId)`: 제안자가 Pending 제안 취소
- `getProposal(uint256 proposalId)`: 제안 상세 조회
- `hasApproved(uint256 proposalId, address owner)`: Owner 승인 여부 조회

## 검증

저장소 루트에서 다음 명령을 실행합니다.

```bash
pnpm contracts:compile
pnpm contracts:typecheck
pnpm contracts:test
```

## Sepolia 설정

Sepolia 배포 설정은 비밀값을 소스에 저장하지 않고 Hardhat Keystore에서 읽습니다.

- `SEPOLIA_RPC_URL`: Sepolia RPC 공급자가 발급한 HTTPS URL
- `SEPOLIA_PRIVATE_KEY`: Sepolia 배포 전용 MetaMask 계정의 개인키

개인키는 저장소, `.env`, 채팅에 기록하지 않습니다. 실제 값은 배포 준비 단계에서 다음 명령으로 로컬 Keystore에 입력합니다.

```bash
cd contracts
pnpm hardhat keystore set SEPOLIA_RPC_URL
pnpm hardhat keystore set SEPOLIA_PRIVATE_KEY
```

Sepolia 네트워크 설정값은 다음과 같습니다.

- Chain ID: `11155111`
- 통화 기호: `ETH`
- 블록 탐색기: `https://sepolia.etherscan.io`

## 배포

`MoaFactory`는 Hardhat Ignition 모듈로 배포합니다. 실제 네트워크에 배포하기 전에 인메모리 로컬 네트워크에서 전체 배포 과정을 검증합니다.

```bash
# 저장소 루트
pnpm contracts:deploy:local

# Sepolia
pnpm contracts:deploy:sepolia
```

로컬 배포 주소는 실행이 끝나면 사라지는 테스트 주소입니다.

### Sepolia 배포 정보

- 네트워크: Ethereum Sepolia (`11155111`)
- `MoaFactory`: [`0x33d4123ac88792CFe81A8Ae818760C8008d29747`](https://sepolia.etherscan.io/address/0x33d4123ac88792CFe81A8Ae818760C8008d29747)
- 배포 트랜잭션: [`0xec5e6053df2769b9c34e89e8651a09441498695e60cc600a07fa029219415ca2`](https://sepolia.etherscan.io/tx/0xec5e6053df2769b9c34e89e8651a09441498695e60cc600a07fa029219415ca2)
- 배포 블록: `11842073`

Ignition 배포 기록은 `ignition/deployments/chain-11155111`에서 관리합니다.
