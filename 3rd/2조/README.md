# 3주차 2조 — 이상거래

Solana 온체인 이상거래 탐지 및 컴플라이언스 대응 범위 검증 프로젝트의 전체 소스와 발표자료입니다.

- **발표자료:** [presentation/index.html](presentation/index.html) — 이 파일 하나를 다운로드하여 브라우저로 열면 발표와 상호작용 데모를 오프라인으로 실행할 수 있습니다.
- **발표 메모·시연 안내:** [presentation/README.md](presentation/README.md), [presentation/src/notes.json](presentation/src/notes.json)
- **원본 저장소:** https://github.com/baypeline/solana-compliance-lab
- **제출 범위:** Frontend, Backend, Collector, KYT·Policy 엔진, Mock Gateway, Constellation 연구 모델, API 계약, 테스트, 저장된 공개 온체인 데이터와 발표자료

실제 환경변수·인증정보·개인 실행 기록·Git 이력·캐시는 포함하지 않습니다. `.env*.example`은 값이 비어 있거나 공개 예시인 설정 템플릿입니다. 설계 문서의 연락처 표시는 예시 주소로 변경했습니다. 온체인 주소·거래 서명 및 공개 제재 레이블은 분석 근거로 포함하며 비밀키가 아닙니다.

아래는 프로젝트 실행과 구현 범위에 대한 안내입니다.

## 이상거래 — Solana Compliance Lab

Solana 지갑의 거래 이력에서 위험 신호를 탐지하고, 거래 의도에 대한 정책 결정과 제출 경로의 통제 범위를 확인하는 오프체인 PoC입니다.

저장된 실제 메인넷 데이터와 합성 데이터로 분석을 재현하거나, RPC를 연결해 요청 시점의 데이터를 수집할 수 있습니다. 불법 거래 여부를 확정하지 않으며, 실제 거래 전송이나 스마트 컨트랙트 배포는 수행하지 않습니다.

## 빠르게 실행하기

Docker와 Docker Compose가 필요합니다. 저장소 루트에서 실행합니다. Node.js·Python·JDK·Maven은 컨테이너 안에서 준비되므로 호스트에 별도로 설치하지 않아도 됩니다.

```bash
docker compose -f compose.dev.yaml up --build -d --wait
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend 상태: [http://localhost:8080/health](http://localhost:8080/health)
- 저장된 데이터로 분석할 때는 RPC API 키가 필요하지 않습니다.

```bash
# 상태와 로그
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml logs -f frontend backend collector

# 종료: Backend 메모리의 분석·심사 기록은 사라짐
docker compose -f compose.dev.yaml down
```

## 화면에서 저장된 데이터 분석하기

1. Frontend에 접속하고 이름 입력 화면이 나오면 입력합니다. 이름은 브라우저에만 저장하는 데모용 식별자입니다. 로그인 화면이나 상단 언어 선택에서 한국어·영어를 전환할 수 있으며 선택은 새로고침 후에도 유지됩니다.
2. **Settings → Use the Backend**로 Backend 모드를 선택합니다. Compose 실행의 기본값은 Backend입니다.
3. **New case → Fixture data**에서 **Mainnet:**으로 시작하는 시나리오 카드를 선택합니다.
4. 송신자·수신자와 금액·자산을 확인하고 **Run case**를 누릅니다.
5. 두 지갑의 위험 점수·탐지 근거·수집 범위와 최종 정책 결정을 확인합니다.

메인넷 카드를 선택하면 송신자는 실제 정상 지갑 수집본으로 맞춰집니다. 송신자와 수신자는 개별 선택도 가능합니다. 각 지갑 아래에서 데이터 출처, 수집 시각, 저장 당시의 조회 구간과 거래 상한을 확인할 수 있습니다.

이 흐름은 저장된 수집본을 Collector가 읽고 KYT·Policy가 다시 평가하는 방식입니다. 새 RPC 조회나 송금은 하지 않습니다. 화면에 입력한 송금 의도는 가상 실험이며, 해당 송금이 실제 발생했다는 의미가 아닙니다.

### 제공 데이터

실제 메인넷 수집본은 [services/collector/fixtures](services/collector/fixtures)에 있습니다. 출처 메타데이터상 2026년 11월 10일 23:46경(KST)에 Nodit Solana RPC에서 수집했습니다.

| 시나리오 | fixtureId | 저장된 거래 / 전송 | 분석·정책 결과 |
| --- | --- | --- | --- |
| 정상 지갑 | `mainnet-normal-wallet` | 8 / 8 | LOW·0점 → ALLOW |
| OFAC SDN 주소 직접 일치 | `mainnet-ofac-sdn-exact` | 5 / 0 | HIGH·100점 → BLOCK |
| 활동량 많은 지갑·거래 한도 도달 | `mainnet-busy-wallet-partial` | 20 / 20 | PARTIAL·점수 null → REVIEW |
| 급속 분산 송금 | `mainnet-rapid-fan-out` | 15 / 20 | MEDIUM·35점 → WARN |

표의 정책 결과는 정상 메인넷 지갑을 송신자로 사용하고 정책 `1.0.0`으로 실행한 기준입니다. 각 디렉터리에는 원본 RPC 기록, 정규화 Snapshot, 수집 요청, 거래 목록과 출처 정보가 있습니다. 전송이 없는 거래도 있으므로 거래 수와 전송 수는 다를 수 있습니다.

다른 데이터와 실행 모드는 다음과 같이 구분합니다.

| 구분 | 위치·방식 | 용도 |
| --- | --- | --- |
| 실제 메인넷 수집본 | `services/collector/fixtures/mainnet-*` | Backend에서 저장된 온체인 기록 재분석 |
| 공통 합성 시나리오 13종 | `contracts/fixtures` | 제재 일치·직접 거래·반복 송금·부분 수집 등의 계약 검증 |
| FE 합성 데모 3종 | `apps/frontend/demo/fixtures` | 브라우저 Mock 시연 또는 별도 데모 데이터 연결 |
| LIVE | Collector의 Solana RPC 호출 | 지정 주소·기간의 온디맨드 수집 |

**Mock 모드**는 브라우저의 MSW가 저장된 합성 응답을 반환하며 엔진을 실행하지 않습니다. 실제 메인넷 시나리오는 Backend 모드에서만 제공합니다. 기본 Compose에서는 FE 전용 데모 시나리오를 숨깁니다.

## 시스템 구성

```text
Frontend (:5173)
    │ Public API /api/v1/*
    ▼
Backend (:8080)
    ├─ Collector     (:8000) ── 저장된 Fixture 또는 Solana RPC
    ├─ KYT Engine    (:8001) ── Snapshot의 위험 신호 평가
    ├─ Policy Engine (:8002) ── 송신자·수신자 평가와 거래 의도로 정책 결정
    ├─ Mock Gateway  (:8003) ── 제출 경로의 정책 집행 실험
    └─ Constellation (:8004) ── 초안 모델과 단일 리더 모델 비교 실험
```

| 모듈 | 구현 | 상세 안내 |
| --- | --- | --- |
| Frontend | React·TypeScript·Vite, AJV 계약 검증, Backend 케이스 영속 저장 | [apps/frontend](apps/frontend/README.md) |
| Backend / Orchestrator | Java 17·Spring Boot, 비동기 분석·심사·실험 API | [apps/backend](apps/backend/README.md) |
| Collector | Python, LIVE/FIXTURE 수집·정규화·OFAC 레이블 로드 | [services/collector](services/collector/README.md) |
| KYT Detection Engine | Python, 외부 RPC·DB 호출 없이 Snapshot 평가 | [services/kyt-engine](services/kyt-engine/README.md) |
| Compliance Policy Engine | Python, 탐지 결과를 정책 결정으로 변환 | [services/policy-engine](services/policy-engine/README.md) |
| Mock Gateway | Java·Spring Boot, 정책 적용·미적용 경로 재현 | [simulations/gateway](simulations/gateway/README.md) |
| Constellation Simulator | Java·Spring Boot, 버전별 실험 모델 | [simulations/constellation](simulations/constellation/README.md) |

KYT는 제재 주소 직접 일치, 제재 주소와의 직접 거래, 급속 분산 송금과 반복 송금을 탐지합니다. Policy는 `ALLOW / WARN / REVIEW / BLOCK`을 반환합니다. 수집이 PARTIAL이면 종합 위험 점수·등급은 null이며, 확인된 근거는 보존합니다. LOW·0점도 안전성이나 적법성을 보증하지 않습니다.

Java 세 모듈과 초기 빌드·실행 도구는 [baypeline/be](https://github.com/baypeline/be)의 `f469cd1c46640d4870f14f7490088dac589e1c0d` 커밋에서 가져왔습니다.

## 개발·운영 Compose

`compose.dev.yaml`과 `compose.prod.yaml`은 각각 7개 서비스의 설정을 포함하는 독립 파일입니다. 공통 Compose 파일을 추가로 지정하지 않습니다. 기본 호스트 포트가 겹치므로 개발·운영 환경은 하나씩 실행합니다.

| 항목 | 개발 | 운영 |
| --- | --- | --- |
| FE | Vite 개발 서버·소스 마운트·HMR | 정적 빌드·Nginx |
| Java | 컨테이너의 JDK·Maven으로 실행 | 빌드 단계에서 테스트·패키징 후 JRE로 실행 |
| Python | editable 설치·소스 마운트 | 일반 설치·소스 마운트 없음 |
| 호스트 포트 | 루프백의 5173, 8080, 8000~8004 | 기본 루프백의 5173, 8080 |
| Constellation 화면용 mock 버전 | 활성화 | 비활성화 |
| 실행 파일시스템 | 개발용 쓰기 영역 사용 | 일반 사용자·읽기 전용, `/tmp` 임시 영역 |

두 환경 모두 FE의 `/api`를 내부 Backend로 프록시합니다. Backend는 내부 서비스가 정상 상태가 된 뒤 시작하고, FE는 Backend가 정상 상태가 된 뒤 시작합니다.

개발 중 FE 소스 변경은 HMR로 반영됩니다. Python·Java 소스 변경은 해당 서비스를 재시작합니다. 의존성·POM·Dockerfile 또는 FE 빌드 시 읽는 데이터 목록을 변경하면 `up --build -d`로 다시 빌드합니다.

### LIVE 데이터 수집 설정

개발 환경에서는 `.env.example`을 `.env`로 복사하고 `SOLANA_RPC_URL`, `SOLANA_RPC_API_KEY`, `SOLANA_RPC_PROVIDER`를 설정합니다. 기존 `.env`가 있으면 덮어쓰지 않고 필요한 항목을 수정합니다.

```bash
# 처음 설정할 때만 실행
cp .env.example .env
# RPC 설정을 편집한 뒤 재기동
docker compose -f compose.dev.yaml up -d collector
```

이후 FE의 **Live on-chain**에서 실제 주소, 조회 기간과 거래 상한을 입력합니다. 수집은 분석 요청 시점에만 실행하며, 주소를 지속 감시하거나 자동으로 데이터를 누적하지 않습니다. 제공자의 이력 보관 기간·조회 한도·수집 시간 예산에 따라 PARTIAL이 될 수 있습니다.

### 운영 구성 실행

```bash
# 처음 설정할 때만 실행. 기존 파일이 있으면 필요한 값만 수정
cp .env.prod.example .env.prod
# 포트·바인딩·RPC·CORS 설정을 편집한 뒤 실행
docker compose --env-file .env.prod -f compose.prod.yaml up --build -d --wait
```

`FRONTEND_PORT`와 `BACKEND_PORT`의 기본값은 5173과 8080입니다. 외부 접근이 필요하면 `FRONTEND_BIND_ADDRESS`를 조정합니다. Collector는 기본적으로 Compose 내부의 `http://collector:8000`을 사용하며, 외부 Collector를 사용할 때만 `COLLECTOR_URL`을 바꿉니다.

`VITE_CONSTELLATION_MODELS`는 FE 빌드 설정이므로 변경 후 FE를 다시 빌드해야 합니다. 나머지 주요 Collector 설정과 데이터 공급자 제약은 [Collector README](services/collector/README.md)에 정리했습니다. 실제 API 키는 `.env` 또는 `.env.prod`에만 두고 커밋하지 않습니다.

## API와 공통 계약

공통 기준은 [contracts/README.md](contracts/README.md), HTTP 명세는 [contracts/openapi.yaml](contracts/openapi.yaml), 구조 밖의 의미 제약은 [contracts/semantics.md](contracts/semantics.md)에 있습니다. 계약 버전은 `0.1.0`이며 규칙·정책·모델 버전은 별도로 관리합니다.

| Public API | 역할 |
| --- | --- |
| `POST /api/v1/analyses` | 분석 접수. 202와 조회용 `Location` 반환 |
| `GET /api/v1/analyses/{id}` | QUEUED → RUNNING → COMPLETED / PARTIAL / FAILED 조회 |
| `GET /api/v1/analyses/{id}/transfers` | 전송 목록 조회. 기본 limit 100, 최대 1000 |
| `POST /api/v1/compliance/evaluate` | 저장된 두 분석과 거래 의도로 정책 심사 |
| `POST /api/v1/experiments/gateway` | 저장된 심사 결과로 제출 경로 실험 |
| `POST /api/v1/experiments/constellation` | 저장된 심사 결과를 참조해 프로토콜 모델 실험 |
| `GET /api/v1/experiments/{recordId}` | 저장된 실험 입력·정책·결과 조회 |
| `GET /api/v1/experiments` | type·intentId·decisionId 필터와 cursor로 실험 기록 조회 |
| `GET /api/v1/cases` | 서버에 저장한 FE 케이스 목록 조회 |
| `GET /api/v1/cases/{caseId}` | 케이스 입력·분석·정책·실험 스냅샷 조회 |
| `PUT /api/v1/cases/{caseId}` | revision을 확인해 케이스 생성·수정 |
| `DELETE /api/v1/cases/{caseId}` | revision을 확인해 케이스 삭제 |

FE는 Public API만 사용합니다. Backend는 저장된 원본 평가·결정을 내부 요청에 사용하며, 브라우저에서 임의로 만든 정책 결정을 받지 않습니다. 계약의 오류 형식은 `{error: {code, message, retryable}, requestId}`이며 요청 추적에는 `X-Request-ID`를 사용합니다.

실험 POST의 결과 형식은 유지하며 `Location`에 저장된 감사 기록 URL을 제공합니다. `EXPERIMENTS_DIR`은 로컬 기본 `.local-data/experiments`, Compose에서는 데이터 볼륨 아래 경로를 사용합니다. `down`은 기록을 보존하고 `down -v`는 볼륨까지 삭제합니다. 저장·재조회 세부 규약은 [Backend README](apps/backend/README.md)를 참고합니다.

## 검증

개발 Compose가 실행 중인 상태에서 실행합니다.

```bash
# FE 테스트·린트
docker compose -f compose.dev.yaml exec -T frontend pnpm test --maxWorkers=2
docker compose -f compose.dev.yaml exec -T frontend pnpm lint

# Collector·KYT·Policy 테스트 및 공통 계약 검증
docker compose -f compose.dev.yaml exec -T kyt-engine python -m pytest -q -p no:cacheprovider
docker compose -f compose.dev.yaml exec -T kyt-engine python contracts/validate.py

# Java 세 모듈 테스트
docker compose -f compose.dev.yaml run --rm --no-deps backend mvn -B -ntp test

# Backend를 대상으로 전체 API 흐름 검증
docker compose -f compose.dev.yaml exec -T -e BACKEND_URL=http://backend:8080 kyt-engine python scripts/e2e_smoke.py /app

# 두 독립 Compose 설정 검증
docker compose -f compose.dev.yaml config --quiet
docker compose --env-file .env.prod -f compose.prod.yaml config --quiet
```

메인넷 연결은 FE 테스트에서 요청 스키마·저장 구간·출처 표시·Mock 제외를 확인하고, 실제 서비스 호출로 네 수집본의 분석·정책 결과를 검증했습니다. 테스트 통과가 모든 계약 경계의 검증 완료를 의미하지는 않습니다.

## Docker 없이 실행

Python 3.11 이상, JDK 17 이상, FE 실행용 Node.js와 pnpm이 필요합니다. Java의 Maven은 루트 Wrapper가 내려받습니다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
scripts/run-local.sh start

# 별도 터미널에서 FE 실행
cd apps/frontend
pnpm install --frozen-lockfile
pnpm dev:backend
```

스크립트는 Collector·KYT·Policy·Gateway·Constellation·Backend를 기동하며 로그는 `.run/logs/`에 남습니다. `scripts/run-local.sh status`와 `stop`으로 확인·종료합니다. 실제 Collector 대신 Backend의 합성 Snapshot 대체 구현을 쓰는 `LOCAL_COLLECTOR_ENABLED=true`에서는 메인넷 수집본을 사용할 수 없습니다.

엔진을 개별 프로세스 또는 파일 입력으로 실행할 수도 있습니다.

```bash
# 서버 명령은 각각 별도 터미널에서 실행
.venv/bin/python -m collector --port 8000
.venv/bin/python -m kyt_engine --port 8001
.venv/bin/python -m policy_engine --port 8002
./mvnw -pl apps/backend spring-boot:run
./mvnw -pl simulations/gateway spring-boot:run
./mvnw -pl simulations/constellation spring-boot:run

# 서버 없이 파일로 실행
.venv/bin/python -m collector --input services/collector/fixtures/mainnet-normal-wallet/collection-request.json
.venv/bin/python -m kyt_engine --input contracts/fixtures/sanctioned/evaluation-request.json
.venv/bin/python -m policy_engine --input contracts/fixtures/sanctioned/policy-request.json
.venv/bin/python scripts/demo_engines.py --scenario direct-flow --policy-version 1.1.0
```

Windows PowerShell에서는 Python 실행 경로를 `.venv/Scripts/python.exe`로 바꾸고 앞에 `&`를 붙입니다. Maven은 `.\mvnw.cmd`를 사용합니다. 통합 실행용 셸 스크립트는 macOS/Linux용이며, 개별 실행법은 각 모듈 README를 참고합니다.

## 데이터 보관과 현재 한계

- Backend의 분석·심사는 메모리에 저장하지만, 성공한 실험의 입력·원본 정책·결과는 파일 감사 기록으로 보관합니다. Compose의 `backend-data` 볼륨으로 재시작 후에도 실험 기록을 조회할 수 있습니다. Backend 모드의 FE 케이스(분석·정책 스냅샷과 실험 기록)도 같은 볼륨에 영속 저장하고 목록·상세 화면에서 다시 조회합니다. 기존 브라우저 기록은 서버 저장을 확인한 뒤 이전합니다. Mock 모드만 로컬 IndexedDB를 사용하며 지속 수집·운영 DB 적재는 구현되어 있지 않습니다.
- 저장된 메인넷 수집본은 특정 시점의 기록입니다. 현재 지갑 상태나 평가의 신선도를 보장하지 않습니다. 실제 데이터와 합성 데이터, OFAC 레이블과 테스트 레이블은 별도로 표시합니다.
- Backend는 공통 JSON Schema로 Public 요청·성공 응답과 내부 모듈 응답을 검증하고, 요청 범위·전송·근거·정책 연결 관계도 확인합니다. 잘못된 내부 결과는 공개하거나 성공 실험 기록으로 저장하지 않습니다. FE도 응답 스키마를 별도로 검증합니다.
- Constellation은 팀 리서치의 40%·60% 규칙을 고정한 `0.2.0-research`와 단일 리더 비교 모델을 사용합니다. [모델 명세](contracts/research/constellation-40-60.md)에 따라 전체 참여율 부족은 블록 건너뛰기로 구분하며, 공식 메인넷 검증·실제 거래 실행·확률·지연 측정을 뜻하지 않습니다. 과거 0.1.0 결과는 그대로 조회합니다.
- Gateway는 제출 경로를 모의 실행하며 `actualBroadcast`는 항상 false입니다. ALLOW나 모의 제출 허용은 실제 송금·거래 포함·안전성을 보장하지 않습니다.
