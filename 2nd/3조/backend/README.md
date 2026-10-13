# Moa Backend MVP

NestJS 12 / Prisma 7.10 / PostgreSQL 17 기반 off-chain metadata API입니다.
Frontend는 HTTP로 Backend를 조회하고 Wallet로 Contract에 직접 write합니다.
Backend는 private key, signer, Contract write를 제공하지 않습니다.

## 실행

루트 `.env.example`을 참고해 기존 PostgreSQL Compose 환경을 설정하고,
`backend/.env.example`을 참고해 Backend `.env`를 설정합니다.
루트 PostgreSQL 암호와 DATABASE_URL의 암호는 일치해야 합니다.
실제 `.env`와 generated Client는 Git에 포함하지 않습니다.

```sh
pnpm --filter backend run prisma:generate
pnpm --filter backend run build
pnpm --filter backend run start:prod
```

기존 `prisma7.config.ts`를 유지하며 CLI는 `--config prisma7.config.ts`를 사용합니다.
PrismaService는 runtime DATABASE_URL과 PrismaPg adapter를 사용합니다.
생성된 CommonJS Client는 `generated/prisma`에 두고 build 시 `dist/generated/prisma`로 컴파일합니다.
앱 진입점은 `dist/src/main.js`입니다.
기존 migration은 보존합니다. DB 초기화가 필요한 경우 기존 migration 적용은 별도로 결정합니다.

## HTTP 계약

Base path는 `/api`이며 기존 기본 예제는 `/api`에 유지합니다.
성공은 `{ "success": true, "data": ... }`, 실패는
`{ "success": false, "error": { "code": "...", "message": "..." } }`입니다.
주소 키는 검증 후 소문자로 정규화합니다. txHash도 소문자로 저장합니다.
BigInt는 JSON에서 문자열로 반환합니다.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | /api/accounts | DB metadata 목록 |
| GET | /api/accounts?owner=0x... | 실제 on-chain owner 조회 경계, 현재 503 |
| POST | /api/accounts | account metadata 저장 |
| GET / PATCH | /api/accounts/:address | metadata 조회 / 이름 수정 |
| GET / POST | /api/accounts/:address/proposals | proposal metadata 목록 / 저장 |
| GET | /api/accounts/:address/proposals/:proposalId | proposal metadata 조회 |
| GET | /api/accounts/:address/proposals/:proposalId/security | 실제 Contract security 조회 경계, 현재 503 |
| GET | /api/accounts/:address/activities | indexed Activity 조회 |
| GET | /api/accounts/:address/proposals/:proposalId/activities | proposal indexed Activity 조회 |
| GET / PUT | /api/profiles/:address | profile 조회 / upsert |

Account POST 필드: `address`, `name`, `creator`, optional `creationTxHash`.
Proposal POST 필드: `proposalId`, `purpose`, optional `recipientLabel`, `memo`, `creationTxHash`.
Profile PUT 및 Account PATCH 필드: `name`.
POST는 metadata만 저장하며 transaction의 실행 여부를 증명하지 않습니다.
동일 metadata 재요청은 기존 결과를 반환하고 다른 값 충돌은 409입니다.
creationTxHash unique 충돌도 409입니다. 동시 생성 경합은 unique 제약에 따라 409가 될 수 있습니다.
optional 필드의 null은 값 없음으로 처리합니다.

Metadata 응답은 `{ source: "offchain_metadata", blockchain: { status: "not_configured" }, metadata: ... }`
또는 목록의 `items` 형식입니다. 체인 데이터가 합쳐진 응답이 아닙니다.
metadata 404는 on-chain account/proposal 부재를 뜻하지 않습니다.
`creator`는 owner로 대체하지 않습니다. owner/security 조회는
`BLOCKCHAIN_NOT_CONFIGURED` 503을 반환하며 가짜 값을 제공하지 않습니다.

Activity query는 optional `cursor`(양의 PostgreSQL BigInt ID 문자열), `size`(기본 20, 최대 100)를 받습니다.
`id DESC`, `id < cursor` 방식이며 `{ source: "indexed_activity", blockchain: { status: "not_configured" }, items, nextCursor }`를 반환합니다.
현재 실제 ingestion이 없으므로 기존 DB에 기록이 없다면 목록은 비어 있습니다.
이벤트 시간순이 아니라 저장 ID순 pagination입니다.
ActivityService.storeConfirmedEvent는 향후 **검증된 로그**만 연결할 내부 저장 경계입니다.
공개 ingestion API나 indexer는 없으며 `(txHash, logIndex)` upsert로 중복을 방지합니다.
metadata POST가 on-chain Activity를 만들어내지 않습니다.

Validation: Ethereum 주소 20 bytes, txHash 32 bytes, name 1~100자,
purpose 1~500자, recipientLabel 최대 100자, memo 최대 2000자.
Proposal ID는 현재 String 모델에 맞춰 공백 없는 1~128자 문자열로 제한합니다.
실제 Contract ID 타입은 미확정이며 uint256/bytes32라고 가정하지 않습니다.
입력에 알려지지 않은 필드를 포함하면 400입니다.

## Contract 팀 TODO

현재 contracts에는 Hardhat 설정만 있고 Solidity 소스, ABI, 배포 코드가 없습니다.
BlockchainService는 Backend 조회 의미의 경계이며 Contract 함수 시그니처가 아닙니다.
실제 ABI 확인 전 구체적인 Intent 구조, hash 계산, security 값을 구현하지 않습니다.

- ABI, 배포 주소 또는 account factory/discovery 방식
- chainId, RPC, indexing 시작 block
- owners/threshold/balance/Proposal/approvals 실제 read 인터페이스와 Proposal ID 타입
- Intent hash 타입·encoding 순서·domain 및 nonce/expiration 처리
- 이벤트 필드와 실행/차단 상태, executionMatch 조회 근거
- confirmation/reorg 기준 및 재시작 재조회 방식

실행이 revert되면 이벤트도 보존되지 않으므로 blocked Activity 기록 방식을 확인해야 합니다.
Account FK 때문에 metadata보다 먼저 도착한 이벤트는 보류/재시도 정책이 필요합니다.
ActivityType enum만으로 Contract 이벤트가 존재한다고 가정하지 않습니다.
승인된 Proposal/Intent를 변조하지 않으며 공격 대상은 execution payload입니다.
최종 실행과 차단은 Contract가 판단합니다. Backend는 signature validity로 Intent correctness를 대체하지 않습니다.

## 제한 및 테스트

MVP metadata API에는 지갑 소유권·수정 권한 인증이 없습니다. creator/txHash는 입력 metadata입니다.
JWT/USER/MEMBER/AUTH 테이블은 추가하지 않았습니다.
기존 DB 주소의 대소문자 혼재는 운영 전 별도 확인이 필요합니다.
현재 schema는 chainId가 없어 단일 chain으로 제한됩니다.
여러 Proposal을 하나의 transaction에서 생성하면 creationTxHash unique 제약과 충돌할 수 있어 Contract 협의가 필요합니다.
Account/Proposal 목록은 현재 pagination 없이 metadata 전체 목록을 제공합니다.

```sh
pnpm --filter backend run prisma:generate
pnpm --filter backend run build
pnpm --filter backend run lint
pnpm --filter backend run test --runInBand
pnpm --filter backend run test:e2e --runInBand
```

Service 테스트는 Prisma 경계를 mock합니다. e2e는 실제 Nest 라우팅/validation/filter/serializer를
사용하되 Prisma를 mock하며 실제 chain과 DB에는 쓰지 않습니다.
BlockchainService 미연동 경계와 503 처리도 검증합니다.
별도 PostgreSQL test DB, Docker test 환경, 신규 migration은 없습니다.
