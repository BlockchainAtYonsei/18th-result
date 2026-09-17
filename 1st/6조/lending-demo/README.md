# XLS-66 Vault Demo

XRPL **Devnet**에서 XLS-65 Single Asset Vault + XLS-66 Lending Protocol의 네이티브 트랜잭션을 실제로 제출하며
렌딩 흐름과 부실(default) 시 예금자 손실을 단계별로 보여주는 발표용 데모입니다.

- 시나리오 A: 예치 → 대출 → 전액 상환 → Broker cover 회수 → 예금자 인출 (이자 수령)
- 시나리오 B: 예치 → 대출 → 부실 표시(Impair) → Default → 예금자 인출 (cover 소진 후 손실)

모든 단계는 devnet에 실제 트랜잭션으로 제출되고, 화면의 수치는 `ledger_entry`로 읽은 원장 값입니다.
세 역할(예금자·Broker·차입자)은 앱이 faucet으로 만든 devnet 계정이 서명합니다. **실제 자금은 사용되지 않습니다.**

## 실행

```bash
npm install
npm run dev        # 브라우저 데모
npm run probe      # devnet 환경 실측 (amendment, faucet, reserve)
npm run scenario -- --scenario B   # Node에서 시나리오 완주
npm test && npm run build
```

## 문서

- `docs/decisions.md` — devnet 실측으로 확정한 결정 기록
- `docs/rehearsal-checklist.md` — 발표 전 점검과 장애 대응
- `docs/screens.md` — 화면 목록과 상태 매핑
- `docs/interfaces-frozen.md` — 핵심 인터페이스

## 알려진 제약

- Vault는 closed-ended이며 운용 기간 최소 180초가 프로토콜 상수입니다. 기본 설정(예치 창 75초, 운용 240초)에서 1회 완주에 약 6분이 걸리고, 예치와 대출 실행은 각각 버튼에 표시되는 마감 안에 눌러야 합니다.
- Crossmark/GemWallet 확장은 아직 XLS-65/66 트랜잭션 타입을 서명하지 못해 지갑 경로는 제외했습니다 (`docs/decisions.md` D20).
- xrpl.js 5.2.0-beta.0을 사용합니다. 5.1.0은 closed-ended Vault 필드를 인코딩하지 못합니다.
