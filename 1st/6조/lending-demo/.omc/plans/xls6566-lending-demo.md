# Plan: XLS-65/66 Lending & Default 데모 웹앱

- plan_id: plan-xls6566-20260911
- status: pending approval
- revision: r5 (Architect/Critic 4회차 리뷰 반영)
- source_spec: `.omc/specs/deep-interview-xls6566-lending-sim.md`
- target_dir: `/Users/jaemin/Developer/BAY/xls6566`
- **발표 예정일: `[미정 — 사용자 확인 필요]`**

### 일정 여유 계산
- 총 소요 예산 **4.5일** (P1b는 P1과 병렬이라 합산 제외): P0 0.5 + P1 1.0 + P2 0.5 + P3 0.5 + P4 1.0 + P5 0.5 + P6 0.5
- 여유 일수 = (착수일 ~ 발표 전일 영업일 수) − 4.5
- **여유 < 0일 때 덜어낼 항목(우선순위 순)**
  1. 중앙 스테이지 `offset-path` 칩 애니메이션 (이미 선택 항목)
  2. 단계 파라미터 편집 UI → 기본값 하드코딩 ※ **스펙의 UI 요구사항 축소, 사용자 승인 대상**
  3. 리셋 흐름 → 회차 전환 시 새로고침 허용 ※ **AC4 완화 필요, 사용자 승인 대상**
  4. 지갑 연동 → 전원 localKeypair 고정 ※ **AC3 삭제 필요, 사용자 승인 대상**
  5. 시나리오 A 제외, B만 시연 ※ **AC1 삭제 필요, 사용자 승인 대상**

---

## 1. RALPLAN-DR 요약

### Principles
1. **온체인 사실 우선**: 화면 수치는 `ledger_entry` 응답의 raw 값이다. 계산은 스크립트가 하고 화면은 표시만 한다.
2. **추측 금지**: 필드명·플래·메서드·지갑 API 형태는 typings와 devnet 실제 응답으로만 확정한다. 미확인은 assert로 즉시 실패시킨다.
3. **경계 단일화**: 서명은 지갑, 제출·검증 대기·복구·정규화는 앱이 독점한다.
4. **하나의 엔진, 두 런타임**: 엔진은 Node 러너와 브라우저가 공유하고 차이는 주입되는 SignerProvider뿐이다.
5. **탐침을 위한 별도 tx를 만들지 않는다**: 지갑 지원 여부는 시나리오의 실제 단계에서 판정한다.

### Decision Drivers (top 3)
1. **프로토콜·지갑 API 불확실성**: 필드명, 플래그, default 성립 조건, 지갑 서명 API 반환 형태가 모두 미검증이다.
2. **타이밍이 UX를 규정**: 60s 주기/유예와 ledger close 대기, 그리고 사람의 조작 시간이 5분 예산을 지배한다.
3. **자금 규모 미확정**: faucet 지급액과 reserve가 스펙 수치(1000/500/50)의 성립 여부를 결정한다.
