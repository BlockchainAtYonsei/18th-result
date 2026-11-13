// SPDX-License-Identifier: GPL-3.0
//
// BAY AML Demo - ReasonedFreeze
//
// ERC-3643 토큰의 지갑 동결(setAddressFrozen)을 감싸서, 동결마다
// "누가 / 왜 / 어떤 근거로 / 언제까지"를 온체인에 남기는 얇은 래퍼.
//
// - 위험 판단 자체는 하지 않는다. 판단은 외부(운영자)에서 입력된다.
// - 근거 없는 동결과 기한 없는 동결을 거부한다.
// - 만료된 동결은 누구나(동결된 당사자 포함) 해제할 수 있다.
// - 기한을 늘리려면 새 근거 해시를 제출해야 한다(재평가 강제).
//
// 이 컨트랙트는 토큰의 Agent 로 등록되어야 동작한다.
// 한계: ERC-3643 v4 의 Agent 권한은 세분화되어 있지 않으므로, 다른 Agent 가
// 토큰의 setAddressFrozen / forcedTransfer 를 직접 호출하는 경로는 막지 못한다.

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../token/IToken.sol";

contract ReasonedFreeze is Ownable {
    struct FreezeCase {
        address wallet; // 동결 대상 지갑
        address operator; // 동결을 실행한 운영자
        bytes32 reasonCode; // 사유 코드 (예: keccak256("SANCTIONS_EXPOSURE"))
        bytes32 evidenceHash; // 오프체인 판단 근거 문서의 해시
        uint64 frozenAt; // 동결 시각
        uint64 expiresAt; // 만료 시각 (이후 누구나 해제 가능)
        uint64 closedAt; // 해제 시각 (0 이면 진행 중)
        bytes32 resolutionCode; // 해제 사유 (만료 해제는 EXPIRED)
    }

    /// @dev 만료로 해제된 경우에 기록되는 해제 사유
    bytes32 public constant EXPIRED = keccak256("EXPIRED");

    /// @dev 한 번에 지정할 수 있는 최대 동결 기간
    uint64 public constant MAX_DURATION = 30 days;

    IToken public immutable token;

    mapping(address => bool) public isOperator;

    /// @dev caseId => 기록. caseId 는 1부터 시작하며 해제 후에도 지워지지 않는다.
    mapping(uint256 => FreezeCase) private _cases;

    /// @dev wallet => 진행 중인 caseId (없으면 0)
    mapping(address => uint256) public activeCaseOf;

    uint256 public caseCount;

    event OperatorSet(address indexed operator, bool allowed);

    event FreezeApplied(
        uint256 indexed caseId,
        address indexed wallet,
        address indexed operator,
        bytes32 reasonCode,
        bytes32 evidenceHash,
        uint64 expiresAt
    );

    event FreezeExtended(uint256 indexed caseId, address indexed wallet, address indexed operator, bytes32 evidenceHash, uint64 expiresAt);

    event FreezeReleased(uint256 indexed caseId, address indexed wallet, address indexed releasedBy, bytes32 resolutionCode);

    error NotOperator(address caller);
    error ZeroAddress();
    error EvidenceRequired();
    error ReasonRequired();
    error InvalidDuration(uint64 duration);
    error AlreadyFrozen(address wallet, uint256 caseId);
    error NoActiveCase(address wallet);
    error NotExpired(uint64 expiresAt);

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator(msg.sender);
        _;
    }

    constructor(address _token) {
        if (_token == address(0)) revert ZeroAddress();
        token = IToken(_token);
    }

    function setOperator(address _operator, bool _allowed) external onlyOwner {
        if (_operator == address(0)) revert ZeroAddress();
        isOperator[_operator] = _allowed;
        emit OperatorSet(_operator, _allowed);
    }

    /**
     *  @dev 근거와 기한을 붙여 지갑을 동결한다.
     *  @param _wallet 동결할 지갑
     *  @param _reasonCode 사유 코드
     *  @param _evidenceHash 판단 근거 문서의 해시 (0 불가)
     *  @param _duration 동결 기간(초). 1 이상 MAX_DURATION 이하
     */
    function freeze(
        address _wallet,
        bytes32 _reasonCode,
        bytes32 _evidenceHash,
        uint64 _duration
    ) external onlyOperator returns (uint256 caseId) {
        if (_wallet == address(0)) revert ZeroAddress();
        if (_reasonCode == bytes32(0)) revert ReasonRequired();
        if (_evidenceHash == bytes32(0)) revert EvidenceRequired();
        if (_duration == 0 || _duration > MAX_DURATION) revert InvalidDuration(_duration);
        if (activeCaseOf[_wallet] != 0) revert AlreadyFrozen(_wallet, activeCaseOf[_wallet]);

        caseId = ++caseCount;
        uint64 expiresAt = uint64(block.timestamp) + _duration;

        _cases[caseId] = FreezeCase({
            wallet: _wallet,
            operator: msg.sender,
            reasonCode: _reasonCode,
            evidenceHash: _evidenceHash,
            frozenAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            closedAt: 0,
            resolutionCode: bytes32(0)
        });
        activeCaseOf[_wallet] = caseId;

        token.setAddressFrozen(_wallet, true);

        emit FreezeApplied(caseId, _wallet, msg.sender, _reasonCode, _evidenceHash, expiresAt);
    }

    /**
     *  @dev 진행 중인 동결의 기한을 지금부터 _duration 만큼으로 다시 정한다.
     *  기존과 다른 새 근거 해시가 있어야 한다.
     */
    function extend(
        address _wallet,
        bytes32 _newEvidenceHash,
        uint64 _duration
    ) external onlyOperator {
        uint256 caseId = activeCaseOf[_wallet];
        if (caseId == 0) revert NoActiveCase(_wallet);
        FreezeCase storage c = _cases[caseId];
        if (_newEvidenceHash == bytes32(0) || _newEvidenceHash == c.evidenceHash) revert EvidenceRequired();
        if (_duration == 0 || _duration > MAX_DURATION) revert InvalidDuration(_duration);

        c.evidenceHash = _newEvidenceHash;
        c.expiresAt = uint64(block.timestamp) + _duration;

        emit FreezeExtended(caseId, _wallet, msg.sender, _newEvidenceHash, c.expiresAt);
    }

    /**
     *  @dev 운영자가 판단을 정정해 동결을 해제한다.
     *  @param _resolutionCode 해제 사유 (예: keccak256("FALSE_POSITIVE"))
     */
    function release(address _wallet, bytes32 _resolutionCode) external onlyOperator {
        if (_resolutionCode == bytes32(0)) revert ReasonRequired();
        _close(_wallet, _resolutionCode);
    }

    /**
     *  @dev 만료된 동결을 해제한다. 누구나 호출할 수 있다.
     */
    function releaseExpired(address _wallet) external {
        uint256 caseId = activeCaseOf[_wallet];
        if (caseId == 0) revert NoActiveCase(_wallet);
        uint64 expiresAt = _cases[caseId].expiresAt;
        if (block.timestamp < expiresAt) revert NotExpired(expiresAt);
        _close(_wallet, EXPIRED);
    }

    function getCase(uint256 _caseId) external view returns (FreezeCase memory) {
        return _cases[_caseId];
    }

    function isExpired(address _wallet) external view returns (bool) {
        uint256 caseId = activeCaseOf[_wallet];
        return caseId != 0 && block.timestamp >= _cases[caseId].expiresAt;
    }

    function _close(address _wallet, bytes32 _resolutionCode) internal {
        uint256 caseId = activeCaseOf[_wallet];
        if (caseId == 0) revert NoActiveCase(_wallet);

        FreezeCase storage c = _cases[caseId];
        c.closedAt = uint64(block.timestamp);
        c.resolutionCode = _resolutionCode;
        activeCaseOf[_wallet] = 0;

        token.setAddressFrozen(_wallet, false);

        emit FreezeReleased(caseId, _wallet, msg.sender, _resolutionCode);
    }
}
