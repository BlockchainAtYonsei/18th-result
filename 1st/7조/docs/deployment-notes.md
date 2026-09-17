# 배포 준비 기록

> 기준일: 2026-09-17  
> 범위: Base Sepolia 컨트랙트 배포와 운영 애플리케이션 이미지

## CRB-DEP-001 — 운영 이미지가 로컬 생성 산출물에 의존

- 상태: 부분 해결
- 영향: 깨끗한 GitHub Actions checkout에는 `frontend/src/generated/contracts`와 백엔드 생성 리소스가 없어 운영 이미지 빌드 및 체인 설정 조회가 실패할 수 있음
- 처리: 임의의 canonical deployment manifest에서 양쪽 애플리케이션의 manifest, ABI와 client metadata를 만드는 `scripts/sync-contract-artifacts.sh` 추가
- 남은 작업: Base Sepolia 실제 배포 후 `contracts/deployments/base-sepolia/84532.json` 생성·검토·커밋, CI 이미지 빌드 전에 동기화 명령 실행

## CRB-DEP-002 — 웹 이미지와 테스트넷 배포 순서

- 상태: 운영 절차 확정
- 판단: 서버, Compose와 빈 애플리케이션 배포 기반은 컨트랙트보다 먼저 준비할 수 있으나 현재 프론트엔드는 주소를 빌드에 포함하므로 투자 기능이 동작하는 최종 이미지는 컨트랙트 배포 이후 생성
- 절차: 배포 시뮬레이션과 보안 점검 → 웹 배포 기반 준비 → Base Sepolia 실제 배포 → manifest 검토·커밋 → 최종 이미지 빌드·교체

## CRB-DEP-003 — 개발용 faucet의 운영 노출

- 상태: 해결
- 영향: 현재 프론트엔드 faucet API는 공개된 Anvil 배포자 키와 unrestricted mint가 가능한 `MockSettlementToken`을 전제로 하므로 운영용 기능으로 사용할 수 없음
- 처리: 배포 manifest의 체인 ID가 Anvil인 경우에만 테스트 토큰 버튼과 관리자 패널을 표시하고, faucet API도 그 외 체인에서는 `404`로 차단
- 후속 작업: Base Sepolia 테스트 토큰 지급 정책과 투자자 allowlist 등록 절차 별도 구성

## CRB-DEP-016 — 운영 프론트엔드의 Anvil 체인 고정

- 문제: 운영 이미지가 Base Sepolia manifest를 포함해도 Wagmi transport와 네트워크 전환 버튼은 Anvil `31337` 및 `127.0.0.1:8545`로 고정
- 영향: 운영 화면에서 지갑을 연결해도 Base Sepolia 컨트랙트의 잔액 조회와 투자 트랜잭션 실행 불가
- 처리: 생성된 manifest의 체인 ID에 따라 로컬에서는 Anvil, 운영에서는 Base Sepolia 체인과 기본 RPC를 선택하도록 구성
- 사용성: MetaMask 연결 요청이 이미 진행 중일 때 다시 연결 버튼을 누르면 진행 중인 요청을 확인하라는 한국어 안내 추가

## CRB-DEP-004 — Base Sepolia 권한 이전

- 상태: 스크립트와 테스트 구성
- 처리: 배포자를 임시 관리자로 사용해 Bridge를 생성한 뒤 관리자·발행자·정산자 역할을 지정 주소에 부여하고 불필요한 배포자 역할 제거
- 검증: 체인 ID 제한, mock 또는 기존 정산 토큰 선택, 코드가 없는 토큰 주소 거부, 최종 역할과 manifest 일치 테스트
- 실제 상태: Base Sepolia에는 아직 배포하지 않음

## CRB-DEP-005 — ERC-1155 수익권 metadata 제공

- 상태: API 구성
- 처리: `/api/revenue-rights/{id}.json`에서 백엔드 상품 정보를 ERC-1155 metadata JSON으로 변환하고 공개 조회 허용
- 호환성: 10진수 ID, `0x` 접두사 16진수 ID와 ERC-1155 클라이언트가 사용하는 64자리 0 채움 16진수 ID 지원
- 캐시 정책: 상품 상태 변경을 반영할 수 있도록 성공 응답을 60초 동안 캐시하고 300초 동안 stale 응답 재검증 허용
- 남은 작업: 운영 백엔드 상품 데이터와 영구 저장 이미지 연결, Base Sepolia 배포 후 실제 지갑·블록 탐색기 metadata 조회 검증

## CRB-DEP-006 — 생성 ABI의 TypeScript 타입 확장

- 상태: 해결
- 영향: JSON으로 생성된 ABI의 `type` 필드가 일반 문자열로 추론되어 Wagmi 다중 조회의 production 타입 검사가 실패
- 처리: 다중 조회에 전달하는 생성 ABI를 Viem `Abi` 타입으로 명시해 동기화 산출물과 Wagmi 입력 타입 연결

## CRB-DEP-007 — CI의 컨트랙트 산출물 의존성

- 상태: 해결
- 영향: 생성 ABI와 배포 정보가 Git에서 제외되어 깨끗한 checkout에서 프론트엔드 검증 불가
- 처리: 공개된 Anvil 주소만 포함한 CI 전용 manifest를 기준으로 ABI와 클라이언트 산출물을 만든 뒤 lint와 production build 실행
- 제한: CI manifest는 컴파일 검증 전용이며 GHCR 운영 이미지에는 Base Sepolia `84532.json`만 사용

## CRB-DEP-008 — 운영 컨테이너 교체 상태 판정

- 상태: 해결
- 영향: 프로세스 실행 여부만으로는 프론트엔드와 백엔드가 실제 요청을 처리할 수 있는지 판정 불가
- 처리: 양쪽 애플리케이션에 revision을 포함하는 health API를 추가하고 운영 Compose의 의존성과 상태 검사에 연결
- 보안 설정: 운영 포트를 기본적으로 loopback에만 바인딩하고 컨테이너 권한 상승 방지 및 로그 파일 크기 제한 구성

## CRB-DEP-009 — 검증되지 않은 체인 주소의 운영 이미지 게시

- 상태: 방지 구성
- 영향: CI용 Anvil 주소로 빌드한 이미지를 운영에 게시하면 Base Sepolia에서 잘못된 컨트랙트 호출 발생
- 처리: `84532.json`의 체인·네트워크·metadata URI·컨트랙트·권한 주소와 비밀 필드 부재를 검증한 경우에만 GHCR 게시 및 서버 배포 작업 개방
- 배포 방식: 커밋 SHA 불변 태그로 frontend와 backend 이미지를 함께 교체하고 health 실패 시 직전 SHA 태그로 복구

## CRB-DEP-010 — Windows 운영 서버 배포 실행 환경

- 상태: 반영
- 운영 환경: Windows x64의 Docker Desktop WSL 2 backend와 Linux container 모드
- 처리: deploy 작업의 runner 라벨을 Windows로 변경하고 PowerShell 기반 이미지 교체 및 자동 복구 스크립트 구성
- 포트: Windows loopback의 frontend `5386`, backend `8081` 사용
- 운영 제약: self-hosted runner를 Docker Desktop을 실행하는 동일 Windows 계정으로 구성하고 서비스 계정에서 Docker CLI 접근 확인 필요

## CRB-DEP-011 — Windows 운영 서버 러너 및 배포 자동화 지원

- 상태: 해결
- 영향: Windows 운영 서버에 Self-Hosted Runner를 설치하고 환경 파일 디렉터리를 구성하는 과정이 수동으로 진행되어 설정 누락 발생 가능
- 처리: 사전 점검, 환경 디렉터리(`C:\ProgramData\CreatorRevenueBridge\.env.production`) 및 ACL 설정, Runner 다운로드와 등록을 한 번에 수행하는 `scripts/setup-production-runner.ps1` 추가
- 추가 유틸리티: CI에서 게시된 GHCR 이미지를 로컬에서 수동/자동으로 풀하고 배포할 수 있는 `scripts/pull-and-deploy.ps1` 추가 및 워크플로 스크립트 검증 연동
- 검증: PowerShell 구문 분석기 및 `setup-production-runner.ps1 -ConfigureEnvOnly` 실행으로 디렉터리·파일·ACL 권한 정상 적용 확인

## CRB-DEP-012 — 운영 러너 배포 전 연결 점검

- 문제: Base Sepolia manifest가 생성되기 전에는 deploy 작업이 생략되어 운영 runner의 Docker 접근 권한과 환경 파일 구성을 실제 GitHub Actions 실행 계정으로 확인하기 어려움
- 영향: 최초 운영 배포 시점에 runner 서비스 계정의 Docker 접근 또는 환경 파일 권한 문제를 뒤늦게 발견할 가능성
- 처리: 배포 없이 Docker daemon, Linux container 모드, Docker Compose, 운영 환경 파일과 Compose 구성을 검사하는 수동 `Production runner check` 워크플로 구성
- 보안: `main` ref와 `production` 환경 승인을 통과한 작업만 `production` 라벨 runner에서 실행되도록 제한

## CRB-DEP-013 — Windows 러너 PowerShell 실행기 호환성

- 문제: Windows 11 기본 환경에는 Windows PowerShell만 설치되어 있어 PowerShell 7 실행기인 `pwsh`를 찾지 못함
- 영향: 운영 runner가 작업을 정상 수신해도 사전 점검과 실제 배포 단계가 명령 실행 전에 실패
- 추가 문제: 운영 서버의 PowerShell 실행 정책이 GitHub Actions가 생성한 임시 `.ps1` 파일 실행을 차단
- 처리: Windows self-hosted runner에서 실행되는 점검, GHCR 로그인과 배포 단계를 기본 `powershell` 및 프로세스 한정 `ExecutionPolicy Bypass`로 변경
- 검증: `Production runner check` 실제 재실행으로 Docker와 Compose 접근 확인 예정

## CRB-DEP-014 — Windows 러너 GHCR 로그인 파이프 개행 오류 및 표준 액션 전환

- 문제: Windows runner에서 PowerShell 파이프(`$env:GHCR_TOKEN | docker login ...`)로 로그인 시, PowerShell의 개행(`\r\n`)이 토큰 끝에 전달되어 `denied: denied` 및 로그인 실패 발생
- 원인: Windows PowerShell 5.1의 파이프라인 개행(`0x0D 0x0A`) 누적으로 인해 Docker CLI가 토큰 끝의 캐리지 리턴을 패스워드 일부로 인식
- 처리: 셸 스크립트 파이프 방식 대신 크로스 플랫폼 표준 액션인 `docker/login-action@v3`을 `publish` 및 `deploy` 단계에 적용
- 검증: `actionlint` 정적 검증 통과 및 Node.js 직접 스트림 입력을 통한 인증 정합성 확보

## CRB-DEP-015 — 운영 PC 재부팅 대비 러너 자동 실행 구성

- 문제: Windows Self-Hosted Runner가 대화형 콘솔 프로세스로 실행 중인 경우, Windows Update나 정전 후 재부팅 시 수동 재실행 전까지 배포 파이프라인이 중단됨
- 처리: 중복 실행을 방지하는 러너 기동 스크립트(`start-runner.cmd`) 작성 및 Windows 시작 프로그램(`Startup`)에 최소화 실행 바로가기(`GitHub Actions Runner.lnk`) 등록
- 효과: Docker Desktop(자동 실행)과 동일한 사용자 세션에서 러너가 자동 구동되어 재부팅 후에도 Docker 데몬 접근 권한을 유지하며 무인 자동 배포 지속 가능
