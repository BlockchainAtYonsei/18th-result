# 구형 계약 종료 점검

**BAY 18기 정규 세션 · 보안 주제 프로젝트 보고서 전용 저장소**

지원이 끝난 Notional Finance V1 스마트 컨트랙트를 대상으로,  
(1) 숫자 형 변환 경계값 테스트, (2) 공개 ABI 함수 분류, (3) 업그레이드 저장 구조 비교를  
**방어적으로** 점검한 팀 프로젝트입니다.

- 공격 재현, 익스플로잇 PoC, 메인넷 포크에서의 자금 이동 코드는 **포함하지 않습니다**.
- 이 저장소의 목적은 **프로젝트 진행 보고서와 재현 가능한 방어용 산출물**을 공개하는 것입니다.

## 문서

| 파일 | 설명 |
| --- | --- |
| [프로젝트_진행_보고서.md](./프로젝트_진행_보고서.md) | 정규 세션 제출용 프로젝트 진행 보고서 |
| [기획서_구형계약종료점검.md](./기획서_구형계약종료점검.md) | 프로젝트 기획서 |
| [artifacts/](./artifacts/) | 테스트 표, ABI 분류, 저장 구조 비교 결과 |
| [logs/](./logs/) | 실행 로그 원문 |

## 핵심 질문

출금을 남길 때, 새 청구권을 만드는 함수는 얼마나 줄일 수 있는가?

관련 리서치 아티클 초안 주제: **「스마트 컨트랙트의 보안 관리는 언제 끝나는가」**

## 산출물 요약 (실행 결과)

| 산출물 | 결과 (워크스페이스에서 실측) |
| --- | --- |
| 경계값 Foundry 테스트 | 14 passed / 0 failed. unsafe `2^128` → **0**, `2^128+1` → **1**, 범위 검사 → **REVERT** |
| ABI 함수 분류 | 총 **180**개. primary: 출금 8 · 정산·상환 13 · 신규 13 · 기타·관리자 145 · 수동 1 |
| 저장 구조 비교 | **최소 예제**. Restricted MATCH 5 / MISMATCH 0 · Broken MATCH 0 / MISMATCH 4 |

분석에 고정한 Notional V1 GitHub 커밋: `4bf7a85e6cf81cde4283e0efab0b03f21249ba00`  
`ExchangeRate.sol` 패턴: `uint128(balance.abs())` (`pragma solidity ^0.6.0`)

## 재실행 방법

필요 도구: [Foundry](https://book.getfoundry.sh/), Python 3

```bash
# 의존성
cd casting-boundary
forge install foundry-rs/forge-std@v1.17.0
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2
forge test -vv

cd ../casting-boundary06
forge build   # Solidity 0.6.12 컴파일 확인

cd ../storage-layout
forge build
forge inspect Baseline storageLayout
forge inspect Restricted storageLayout
forge inspect Broken storageLayout

cd ..
python3 scripts/classify_abi.py
```

자세한 경로·로그 위치는 보고서와 `logs/tool_versions.txt`를 참고하세요.

## 범위 밖

- Notional V1 공격 경로 재현
- Escrow에서 자금을 빼내는 스크립트
- 실제 운영용 종료 계약 배포

## 라이선스·출처

- 팀 작성 문서·테스트·스크립트: 이 저장소에 공개
- Notional 원 계약 코드 인용·분석: [notional-finance/contracts](https://github.com/notional-finance/contracts) 및 공개 ABI(Sourcify)
- 사고·종료 사실: [V1 Deprecation Notice](https://blog.notional.finance/notional-v1-deprecation-notice/), [Post-Mortem](https://blog.notional.finance/notional-v1-exploit-post-mortem/)

BAY 18기 정규 세션 제출물입니다.

## 제출 정보

- 2주차 5조
- 원본: [lejuho/bay18-legacy-contract-retirement-check](https://github.com/lejuho/bay18-legacy-contract-retirement-check)
- 가져온 커밋: `50da1fe33106854e6baa9c9a0f86273bd5bb030c`
