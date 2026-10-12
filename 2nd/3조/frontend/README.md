# Moa Frontend

React + TypeScript + Vite 기반의 Moa 프론트엔드 프로토타입이다.

## 실행

```bash
cd frontend
npm install
npm run dev
```

또는 루트에서:

```bash
pnpm frontend:dev
```

## 환경변수

`.env.example`을 `.env`로 복사한 뒤 Contract 배포 정보를 입력한다.

- `VITE_BACKEND_URL`: Backend Base URL
- `VITE_RPC_URL`: RPC URL
- `VITE_CHAIN_ID`: 연결할 Chain ID
- `VITE_MOA_FACTORY_ADDRESS`: `createAccount`를 제공하는 Factory 주소
- `VITE_MOA_ACCOUNT_ADDRESS`: 읽기·입금·Proposal에 사용할 Moa Account 주소. 비워두면 연결한 Wallet의 `accountsOf` 결과에서 최근 계좌를 자동 선택
- `VITE_ATTACK_MODE`: `true`일 때 `executeProposal`에 변조된 실행 Payload를 전달하는 Attack Path 표시

Contract 주소를 입력하지 않으면 Demo Mode로 화면 흐름을 확인할 수 있다.

## Contract 호출부

호출 구현은 `src/lib/contract.ts`에 있다.

- `createAccount`
- `deposit`
- `createProposal`
- `approveProposal`
- `executeProposal`
- `executeWithPayload` (프론트 Attack Path용 wrapper)
- `accountsOf` (연결 Wallet의 공동계좌 자동 발견)
- `owners`
- `THRESHOLD`
- `getProposal`
- `proposalCount`
- `hasApproved`
- `computeIntentHash`
