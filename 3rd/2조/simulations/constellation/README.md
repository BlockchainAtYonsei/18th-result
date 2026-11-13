# Constellation Simulator

팀 리서치의 40%·60% 조건을 검증하는 결정론적 오프체인 모델입니다. [공통 모델 명세](../../contracts/research/constellation-40-60.md)를 기준으로 입력·결과·버전을 관리합니다.

- `0.2.0-research`: 대상 묶음 증명률 `attestationPercent` 40%와 전체 증명 참여율 `attesterParticipationPercent` 60%를 별도로 판단합니다.
- `0.2.0-single-leader`: 같은 거래 조건에서 리더의 선택적 제외 재량만 비교합니다. Constellation의 증명 규칙을 적용하지 않습니다.
- `0.0.0-research-pending`: Mock 설정을 켠 개발 환경에서만 화면 확인용 고정 결과를 반환합니다.
- `0.1.0-*`: 과거 기록 조회용입니다. 새 실행은 422로 거부합니다.

전체 참여율 부족은 `BLOCK_SKIPPED`이며 특정 거래만 차단했다는 뜻이 아닙니다. 리더가 필수 묶음을 제외하면 블록 상태는 `INVALID_LEADER_EXCLUSION`입니다. 필수 묶음의 데이터가 없으면 포함 의무를 보존한 채 블록을 건너뛰는 것으로 모델링합니다. 자세한 가정과 판정 순서는 공통 명세에 있습니다.

임계값과 모델 버전은 코드에 고정되어 있으며 환경 변수로 동일 버전의 의미를 바꿀 수 없습니다. `modelParameters`에 적용한 출처·기준을 반환합니다. 실제 거래 전송·지분 추첨·지연·MEV·증명의 암호학적 검증은 수행하지 않습니다.

실행은 루트 개발·운영 Compose를 사용하며, Java 모듈 테스트는 `mvn -pl simulations/constellation test`로 실행합니다.
