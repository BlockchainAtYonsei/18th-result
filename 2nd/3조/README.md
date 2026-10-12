# Moa

Moa는 5명의 참여자가 공동 자산을 관리하고, 3명 이상의 승인을 받아 지출하는 3-of-5 멀티시그 공동계좌 프로젝트입니다.

## 모노레포 구성

```text
moa/
├── frontend/   # 프론트엔드 (추후 구현)
├── backend/    # NestJS metadata API
└── contracts/  # Solidity 스마트 컨트랙트
```

워크스페이스는 pnpm으로 관리합니다. 현재 `frontend`는 자리만 마련되어 있으며, `backend`에는 off-chain metadata API가 구현되어 있고, `contracts`에는 3-of-5 멀티시그 계좌와 팩토리가 구현되어 있습니다.

컨트랙트의 공개 함수와 보안 모델은 [`contracts/README.md`](contracts/README.md)에서 확인할 수 있습니다.

## 요구 환경

- Node.js 22.10 이상
- pnpm 11.19.0

## 시작하기

```bash
pnpm install
pnpm contracts:compile
pnpm contracts:test
```

컨트랙트 패키지에서 직접 명령을 실행하려면 다음과 같이 이동합니다.

```bash
cd contracts
pnpm compile
pnpm test
pnpm node
```

## 주요 명령

- `pnpm contracts:compile`: Solidity 소스 컴파일
- `pnpm contracts:test`: 컨트랙트 테스트 실행
- `pnpm contracts:typecheck`: TypeScript 설정 및 테스트 코드 타입 검사
- `pnpm contracts:clean`: Hardhat 생성물 삭제
- `pnpm contracts:node`: 로컬 Hardhat 네트워크 실행
