# Sepolia 상태 조회

`BlockchainModule`의 singleton provider가 `BLOCKCHAIN_RPC_URL`, `MOA_FACTORY_ADDRESS`로 viem PublicClient를 구성한다. 최초 조회에서 chain ID 11155111을 확인한다. 설정 누락 또는 오류는 조회 API에 정제된 503 오류로 반환하며 metadata 저장 API는 계속 사용할 수 있다. RPC 설정과 원본 viem 오류는 응답이나 로그로 출력하지 않는다.

Factory 등록 여부의 성공 결과만 프로세스 내에서 캐시한다. 현재 Factory 등록은 삭제되지 않으며 상태, 잔액, 제안, 승인 여부는 항상 실제 RPC로 조회한다.

계좌 상세와 owner 계좌 목록, 제안 상세와 목록은 `state`에 온체인 값을, `metadata`에 DB 값을 반환한다. DB metadata가 없으면 `metadata: null`이다. owner 없는 계좌 목록은 기존 metadata 목록 동작을 유지한다. POST/PATCH는 metadata만 저장한다. Activity 조회 및 저장 경계는 기존 구조를 유지한다.

uint256은 기존 ResponseInterceptor에서 십진 문자열로 직렬화한다. `createdAt` 온체인 값은 Unix seconds 문자열이고 DB timestamp는 metadata 내부 ISO 문자열이다. 주소는 소문자로 정규화한다. 제안 조회 ID는 canonical uint256 십진수이다. 상태는 `Pending`, `Executed`, `Cancelled`만 반환한다.

Security API는 approvalCount, threshold, thresholdReached, intentHash, status, approvedPayload, owners, approvals를 반환한다. executionMatch나 실행 가능 여부를 추측하지 않는다. 최종 payload 검증과 실행 허용 판단은 Contract가 수행한다.

## ABI 갱신

Solidity를 변경하는 후속 작업에서는 아래 순서로 ABI를 갱신한다.

```sh
pnpm contracts:compile
pnpm --filter backend abi:sync
pnpm --filter backend abi:check
```

`abi/MoaFactory.ts`, `abi/MoaAccount.ts`는 compile artifact의 ABI만 추출한 `as const` 데이터다. 생성 파일은 수동 편집하지 않는다. `abi:check`는 compile 결과와의 drift를 검출하므로 compile 이후 실행한다. Backend runtime에는 Hardhat artifact 또는 Ignition deployment 디렉터리가 필요하지 않다.

## 검증

기본 unit/E2E 테스트는 PublicClient와 Prisma를 mock하며 외부 RPC를 호출하지 않는다.

```sh
pnpm --filter backend build
pnpm --filter backend lint
pnpm --filter backend test --runInBand
pnpm --filter backend test:e2e --runInBand
```

실제 read-only smoke는 기본 test suite와 분리한다.

```sh
pnpm --filter backend test:sepolia
```

Smoke는 backend/.env 또는 process environment를 읽고 대상 Factory의 accountCount, THRESHOLD, OWNER_COUNT를 조회한다. 설정이 없으면 SKIPPED를 출력한다. 성공 출력은 contract 주소, getter 이름, 결과만 포함하며 오류는 정제된 메시지로 출력한다. Fixture 생성 transaction은 실행하지 않는다.

Event Indexer, Activity synchronization, Chain of Custody event ingestion은 후속 작업이다. 제안 목록은 현재 pagination 없이 온체인 proposalCount 전체를 10개씩 병렬 조회하므로 큰 계좌의 목록 조회는 후속 pagination 검토 대상이다.
