# Backend API & Orchestrator

Frontend와 내부 모듈을 연결하고 분석 작업의 실행 순서·상태·결과를 관리합니다. (포트 8080)

- 흐름: 분석 작업 생성 → Collector 호출 → Snapshot 저장 → KYT 호출 → 평가 저장 → 조회 API,
  정책 심사 요청 시 Policy 호출, 실험 요청 시 Gateway·Simulator 호출
- 패키지: `analysis`(작업·상태), `compliance`(정책 심사 기록), `experiment`(실험), `upstream`(내부 모듈 클라이언트), `support`(계약 검증·오류 응답)
- 위험도·정책 결과를 계산하지 않으며, 내부 응답의 연결 관계를 검증한 뒤에만 노출합니다.
- `compliance.local-collector.enabled=true`: Collector 대신 `contracts/fixtures/{fixtureId}/snapshot.json` 사용 (로컬 개발 전용)

```bash
./mvnw -pl apps/backend spring-boot:run      # 또는 루트의 scripts/run-local.sh start
./mvnw -pl apps/backend test
```

## 공통 계약 검증

빌드할 때 루트 `contracts/schemas/*.schema.json`을 JAR에 포함하고 JSON Schema 2020-12 검증기로 읽습니다. 원격 스키마를 조회하지 않습니다. Public 요청과 성공 응답, Collector·KYT·Policy·Gateway·Constellation의 내부 응답을 같은 계약으로 검증합니다.

필수 필드·추가 필드·Enum·범위·날짜 형식에 더해 Snapshot 요청 범위, 전송·근거 참조, 점수 기여도 합계, 평가·의도·정책 연결 관계를 확인합니다. 내부 성공 응답의 스키마·의미가 잘못되면 502 `CONTRACT_VALIDATION_FAILED`로 거부하며, 비동기 분석은 FAILED로 기록하고 잘못된 평가를 공개하지 않습니다. 전송 계층의 JSON·오류 응답 형식·추적 ID가 잘못되면 502 `UPSTREAM_UNAVAILABLE`로 처리합니다. 내부 오류 응답의 원문 메시지는 외부에 전달하지 않습니다.

## 실험 결과 저장·재조회

성공한 실험은 실행마다 별도의 `recordId`로 저장합니다. 기존 POST의 결과 JSON과 HTTP 200은 유지하고, `Location`에 감사 기록 조회 URL을 추가합니다. 의미가 같은 실험의 `experimentId`·`simulationId`가 같더라도 실행 기록은 별개입니다.

```text
POST /api/v1/experiments/gateway
POST /api/v1/experiments/constellation
  → Location: /api/v1/experiments/record-...

GET /api/v1/experiments/{recordId}
GET /api/v1/experiments?type=GATEWAY&decisionId=...&limit=100
```

기록은 `schemaVersion`, `recordId`, `type`, `requestId`, `createdAt`, `intentId`, `decisionId`, `request`, `result`, `review`를 포함합니다. `review`에는 당시의 송금 의도·송수신 평가·정책 결정을 함께 보관하므로 원래 Backend 프로세스가 종료되어도 감사 맥락을 조회할 수 있습니다.

목록은 최신순이며 `type`(GATEWAY/CONSTELLATION), `intentId`, `decisionId`로 필터링합니다. `limit`은 기본 100, 최대 1000이고 `pagination.nextCursor`로 다음 페이지를 조회합니다. 필터를 바꾼 cursor와 잘못된 cursor는 400, 없는 기록은 404입니다. 저장 실패는 503이며 성공 결과를 반환하지 않습니다.

`EXPERIMENTS_DIR`의 기본값은 `.local-data/experiments`입니다. 실행마다 JSON 파일 하나를 임시 파일에 쓴 뒤 원자적으로 게시합니다. 손상된 기록은 정상 결과로 간주하거나 조용히 건너뛰지 않고 503으로 처리합니다. 이 파일 저장소는 단일 호스트 PoC용이며 목록 조회 시 파일을 순회합니다.

개발 Compose는 `/workspace/data`, 운영 Compose는 `/app/data`에 `backend-data` 볼륨을 연결합니다. `down`·재기동 시 기록을 유지하며 `down -v`는 해당 볼륨까지 삭제합니다. 검증에 실패한 내부 결과나 실패한 실험 호출은 성공 감사 기록으로 저장하지 않습니다.

분석 작업·정책 심사 저장소는 여전히 메모리입니다. 재시작 후 기존 실험 기록은 조회할 수 있지만, 과거 decisionId로 새 실험을 실행하려면 분석·심사를 다시 수행해야 합니다. FE 케이스 화면은 아래 서버 케이스 저장소에서 스냅샷과 실험 결과를 다시 불러옵니다. `/experiments` 감사 기록 자체의 별도 탐색 화면과는 구분합니다.

## FE 케이스 영속 저장

`GET /api/v1/cases`는 `CasePage`(최대 100개, `nextCursor`)를, `GET /api/v1/cases/{caseId}`는 `CaseDocument`를 반환합니다. `PUT /api/v1/cases/{caseId}`는 `{schemaVersion, expectedRevision, case}`를 받아 전체 케이스를 원자적으로 저장합니다. 신규 생성은 expectedRevision=0, 이후에는 마지막 조회 revision을 사용하며 변경된 경우 409 CONFLICT입니다. `DELETE /api/v1/cases/{caseId}?revision=...`도 같은 충돌 검사를 수행합니다.

케이스 입력과 모든 중첩 API 응답은 공통 스키마로 검증합니다. `CASES_DIR` 기본값은 `.local-data/cases`이며 개발·운영 Compose는 각각 `/workspace/data/cases`, `/app/data/cases`를 기존 `backend-data` 볼륨에 보관합니다. 단일 Backend 프로세스용 파일 저장소입니다. 삭제는 FE 케이스만 지우며 서버의 불변 실험 감사 기록은 유지합니다.

케이스는 FE가 보낸 표시용 스냅샷입니다. 새 정책 판단이나 실험 실행의 근거로 신뢰하지 않으며, 실행 API는 기존처럼 Backend가 직접 확보한 원본 심사만 사용합니다. 케이스 저장으로 메모리의 분석 작업·decisionId가 복원되지는 않습니다.
