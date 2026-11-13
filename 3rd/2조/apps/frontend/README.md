# Frontend · 통합 시연 UI

컴플라이언스 담당자가 Solana 송금 하나를 넣고 "이 송금을 막아야 하는가, 왜"를 보는 웹앱입니다. 담당: 최현수.
판정을 본 뒤에는 "What if it's sent another way?"로 같은 송금이 다른 제출 경로와 네트워크에서 어떻게 되는지 시뮬레이션합니다.

- Backend **Public API 6개만** 호출합니다. 내부 모듈(Collector·KYT·Policy·Gateway·Simulator)을 직접 부르지 않습니다.
- 위험도·정책 판정·시뮬레이션 결과를 화면에서 계산하지 않습니다. 받은 값을 그대로 보여줍니다.
- 모든 요청과 응답을 `contracts/schemas`로 검증합니다. 계약을 위반한 응답은 결과로 표시하지 않고 오류로 보여줍니다.
- 화면 문구는 영어가 먼저이고, 한국어는 `src/i18n`에 같은 키로 추가할 수 있게 해 두었습니다.

Vite 8 + React 19 + TypeScript입니다. Node 22.12 이상이 필요합니다(Vitest·MSW의 engines 기준). Node 24.15 / pnpm 10.27에서 확인했습니다.

## 세 가지 모드

화면 상단 오른쪽에 지금 모드가 항상 보입니다(`Mock data` 또는 `Backend · <주소>`).

1. **Mock**: Backend 없이 브라우저 안에서 돕니다. MSW가 `/api/v1/*` 요청을 받아 `contracts/fixtures`의 합성 데이터로 답합니다. 오프라인 시연용입니다.
2. **로컬 Backend**: 이 저장소의 Backend(`apps/backend`)를 로컬에서 띄우고 dev 서버 proxy로 붙습니다.
3. **배포 Backend**: 빌드할 때 넣은 Backend 주소를 직접 부릅니다. 연결 방법은 [docs/backend-wiring.md](docs/backend-wiring.md)에 있습니다.

배포본에서도 설정 메뉴의 "Use Mock data"로 그 브라우저만 Mock으로 바꿀 수 있습니다. 시연 중 Backend가 내려갔을 때 쓰는 안전장치입니다.

## 실행

```bash
cd apps/frontend
pnpm install

pnpm dev            # Mock, http://localhost:5173
pnpm dev:backend    # 로컬 Backend(apps/backend, :8080)에 연결
pnpm build          # 배포용 정적 파일, dist/
```

- `pnpm dev:backend`는 Backend 모드로 뜨고 `/api`를 `VITE_BACKEND_URL`(기본 `http://127.0.0.1:8080`)로 넘깁니다. 기본값은 `vite.config.ts`에 있고, 바꾸려면 `.env.backend.example`을 `.env.backend`로 복사해 고칩니다. proxy가 브라우저 Origin을 빼고 넘기므로 어느 포트에서 띄워도 Backend CORS 설정이 필요 없습니다.
- Backend는 저장소 루트에서 띄웁니다. 새 케이스의 기본값이 데모 시나리오라서, fixture collector가 데모 데이터도 읽도록 아래처럼 띄웁니다. 이 설정 없이 띄우면 기본 케이스가 "collector: fixture not found: demo-layering"으로 멈춥니다(계약 fixture 시나리오는 됩니다).

  ```bash
  pnpm demo:fixtures
  ```

  Docker로(저장소 루트에서, JDK와 Python 설치 불필요):

  ```bash
  docker compose -f compose.dev.yaml -f apps/frontend/demo/compose.demo.yaml up --build -d --wait
  ```

  또는 `scripts/run-local.sh`로(JDK 17과 루트의 `.venv` 필요):

  ```bash
  LOCAL_COLLECTOR_FIXTURES_DIR=$PWD/apps/frontend/demo/.backend-fixtures scripts/run-local.sh start
  ```
- 포트를 바꾸려면 `PORT=5174 pnpm dev`처럼 실행합니다.

| 환경 변수 | 설명 |
| --- | --- |
| `VITE_API_MODE` | `mock`(기본) 또는 `backend` |
| `VITE_BACKEND_URL` | dev 서버 proxy 대상. 기본 `http://127.0.0.1:8080` |
| `VITE_API_BASE_URL` | 배포 빌드에서 직접 부를 Backend 주소. 비우면 같은 출처의 `/api` |
| `VITE_CONSTELLATION_MODELS` | Constellation 모델 버전 후보(쉼표 구분). Public API에 목록 조회가 없어서 설정으로 받음 |
| `VITE_DEMO_FIXTURES` | `off`면 Backend 모드에서 데모 시나리오를 목록에서 뺌. Backend가 데모 데이터를 읽지 않을 때(운영 구성) 씀 |
| `VITE_BASE_PATH` | 앱이 놓이는 경로. 기본 `/`, GitHub Pages 프로젝트 페이지면 `/<저장소 이름>/` |

배포 빌드 값의 예시는 `.env.production.example`에 있습니다.

## 화면

1. **로그인**: 데모 로그인입니다. 이름만 받고 이 브라우저에 저장합니다.
2. **케이스 대시보드**: 지금까지 심사한 송금 목록과 판정 분포입니다. 판정·상태로 거릅니다.
3. **새 케이스**: 송신자·수신자(저장된 메인넷·합성 시나리오 또는 LIVE 주소), 자산·수량, 정책 버전을 넣고 실행합니다. 두 지갑 분석과 정책 판정이 단계별로 진행됩니다.
4. **케이스 화면**: 위에서부터 판정("This transfer is blocked."), 이유, 위험도와 그 근거 한 줄, Evidence 순서로 읽힙니다. Evidence는 근거마다 그 지갑이 한 일을 한 문장으로 쓰고(예: "제재 주소 2곳과 3건 거래"), 상대 지갑이 둘 이상이면 자금 흐름 그림을 그립니다(근거 거래는 굵게, 제재 목록 주소는 빨간 고리). 지갑별 분석, 거래 타임라인, Audit(버전·ID·원래 코드)은 접혀 있고 누르면 열립니다. 실제 온체인 데이터일 때만 주소가 Solscan·Solana Explorer·Arkham으로 연결됩니다.
5. **"What if it's sent another way?" 다이얼로그**: 열면 바로 결과가 나옵니다. "Another route"는 경로마다 Transfer → 제출 단계 → Network를 그림으로 그리고, 송금 점이 그 위를 움직이다가 막히는 곳에서 멈춥니다. 끝나면 결론을 한 문장으로 씁니다. "On the network"는 시나리오 버튼 3개로 Constellation 초안 모델과 단일 리더 모델을 비교하고, 모델마다 그림이 일어나는 순서대로 그려집니다. 직접 입력과 증명 비율 sweep은 "Custom scenario" 안에 있습니다.

계약의 코드명(`SANCTION_EXACT_MATCH` 등)은 화면 문장으로 바꿔 보여주고, 원래 코드는 Audit에만 둡니다. 설명이 필요한 용어에는 점선 밑줄이 있고, 마우스를 올리면 정의가 나옵니다.

### 표시 규칙

- `riskScore: null`은 0점으로 표시하지 않고 "Not scored"로 표시합니다.
- LOW에는 "안전 보증이 아님"을 함께 표시합니다.
- 합성 데이터와 온체인 데이터, 테스트 목록과 실제 제재 목록을 구분해 표시합니다.
- FAILED와 PARTIAL은 정상 결과처럼 보이지 않게 따로 표시합니다. 오류에는 코드·재시도 가능 여부·requestId를 함께 보여줍니다.
- 원시 수량(`amountRaw`)은 문자열 연산으로만 변환합니다. JavaScript Number를 쓰지 않습니다.
- 판정 사유 코드는 계약상 알파벳 순서로 오므로 모두 같은 무게로 보여줍니다.
- Gateway에는 실제 전송이 없음을, Constellation에는 메인넷 결과가 아니고 팀 초안 모델임을 명시합니다.

## 저장된 메인넷 데이터로 분석

1. 저장소 루트에서 `docker compose -f compose.dev.yaml up --build -d --wait`로 실행하고 `http://localhost:5173`에 접속합니다.
2. Settings에서 **Use the Backend**를 선택한 뒤 **New case → Fixture data**로 이동합니다.
3. **Mainnet:**으로 시작하는 시나리오 카드를 선택하고 **Run case**를 누릅니다. 정상 지갑, OFAC SDN 주소 일치, 거래 한도 도달, 급속 분산 송금의 네 수집본을 제공합니다.

카드를 고르면 송신자는 실제 정상 지갑 수집본으로 설정됩니다. 송신자·수신자는 개별 선택도 가능합니다. 각 지갑 아래에서 수집 출처·시각·원래 조회 구간과 거래 상한을 확인할 수 있습니다. 실제 주소에는 탐색기 링크를 제공합니다.

데이터는 `services/collector/fixtures`의 저장된 수집본을 Collector가 읽고 KYT·Policy가 다시 평가합니다. 새 RPC 수집이나 송금은 하지 않으며, 입력한 거래 의도는 가상 실험입니다. 메인넷 시나리오는 Mock 모드에서 제공하지 않습니다. FE 빌드에는 요청·출처 메타데이터만 사용하고 원본 RPC 기록은 포함하지 않습니다.

정책 1.0.0에서 정상 지갑은 ALLOW, OFAC 직접 일치는 BLOCK, 거래 한도 도달은 REVIEW, 급속 분산 송금은 WARN으로 확인할 수 있습니다. 이 결과는 화면에서 미리 계산하지 않고 Backend 응답으로 표시합니다.

## 데모 시나리오

계약 fixture(`contracts/fixtures`)는 규칙 하나씩만 건드리는 거래 0~3건짜리입니다. "이 지갑이 이런 일을 했기 때문에"가 보이도록, 하루치 활동이 있는 시나리오 3개를 `demo/fixtures`에 따로 뒀습니다. 새 케이스의 기본값도 이 중 하나입니다.

| 시나리오 | 한 일 | 결과(실제 엔진) |
| --- | --- | --- |
| `demo-layering` | 제재 주소에서 2번 받고, 몇 분 안에 6개 지갑으로 나눠 보내고, 다른 제재 주소로 1번 보냄 (거래 20건) | 위험도 100. 정책 1.0.0: Review, 1.1.0: Block |
| `demo-burst` | 같은 지갑으로 48초 동안 5번 보내고, 뒤에 4개 지갑으로 빠르게 분산 (16건) | 위험도 60. Warn |
| `demo-busy-clean` | 상대 9곳과 18건, 걸리는 것 없음 | 위험도 0. Allow |

- 거래 데이터만 만들었습니다(`demo/build.mjs`). 주소와 서명은 형식만 맞는 합성 값입니다. 분석·정책 결과는 로컬 Backend의 실제 KYT·Policy 엔진이 낸 응답을 저장한 것이고, Mock이 그것을 그대로 돌려줍니다.
- `pnpm demo:snapshots`(거래 데이터 생성), `pnpm demo:fixtures`(Backend용 폴더로 모으기), `pnpm demo:record`(Backend에 물어 결과 저장).
- Backend 모드에서 쓰려면 Backend의 fixture collector가 이 데이터를 읽어야 합니다(dev 구성에서만 가능). 실제 Collector를 쓰는 운영 구성에서는 `VITE_DEMO_FIXTURES=off`로 빌드해 목록에서 뺍니다. [docs/backend-wiring.md](docs/backend-wiring.md)의 1~2절을 보세요.
- KYT 규칙은 4개이고 직접 상대까지만 봅니다. 여러 단계를 거치는 이야기는 엔진이 탐지하지 못해서 만들지 않았습니다.

## 저장

- Backend 모드에서는 케이스 전체(입력, 분석·정책 응답, Gateway·Constellation 결과)를 `/api/v1/cases`에 저장합니다. 대시보드와 상세 화면은 서버 기록을 불러오므로 같은 Backend에 연결한 다른 브라우저에서도 확인할 수 있습니다.
- 기존 IndexedDB 케이스는 Backend 모드 시작 시 자동으로 이전합니다. 서버 저장 확인 후에만 로컬 사본을 삭제하며, ID가 충돌하면 기존 서버 기록을 보존하고 별도 ID로 이전합니다. 이전 중 오류가 나면 원본을 남기고 오류를 표시합니다.
- 저장은 순서대로 실행하며 revision으로 다른 브라우저의 변경을 덮어쓰지 않습니다. 실패 시 저장 실패 안내와 재시도·내보내기·다시 불러오기를 제공합니다. 서버 장애 시 로컬 저장으로 자동 전환하지 않습니다.
- Mock 모드는 Backend 없는 독립 시연을 위해 IndexedDB를 사용합니다(사용할 수 없으면 메모리). 화면에 브라우저 저장임을 표시합니다.
- 설정 메뉴에서 모든 케이스를 JSON 파일로 내보내고 다시 가져올 수 있습니다.
- 같은 케이스를 다시 실행하면 새 실행으로 쌓이고, 이전 실행으로 바꿔 볼 수 있습니다.
- Backend가 재시작되어 예전 실행을 모르면(404) 시뮬레이션 화면에 다시 실행하라는 안내가 나옵니다. 몰래 다시 실행하지 않습니다.

## Mock API의 범위

Mock은 Backend를 대신하는 시연용이며 계산하지 않습니다. 계약 fixture와 데모 시나리오의 파일을 고르고 ID·시각만 바꿔 돌려줍니다. 상태는 브라우저 저장소에 남아 새로고침해도 이어집니다.

- 분석: 조회할 때마다 QUEUED → RUNNING → 결과 순서로 진행합니다. LIVE는 Collector가 없어 FAILED로 끝납니다. Fixture 주소와 요청 주소가 다르면 FAILED입니다.
- 정책 심사: Fixture에 있는 조합(송신자 `sender` × 각 수신자 시나리오, 해당 정책 버전)만 응답합니다. 다른 조합은 `[Mock]` 표시가 붙은 409로 알려줍니다.
- Gateway: `contracts/semantics.md`의 결정 표에 맞춰 만들어 둔 `fixtures/gateway/*-result.json`을 고릅니다.
- Constellation: 독립적인 화면 시연을 위해 mock 버전(`0.0.0-research-pending`)에만 고정 결과를 돌려주고, 다른 버전은 422입니다. 이 결과는 입력과 무관한 화면 확인용이라 Mock 모드에서는 증명 비율 sweep을 숨깁니다.

## 구조

```text
src/
  api/        Public API 클라이언트, 계약 타입, JSON Schema 검증
  app/        라우팅, 데모 로그인, 모드 선택, 상단 바와 설정 메뉴
  cases/      케이스·실행 기록, 서버 저장·로컬 이전, 내보내기·가져오기
  flow/       케이스 실행(분석 → 정책), 시뮬레이션 실행
  pages/      로그인, 대시보드, 새 케이스, 케이스 화면, 시뮬레이션 다이얼로그
  charts/     자금 흐름 그래프와 타임라인(SVG, 표 보기 포함)
  components/ 용어 툴팁, 판정 표시, 주소 칩, 위험도 게이지, 로딩, 오류 상자
  i18n/       화면 문구(en.ts)와 코드 → 문장 변환
  contracts/  contracts/의 Fixture·정책·규칙·모델 목록을 빌드 시점에 읽음
  mocks/      MSW Mock Backend (브라우저·테스트 공용)
  lib/        수량 변환, 포맷, 익스플로러 링크
  styles/     색·글자 토큰, 기본 스타일
```

## 검증

```bash
pnpm test             # 계약 검증, 수량 변환, 표시 규칙, Mock 전체 흐름, 화면 테스트
pnpm lint
pnpm exec tsc -b
pnpm build
```

Mock 흐름 테스트는 실제 API 클라이언트로 Mock을 호출합니다. 클라이언트가 모든 응답을 계약으로 검증하므로 Mock 응답도 계약을 지키는지 함께 확인됩니다.

## 완료 조건 대응 (Notion 04. 6. 완료 조건)

| # | 완료 조건 | 상태 | 어디서, 무엇으로 확인했나 |
| --- | --- | --- | --- |
| 1 | 지갑 분석 요청 및 결과 표시 | 완료 | 새 케이스(요청), 케이스 화면의 판정 헤더와 Wallet analysis. Mock과 로컬 Backend에서 확인 |
| 2 | LIVE/FIXTURE 모드 지원 | **OPEN** | 새 케이스의 데이터 출처. FIXTURE는 Mock과 로컬 Backend에서 확인. LIVE는 요청과 실패 표시까지만 확인. Collector가 아직 없어 로컬 Backend도 LIVE를 `UPSTREAM_UNAVAILABLE`로 끝냄 |
| 3 | KYT 위험 신호·근거 시각화 | 완료 | 케이스 화면의 Evidence(한 일 문장, 근거 거래, 자금 흐름 그림), Wallet analysis(규칙), Transfers(타임라인) |
| 4 | 거래 전 정책 판단 화면 | 완료 | 케이스 화면 판정 헤더와 Evidence. Block·Warn·Review·Allow를 Mock으로, Block 세 사례를 로컬 Backend로 확인 |
| 5 | Gateway 실험 결과 비교 | 완료 | 시뮬레이션 다이얼로그의 Another route. Mock과 로컬 Backend에서 확인 |
| 6 | Constellation 시뮬레이션 화면 | 팀 연구 모델 반영 | `0.2.0-research`와 단일 리더 비교, 묶음 증명률 40%·전체 참여율 60% 입력, 블록 건너뛰기·제외 무효 표시 및 과거 기록 구분. 공식 네트워크 검증과 정량 지연 분석은 범위 밖 |
| 7 | 오류 및 부분 분석 상태 표시 | 완료 | 새 케이스 진행 화면과 케이스 화면. FAILED·PARTIAL·409·422·계약 위반·연결 실패·시간 초과·Backend 재시작 표시 확인 |
| 8 | Mock API로 독립적인 시연 가능 | 완료 | `pnpm dev`만으로 로그인부터 시뮬레이션까지 오프라인 확인 |

Notion 04의 "2. 화면별 구성"(Screen A~D)은 위 화면 구조에 맞게 Henry가 고칩니다.

## 열린 사항

- **Constellation 용어 설명**: 용어 툴팁의 pslice, attestation, proposer, leader 정의는 Simulator(`simulations/constellation`)의 코드와 README를 보고 썼습니다. Simulator 담당자의 확인이 필요합니다(`src/i18n/en.ts`의 `glossary`).
- **LIVE 분석과 실제 온체인 fixture**: Collector PR이 머지되면 LIVE 수집과 메인넷 fixture를 이 화면에서 확인해야 합니다. 그 fixture를 새 케이스 목록에 올리는 방법도 정해야 합니다(연결 가이드 7절).
- **Constellation 모델 목록**: Public API에 목록 조회가 없어 빌드 설정(`VITE_CONSTELLATION_MODELS`)으로 받습니다. 목록 API를 둘지 Backend 담당과 정해야 합니다.
- **배포 연결**: 공개 Backend 주소, HTTPS, CORS는 Backend 쪽 작업입니다. [docs/backend-wiring.md](docs/backend-wiring.md)를 보세요.

## 문서

- 설계: [docs/2026-11-10-redesign-design.md](docs/2026-11-10-redesign-design.md)
- 구현 계획: [docs/2026-11-11-redesign-plan.md](docs/2026-11-11-redesign-plan.md)
- Backend 연결 가이드: [docs/backend-wiring.md](docs/backend-wiring.md)
- 겉모습 참고용 목업: `docs/mockups/`

## 언어 지원

한국어와 영어를 지원합니다. 첫 접속 시 브라우저의 선호 언어 중 지원하는 언어를 선택하며, 로그인 화면과 상단 언어 선택에서 즉시 변경할 수 있습니다. 선택은 `scl.locale.v1`에 저장되어 새로고침 후에도 유지됩니다. 언어 변경은 화면을 다시 불러오거나 실행 중인 분석을 중단하지 않습니다.

`src/i18n/en.ts`와 `ko.ts`가 같은 키 구조를 사용하며, 누락된 번역과 보간 변수 차이는 타입 검사·테스트로 확인합니다. 분석·정책·실험·오류·저장 안내와 시나리오 이름을 번역합니다. 지갑 주소, 자산 코드, 버전, 원본 API 응답은 유지하고 시각은 기존처럼 UTC로 표시합니다. 원본 오류 메시지는 기술 상세에서 확인합니다.

Constellation 화면은 대상 묶음 증명률과 전체 증명 참여율을 나누어 입력하고 40%·60% 경계값, 전체 참여율 미달, 제출 경로를 비교합니다. 블록 건너뛰기와 리더의 무효한 제외를 별도로 표시하며, 과거 0.1.0 모델 기록에는 과거 결과임을 안내합니다.
