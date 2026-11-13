# Backend 연결 가이드

Backend와 배포를 맡은 분을 위한 문서입니다. 프론트엔드(`apps/frontend`)를 이 저장소의 Backend(`apps/backend`)에 붙이는 방법과, 배포할 때 양쪽에서 맞춰야 하는 설정을 적었습니다.

프론트엔드는 Backend Public API 6개(`/api/v1/*`)만 부릅니다. 내부 모듈(8000~8004)은 부르지 않습니다.

## 0. 확인된 것 (2026-11-11)

`scripts/run-local.sh start`(2절의 데모 폴더 설정 포함)로 띄운 Backend에 `pnpm dev:backend`로 붙여서 화면에서 확인했습니다.

- 기본 케이스(Common sender → 데모 시나리오 `demo-layering`), 정책 1.1.0: "This transfer is blocked.", 위험도 100, 근거 두 줄("제재 목록의 상대 2곳과 3건", "13:10:00~13:13:30 사이 6개 지갑으로 6건")
- "What if it's sent another way?"의 경로 비교: "Through this app"은 Stopped, 정책을 건너뛰는 경로는 Submitted
- "On the network": 증명 100%에서 초안 모델은 "The leader must include it.", 단일 리더 모델은 "Nothing forces the leader to include it."
- 데모 폴더 설정 없이 띄우면 기본 케이스가 "A backend module did not respond." / "collector: fixture not found: demo-layering"으로 멈춤
- Docker dev 구성(`compose.dev.yaml` + `apps/frontend/demo/compose.demo.yaml`): 다섯 서비스가 healthy로 뜨고, `demo-layering` 분석이 COMPLETED, 위험도 100으로 끝남(API로 확인)

아래는 모노레포 통합 전의 `baypeline/be`(같은 코드, `f469cd1`)로 확인한 것입니다.

- Common sender → Sanctioned recipient: Block, 위험도 100, 근거 `synthetic-sanction-001`
- Common sender → partial-sanctioned: Block, 위험도는 0이 아니라 "Not scored"
- Backend를 끈 상태: "Could not reach the backend."
- Backend 재시작 후 예전 케이스에서 시뮬레이션: "Backend가 이 실행을 더 이상 갖고 있지 않음" 배너, Re-run case로 복구
- 증명 비율 sweep: 65%까지 포함 강제 안 됨, 70%부터 강제(임계값 66.67%와 맞음)
- 배포용 빌드(`VITE_API_BASE_URL=http://127.0.0.1:8080`)를 다른 출처(`localhost:4173`)에서 열었을 때: `CORS_ALLOWED_ORIGINS`에 그 출처가 없으면 "Could not reach the backend.", 넣으면 케이스와 시뮬레이션 모두 동작

## 1. 실행 구성에 따라 달라지는 것

| 구성 | 수집 | 계약 fixture 시나리오 | 프론트 데모 시나리오 | LIVE |
| --- | --- | --- | --- | --- |
| `scripts/run-local.sh`, `compose.dev.yaml` | fixture collector(파일을 읽음) | 됨 | 2절 설정을 하면 됨 | 안 됨(`UPSTREAM_UNAVAILABLE`) |
| `compose.prod.yaml` | 실제 Collector(`COLLECTOR_URL`) | Collector가 지원하는 만큼 | 안 됨 | Collector가 지원하는 만큼 |
| Mock(Backend 없음) | 브라우저 안 | 됨 | 됨 | 안 됨 |

프론트 데모 시나리오(`apps/frontend/demo/fixtures`)는 공통 계약에 없는 프론트 쪽 데이터입니다. 계약 fixture는 거래가 0~3건이라 "이 지갑이 한 일"이 보이지 않아서, 하루치 활동이 있는 시나리오 3개를 따로 만들었습니다. 거래 데이터만 만들었고, 분석과 정책 결과는 이 저장소의 실제 KYT·Policy 엔진이 낸 응답을 저장한 것입니다.

**새 케이스의 기본값이 데모 시나리오입니다.** 그래서 Backend 모드로 배포할 때는 아래 둘 중 하나가 필요합니다.

- Backend의 fixture collector가 데모 폴더를 읽게 한다(2절). dev 구성에서만 가능합니다.
- 프론트 빌드에 `VITE_DEMO_FIXTURES=off`를 준다(4절). 그러면 Backend 모드에서 데모 시나리오를 목록에서 빼고 기본값이 계약 fixture로 바뀝니다. 운영 구성(`compose.prod.yaml`)은 이쪽입니다.

## 2. dev 구성에서 데모 시나리오 쓰기

먼저 계약 fixture와 데모 snapshot을 한 폴더로 모읍니다. 이 폴더(`apps/frontend/demo/.backend-fixtures`)는 git에 올라가지 않으므로 Backend를 띄우는 머신에서 만들어야 합니다(Node 필요).

```bash
cd apps/frontend && pnpm demo:fixtures
```

`scripts/run-local.sh`로 띄울 때는 폴더를 환경 변수로 줍니다(저장소 루트에서).

```bash
LOCAL_COLLECTOR_FIXTURES_DIR=$PWD/apps/frontend/demo/.backend-fixtures scripts/run-local.sh start
```

Docker(dev)로 띄울 때는 덮어쓰기 파일을 함께 줍니다(저장소 루트에서).

```bash
docker compose -f compose.dev.yaml -f apps/frontend/demo/compose.demo.yaml up --build -d --wait
```

- 거래 데이터를 바꾸면 `pnpm demo:snapshots`, `pnpm demo:fixtures`, (Backend를 위처럼 띄운 뒤) `pnpm demo:record` 순서로 다시 만듭니다.
- 저장된 결과는 ruleset 1.0.0과 정책 1.0.0, 1.1.0 기준입니다. 규칙이나 정책이 바뀌면 `pnpm demo:record`로 다시 받아야 Mock이 Backend와 같은 답을 냅니다.

## 3. 배포할 때 Backend 쪽 설정

운영 구성은 루트 `README.md`의 "운영 환경"과 `.env.prod.example`을 따릅니다. 프론트와 맞춰야 하는 것만 적습니다.

- `CORS_ALLOWED_ORIGINS`: 배포된 프론트엔드의 출처를 넣습니다. 출처는 scheme과 host(와 port)만이고 경로는 넣지 않습니다. GitHub Pages 프로젝트 페이지라면 `https://baypeline.github.io`입니다.
- 공개 주소는 HTTPS여야 합니다. 프론트가 HTTPS(GitHub Pages 등)에 있으면 HTTP API 호출은 브라우저가 막습니다. Backend는 기본으로 `127.0.0.1:8080`에만 열리므로(`BACKEND_BIND_ADDRESS`), 그 앞에 HTTPS 리버스 프록시나 터널을 둡니다. 앱은 `/api/v1/*`만 부르고, 5절처럼 밖에서 확인하려면 `/health`도 넘깁니다.
- 프록시가 Backend에 닿지 못해 502/503/504를 돌려주면 프론트는 "Could not reach the backend."로 표시합니다. 계약 형식(`{error: {code, message, retryable}, requestId}`)으로 온 오류는 그 코드대로 표시합니다.
- 응답 헤더 `X-Request-ID`는 CORS로 노출되어 있어야 합니다(`apps/backend`의 `BackendConfig`에 이미 있음). 프론트는 이 값을 케이스의 Audit에 남깁니다.
- 운영 구성은 Constellation mock 버전을 끕니다. 프론트의 "Custom scenario"에서 mock 버전(`0.0.0-research-pending`)을 고르면 422가 오고 "This version is not supported."가 나옵니다. 시나리오 버튼은 초안 모델과 단일 리더 모델만 씁니다.
- 분석·심사 기록은 메모리에 있어서 Backend를 재시작하면 사라집니다. 브라우저에 남은 케이스로 시뮬레이션을 다시 돌리면 404(`NOT_FOUND`)가 오고, 프론트는 "재시작된 것 같으니 케이스를 다시 실행하라"는 배너를 보여줍니다. 따로 할 일은 없습니다.

## 4. 프론트엔드 빌드 변수

`apps/frontend/.env.production.example`을 `.env.production`으로 복사하거나, 같은 이름의 변수를 CI 빌드 환경에 넣습니다.

| 변수 | 값 |
| --- | --- |
| `VITE_API_MODE` | `backend` |
| `VITE_API_BASE_URL` | Backend의 공개 HTTPS 주소. 예: `https://backend.example.org` |
| `VITE_CONSTELLATION_MODELS` | `0.1.0-draft,0.1.0-single-leader`. `simulations/constellation/src/main/resources/application.yml`의 `constellation.models.*.version`과 같게 맞춥니다. Public API에 모델 목록 조회가 없어서 빌드 설정으로 받습니다. |
| `VITE_DEMO_FIXTURES` | Backend가 데모 폴더를 읽지 않으면 `off`(운영 구성). 읽으면 생략 |
| `VITE_BASE_PATH` | 앱이 놓이는 경로. 도메인 루트면 `/`, GitHub Pages 프로젝트 페이지면 `/<저장소 이름>/` |

```bash
cd apps/frontend
pnpm install
pnpm build        # 결과: dist/ (정적 파일)
```

라우팅은 `#/...` 형식이라 정적 호스팅에 rewrite 설정이 필요 없습니다.

배포된 앱에서도 설정 메뉴의 "Use Mock data"로 그 브라우저만 Mock으로 바꿀 수 있습니다. Mock에서는 데모 시나리오가 항상 됩니다. Backend가 시연 중에 내려가면 이것으로 넘어갑니다.

## 5. 연결 확인 순서

1. Backend의 `/health`가 응답하는지 봅니다.

   ```bash
   curl -s https://backend.example.org/health
   ```

2. 배포된 앱에 로그인하고 상단 바 오른쪽이 `Backend · <주소>`인지 봅니다. `Mock data`라면 그 브라우저가 Mock으로 바뀐 것이니 설정 메뉴에서 "Use the build setting"을 누릅니다.
3. New case를 기본값 그대로 실행합니다.
   - 데모 폴더를 읽는 Backend: "This transfer is held for review."(정책 1.0.0) 또는 Advanced에서 정책 1.1.0을 골라 "This transfer is blocked."
   - `VITE_DEMO_FIXTURES=off`로 빌드한 경우: 목록에 데모 시나리오가 없어야 합니다. "Sanctioned recipient"를 골라 실행하면 Block, 위험도 100, 근거 `synthetic-sanction-001`이 나와야 합니다(Collector가 그 fixture를 지원할 때).
4. 케이스 화면에서 "What if it's sent another way?"를 누릅니다. "Through this app"은 Stopped, "By a route that skips the policy"는 Submitted가 나와야 합니다.
5. "On the network" 탭에서 시나리오 버튼 3개를 차례로 누릅니다. 증명 100%에서는 초안 모델이 "The leader must include it.", 30%에서는 두 모델 모두 "Nothing forces the leader to include it."가 나와야 합니다(임계값 66.67% 기준).

## 6. 화면 문구로 원인 찾기

- "Could not reach the backend.": 주소가 틀렸거나, Backend가 꺼졌거나, CORS에서 거부되었습니다. 브라우저는 CORS 거부를 연결 실패로만 알려주므로 개발자 도구 콘솔에서 CORS 오류를 확인합니다.
- "A backend module did not respond." 아래에 "collector: fixture not found: demo-…": Backend가 데모 폴더를 읽지 않습니다. 2절을 하거나 `VITE_DEMO_FIXTURES=off`로 다시 빌드합니다.
- "The backend sent an error without the agreed format.": 계약 형식이 아닌 오류 응답입니다. 응답 본문의 앞부분이 오류 상자 맨 아래에 나옵니다.
- "The backend sent a response that breaks the shared contract.": 응답이 `contracts/schemas`와 맞지 않습니다. 결과를 믿을 수 없어서 표시하지 않습니다.
- "The backend no longer has this run, probably because it restarted.": 3절 마지막 항목입니다.

## 7. 제안 (선택)

- **Collector의 fixture를 화면에서 고르기**: 프론트는 시나리오 목록을 `contracts/fixtures/*/analysis-request.json`과 `apps/frontend/demo/fixtures`에서 만듭니다. Collector PR의 메인넷 fixture(`services/collector/fixtures`)를 새 케이스 목록에 올리려면 프론트가 그 요청 파일을 읽게 하거나, Public API에 시나리오 목록 조회를 두어야 합니다. 실제 온체인 데이터라 주소가 익스플로러와 Arkham으로 연결되고, 데모 시나리오보다 좋은 시연 자료가 됩니다.
- **pslice 설명 코드**: Network 결과의 설명 줄은 Simulator가 보낸 설명 코드만 문장으로 옮깁니다. pslice는 없을 때만 `PSLICE_UNAVAILABLE`이 오고, 있을 때는 아무 코드도 오지 않아 화면에 pslice에 대한 말이 없습니다. 있을 때도 보여주려면 `contracts/schemas/experiment.schema.json`의 설명 코드 목록을 바꿔야 하므로 계약 담당과 정해야 합니다.
- **모델 이름표**: 모델 버전의 화면 이름("Constellation (draft rules)", "Single leader (today)")은 프론트의 `src/i18n/en.ts`(`ui.sim.network.modelName`)에 있습니다. 버전을 추가하면 여기에 이름을 넣어 주세요. 없으면 버전 문자열이 그대로 보입니다.
- **Constellation 용어 정의**: 화면 툴팁의 pslice, attestation, proposer, leader 정의는 Simulator 코드와 README를 보고 쓴 초안입니다. Simulator 담당의 확인이 필요합니다(`src/i18n/en.ts`의 `glossary`).

## 로컬에서 다시 확인하기

1. 루트 `README.md`의 "Python 엔진 설치와 실행"대로 `.venv`를 만들고, JDK 17을 준비합니다(macOS: `brew install openjdk@17`, 그 셸에서 `export PATH="$(brew --prefix openjdk@17)/bin:$PATH"`). Docker를 쓰면 둘 다 필요 없습니다.
2. 2절의 방법 중 하나로 Backend를 띄웁니다. 끝나면 `scripts/run-local.sh stop` 또는 `docker compose -f compose.dev.yaml down`.
3. `apps/frontend`에서 `pnpm dev:backend`. dev 서버의 proxy가 브라우저 Origin을 빼고 넘기므로 5173이 아닌 포트에서도 CORS 설정 없이 붙습니다.
