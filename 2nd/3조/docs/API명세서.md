# Moa API 명세서

## 1. API 설계 원칙

Moa는 On-chain Write와 Application API를 분리한다.

### On-chain Write

사용자의 자산 및 승인 상태를 변경하는 기능은 Frontend가 Wallet을 통해 Smart Contract에 직접 요청한다.

    Frontend
       ↓ Wallet
    Smart Contract

대상:

- 공동계좌 생성
- 입금
- Proposal 생성
- Proposal 승인
- Proposal 실행

Backend가 사용자를 대신하여 서명하거나 실행하지 않는다.

### Application API

Backend는 사용자 친화적인 데이터를 제공한다.

    Frontend
       ↓ HTTP
    Backend
       ↓
    DB / Blockchain Read

대상:

- 공동계좌 목록
- 공동계좌 Metadata
- Proposal 설명
- Wallet 표시명
- Activity Timeline
- 온체인 상태 조합
- 발표용 Attack Simulation Metadata

---

# 2. Base URL

    /api

예:

    GET /api/accounts
    GET /api/accounts/:address

---

# 3. 공통 Response

성공:

    {
      "success": true,
      "data": {}
    }

실패:

    {
      "success": false,
      "error": {
        "code": "ACCOUNT_NOT_FOUND",
        "message": "공동계좌를 찾을 수 없습니다."
      }
    }

---

# 4. Account API

## GET /api/accounts

현재 Wallet이 참여하고 있는 Moa 목록을 조회한다.

Query:

    owner=0x123...

Request:

    GET /api/accounts?owner=0x1234...

Response 필드:

- address
- name
- balance
- asset.symbol
- asset.decimals
- ownerCount
- threshold
- pendingProposalCount

## POST /api/accounts

공동계좌가 온체인에서 생성된 후 Metadata를 저장한다.

실제 Account Contract 생성 API가 아니다. Frontend가 Contract 생성 Transaction을 완료한 뒤 Backend에 Metadata를 등록한다.

Request:

    {
      "address": "0xMoaAccount",
      "name": "제주도 여행",
      "creator": "0xCreator",
      "txHash": "0xTransactionHash"
    }

Backend는 가능하면 온체인에서 Account Contract 존재, creator 또는 owners, threshold를 확인한다.

## GET /api/accounts/:address

공동계좌 상세 조회.

Response 필드:

- address
- name
- balance
- asset
- threshold
- owners
- pendingProposalCount

Owner는 address와 name을 가진다.

---

# 5. Account Metadata API

## PATCH /api/accounts/:address

공동계좌의 오프체인 Metadata를 수정한다.

MVP에서는 계좌 이름 정도만 지원해도 충분하다.

Request:

    {
      "name": "제주도 여행 2026"
    }

---

# 6. Proposal API

## GET /api/accounts/:address/proposals

공동계좌의 Proposal 목록을 조회한다.

Query status:

- PENDING
- READY
- EXECUTED
- BLOCKED
- EXPIRED

기본 정렬은 createdAt DESC다.

응답 필드:

- id
- accountAddress
- purpose
- recipient
- recipientLabel
- amount
- action
- expiresAt
- status
- approvalCount
- threshold
- createdAt

## POST /api/accounts/:address/proposals

온체인 Proposal 생성 완료 후 사용자 친화적인 Metadata를 등록한다.

Request:

    {
      "proposalId": "1",
      "purpose": "제주도 숙소",
      "recipientLabel": "Hotel A",
      "memo": "첫날 숙소 결제",
      "txHash": "0xProposalTx"
    }

Backend가 임의로 정해서는 안 되는 값:

- recipient
- amount
- expiresAt
- intentHash

이 값들은 Contract Proposal이 Source of Truth이며, Backend는 온체인 Proposal과 Metadata를 병합한다.

## GET /api/accounts/:address/proposals/:proposalId

Proposal 상세를 조회한다.

응답 필드:

- id
- accountAddress
- purpose
- recipientLabel
- memo
- recipient
- amount
- action
- expiresAt
- intentHash
- status
- approvalCount
- threshold
- approvals
- security

approvals 항목:

    {
      "address": "0xA",
      "name": "연한",
      "approved": true
    }

실행 전 security.executionMatch는 null이다.

---

# 7. Activity API

## GET /api/accounts/:address/activities

공동계좌 전체 Activity를 조회한다.

Query:

- limit
- cursor

응답 item:

    {
      "id": "activity-31",
      "type": "PROPOSAL_APPROVED",
      "proposalId": "1",
      "actor": {
        "address": "0xA",
        "name": "연한"
      },
      "createdAt": "2026-10-02T13:32:00+09:00"
    }

## GET /api/accounts/:address/proposals/:proposalId/activities

특정 Proposal의 CoC Timeline을 조회한다.

기록 대상:

- PROPOSAL_CREATED
- PROPOSAL_APPROVED
- THRESHOLD_REACHED
- EXECUTION_REQUESTED
- EXECUTION_BLOCKED
- PROPOSAL_EXECUTED

---

# 8. Wallet Profile API

실제 회원가입 시스템까지 만들 필요는 없으므로 Wallet 주소별 표시명 정도만 제공한다.

## GET /api/profiles/:address

응답:

    {
      "success": true,
      "data": {
        "address": "0x123...",
        "name": "연한"
      }
    }

## PUT /api/profiles/:address

Request:

    {
      "name": "연한"
    }

발표용 MVP에서는 Seed Data로 관리해도 무방하다.

---

# 9. Security API

보안 검증의 Source of Truth는 Contract다. Backend는 결과를 읽어서 사용자 친화적으로 가공한다.

## GET /api/accounts/:address/proposals/:proposalId/security

Happy Path 응답의 핵심 구조:

    {
      "threshold": {
        "status": "PASS",
        "current": 3,
        "required": 3
      },
      "intent": {
        "status": "PASS",
        "hash": "0xABCDEF"
      },
      "expiration": {
        "status": "PASS",
        "expiresAt": "2026-10-05T23:59:00+09:00"
      },
      "executionMatch": {
        "status": "PASS",
        "expected": {
          "recipient": "0xHotel",
          "amount": "0.32"
        },
        "actual": {
          "recipient": "0xHotel",
          "amount": "0.32"
        }
      }
    }

Attack Path에서는 executionMatch를 다음처럼 반환한다.

    {
      "status": "FAIL",
      "reason": "RECIPIENT_MISMATCH",
      "expected": {
        "recipient": "0xHotel",
        "amount": "0.32"
      },
      "actual": {
        "recipient": "0xAttacker",
        "amount": "0.32"
      }
    }

---

# 10. Demo Attack API

개발/발표 환경에서만 사용하며 Production API가 아니다.

## POST /api/demo/attack

Request:

    {
      "accountAddress": "0xMoa",
      "proposalId": "1",
      "type": "RECIPIENT_REPLACEMENT",
      "attackerAddress": "0xAttacker"
    }

Response:

    {
      "success": true,
      "data": {
        "attackId": "attack-001",
        "original": {
          "recipient": "0xHotel"
        },
        "modified": {
          "recipient": "0xAttacker"
        }
      }
    }

이 API는 Contract의 Proposal을 수정하면 안 된다. 승인된 Intent는 그대로 유지하고 발표용 executionPayload만 변경한다.

## DELETE /api/demo/attack/:attackId

Attack Mode를 종료한다.

---

# 11. Frontend → Contract API

## createAccount

Factory를 둘 경우:

    function createAccount(
        address[] calldata owners,
        uint256 threshold
    ) external returns (address account);

Frontend 입력:

    owners: Address[]
    threshold: 3

## deposit

Native Token이면 일반 transfer로 충분하다.

    sendTransaction({
      to: accountAddress,
      value: amount,
    })

## proposeTransaction

    function proposeTransaction(
        address recipient,
        uint256 amount,
        uint8 action,
        uint256 expiresAt
    ) external returns (uint256 proposalId);

Frontend:

    writeContract({
      functionName: 'proposeTransaction',
      args: [
        recipient,
        amount,
        ACTION_TRANSFER,
        expiresAt,
      ],
    })

## approveTransaction

    function approveTransaction(
        uint256 proposalId
    ) external;

## executeTransaction

정상 경로:

    function executeTransaction(
        uint256 proposalId
    ) external;

가장 안전한 설계는 execute 호출자가 임의의 recipient/amount를 다시 넘기지 않는 것이다. Contract 내부 Proposal 값을 그대로 사용한다.

---

# 12. Attack Path를 위한 별도 실행 인터페이스

정상 executeTransaction(proposalId)가 Proposal 값을 그대로 읽으면 공격자가 payload를 바꿀 수 없으므로 Attack Path가 발생하지 않는다.

발표용 Harness 실험을 위해 별도 함수 또는 Demo Contract를 둘 수 있다.

    function executeWithPayload(
        uint256 proposalId,
        address recipient,
        uint256 amount,
        uint8 action
    ) external;

처리:

    실행 요청 payload
           ↓
    Intent와 비교
           ↓
    동일 → execute
    다름 → IntentMismatch()

Production 설계에서는 필요하지 않을 수 있지만, 승인 데이터와 실행 데이터 사이의 불일치를 실험하기 위한 명시적인 Harness다. Frontend에서는 발표 Attack Mode에서만 사용한다.

---

# 13. Contract Read API

Frontend와 Backend가 공통으로 사용할 조회 함수:

    function getOwners()
        external
        view
        returns (address[] memory);

    function threshold()
        external
        view
        returns (uint256);

    function getProposal(
        uint256 proposalId
    )
        external
        view
        returns (
            address proposer,
            address recipient,
            uint256 amount,
            uint8 action,
            uint256 expiresAt,
            bytes32 intentHash,
            uint256 approvalCount,
            bool executed
        );

    function hasApproved(
        uint256 proposalId,
        address owner
    )
        external
        view
        returns (bool);

    function canExecute(
        uint256 proposalId
    )
        external
        view
        returns (bool);

---

# 14. Backend Event Subscription

Backend는 다음 Event를 Indexing한다.

- AccountCreated
- Deposit
- ProposalCreated
- ProposalApproved
- ThresholdReached
- ProposalExecuted
- ExecutionBlocked

데이터 흐름:

    ProposalApproved
            ↓
    Backend Indexer
            ↓
    Activity DB
            ↓
    GET /activities
            ↓
    Frontend Timeline

---

# 15. Frontend 데이터 흐름

## 공동계좌 조회

    Frontend
    → GET /api/accounts
    → Backend
    → Metadata + Contract Read
    → UI

## Proposal 생성

    Frontend Form
    → Wallet
    → Contract.proposeTransaction()
    → Transaction 완료
    → POST /api/accounts/:address/proposals
    → Metadata 저장

## 승인

    Frontend
    → Wallet
    → Contract.approveTransaction()
    → Contract Event
    → Backend Indexer
    → Frontend Refetch

승인을 위한 Backend POST API는 필요 없다.

## 실행

    Frontend
    → Wallet
    → Contract.executeTransaction()

정상 성공:

    ProposalExecuted

Attack 차단:

    IntentMismatch revert
    또는 ExecutionBlocked

Frontend는 Contract 결과를 직접 처리한다.

---

# 16. Source of Truth 정리

| 데이터 | Source of Truth |
| --- | --- |
| Owner | Contract |
| Threshold | Contract |
| Balance | Blockchain |
| Proposal recipient | Contract |
| Proposal amount | Contract |
| Intent Hash | Contract |
| Approval | Contract |
| Executed | Contract |
| Account Name | Backend |
| Purpose | Backend |
| Recipient Label | Backend |
| Memo | Backend |
| Activity Cache | Backend |
| Wallet Display Name | Backend |

Backend 값이 Contract와 다르면 Contract 값을 우선한다.

---

# 17. FE에서 사용할 주요 타입

    type ProposalStatus =
      | 'PENDING'
      | 'READY'
      | 'EXECUTED'
      | 'BLOCKED'
      | 'EXPIRED';

    type Proposal = {
      id: string;
      accountAddress: string;
      purpose: string;
      recipientLabel?: string;
      recipient: 0x-address;
      amount: string;
      expiresAt: string;
      status: ProposalStatus;
      approvalCount: number;
      threshold: number;
      approvals: Approval[];
    };

    type Approval = {
      address: 0x-address;
      name?: string;
      approved: boolean;
    };

    type MoaAccount = {
      address: 0x-address;
      name: string;
      balance: string;
      owners: Owner[];
      threshold: number;
    };

---

# 18. API Error Code

공통:

- INVALID_REQUEST
- UNAUTHORIZED
- FORBIDDEN
- NOT_FOUND
- INTERNAL_ERROR

Account:

- ACCOUNT_NOT_FOUND
- ACCOUNT_ALREADY_REGISTERED

Proposal:

- PROPOSAL_NOT_FOUND
- INVALID_PROPOSAL

Demo:

- ATTACK_MODE_DISABLED
- INVALID_ATTACK_TYPE

Contract 오류 Mapping:

- NotOwner → NOT_OWNER
- AlreadyApproved → ALREADY_APPROVED
- InsufficientApprovals → INSUFFICIENT_APPROVALS
- IntentExpired → INTENT_EXPIRED
- IntentMismatch → INTENT_MISMATCH
- AlreadyExecuted → ALREADY_EXECUTED

---

# 19. MVP 필수 API 요약

Backend:

- GET /api/accounts
- POST /api/accounts
- GET /api/accounts/:address
- GET /api/accounts/:address/proposals
- POST /api/accounts/:address/proposals
- GET /api/accounts/:address/proposals/:proposalId
- GET /api/accounts/:address/activities
- GET /api/accounts/:address/proposals/:proposalId/activities

Demo:

- POST /api/demo/attack

Contract:

- createAccount
- proposeTransaction
- approveTransaction
- executeTransaction
- executeWithPayload (demo harness)
- getOwners
- getProposal
- hasApproved
- canExecute

---

# 20. 역할별 API 책임

## Frontend — 정윤호

직접 Contract 호출:

- Account 생성
- Deposit
- Proposal 생성
- Approval
- Execute
- Attack Execute

Backend API 사용:

- Account 조회
- Account Metadata
- Proposal Metadata
- Activity
- Security Detail

## Backend — 최승원

제공:

- Account Metadata API
- Proposal Metadata API
- Activity API
- Demo Attack API

처리:

- Blockchain Event Indexing
- Contract Read
- Metadata + On-chain State 결합

하지 않는 것:

- 사용자 대신 승인
- 사용자 대신 서명
- Multisig Threshold 판정
- 자산 이동
- Execution 우회

## Contract — 정연한

FE/BE에 제공:

- ABI
- Contract Address
- Event Schema
- Custom Error
- Proposal 구조
- Intent Hash 규칙
- Demo Harness

특히 Intent Hash 구성 규칙은 FE/BE 구현 전에 먼저 확정해서 공유해야 한다.
