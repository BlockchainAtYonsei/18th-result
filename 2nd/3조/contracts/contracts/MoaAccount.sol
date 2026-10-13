// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MoaAccount
/// @notice Five owners jointly manage native assets through three-of-five approval.
contract MoaAccount {
    uint256 public constant OWNER_COUNT = 5;
    uint256 public constant THRESHOLD = 3;

    enum ProposalStatus {
        Pending,
        Executed,
        Cancelled
    }

    struct Proposal {
        address proposer;
        address target;
        uint256 value;
        bytes data;
        bytes32 intentHash;
        uint256 approvalCount;
        ProposalStatus status;
        uint256 createdAt;
    }

    error NotOwner(address caller);
    error InvalidOwner(address owner);
    error DuplicateOwner(address owner);
    error InvalidTarget();
    error InvalidValue();
    error ProposalNotFound(uint256 proposalId);
    error ProposalNotPending(uint256 proposalId);
    error AlreadyApproved(uint256 proposalId, address owner);
    error InsufficientApprovals(uint256 proposalId, uint256 current, uint256 required);
    error IntentMismatch(bytes32 expected, bytes32 actual);
    error InsufficientBalance(uint256 available, uint256 required);
    error ExecutionFailed(bytes returnData);
    error NotProposer(uint256 proposalId, address caller);

    event Deposited(address indexed sender, uint256 amount, uint256 balance);
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed target,
        uint256 value,
        bytes data,
        bytes32 intentHash
    );
    event ProposalApproved(uint256 indexed proposalId, address indexed owner, uint256 approvalCount);
    event ProposalCancelled(uint256 indexed proposalId, address indexed proposer);
    event ProposalExecuted(
        uint256 indexed proposalId,
        address indexed executor,
        address indexed target,
        uint256 value,
        bytes data,
        bytes32 intentHash
    );

    address[OWNER_COUNT] private _owners;
    mapping(address owner => bool) public isOwner;
    mapping(uint256 proposalId => Proposal) private _proposals;
    mapping(uint256 proposalId => mapping(address owner => bool)) private _approvals;

    uint256 public proposalCount;

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner(msg.sender);
        _;
    }

    modifier existingProposal(uint256 proposalId) {
        if (proposalId >= proposalCount) revert ProposalNotFound(proposalId);
        _;
    }

    constructor(address[OWNER_COUNT] memory owners_) {
        for (uint256 i = 0; i < OWNER_COUNT; ++i) {
            address owner = owners_[i];

            if (owner == address(0)) revert InvalidOwner(owner);
            if (isOwner[owner]) revert DuplicateOwner(owner);

            isOwner[owner] = true;
            _owners[i] = owner;
        }
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value, address(this).balance);
    }

    function owners() external view returns (address[OWNER_COUNT] memory) {
        return _owners;
    }

    function getProposal(uint256 proposalId)
        external
        view
        existingProposal(proposalId)
        returns (Proposal memory)
    {
        return _proposals[proposalId];
    }

    function hasApproved(uint256 proposalId, address owner)
        external
        view
        existingProposal(proposalId)
        returns (bool)
    {
        return _approvals[proposalId][owner];
    }

    function createProposal(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        returns (uint256 proposalId)
    {
        if (target == address(0)) revert InvalidTarget();
        if (value == 0) revert InvalidValue();

        proposalId = proposalCount++;
        bytes32 intentHash = computeIntentHash(proposalId, target, value, data);

        _proposals[proposalId] = Proposal({
            proposer: msg.sender,
            target: target,
            value: value,
            data: data,
            intentHash: intentHash,
            approvalCount: 0,
            status: ProposalStatus.Pending,
            createdAt: block.timestamp
        });

        emit ProposalCreated(proposalId, msg.sender, target, value, data, intentHash);
    }

    function approveProposal(uint256 proposalId) external onlyOwner existingProposal(proposalId) {
        Proposal storage proposal = _proposals[proposalId];

        if (proposal.status != ProposalStatus.Pending) revert ProposalNotPending(proposalId);
        if (_approvals[proposalId][msg.sender]) revert AlreadyApproved(proposalId, msg.sender);

        _approvals[proposalId][msg.sender] = true;
        ++proposal.approvalCount;

        emit ProposalApproved(proposalId, msg.sender, proposal.approvalCount);
    }

    function cancelProposal(uint256 proposalId) external onlyOwner existingProposal(proposalId) {
        Proposal storage proposal = _proposals[proposalId];

        if (proposal.status != ProposalStatus.Pending) revert ProposalNotPending(proposalId);
        if (proposal.proposer != msg.sender) revert NotProposer(proposalId, msg.sender);

        proposal.status = ProposalStatus.Cancelled;
        emit ProposalCancelled(proposalId, msg.sender);
    }

    function executeProposal(uint256 proposalId, address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        existingProposal(proposalId)
        returns (bytes memory returnData)
    {
        Proposal storage proposal = _proposals[proposalId];

        if (proposal.status != ProposalStatus.Pending) revert ProposalNotPending(proposalId);
        if (proposal.approvalCount < THRESHOLD) {
            revert InsufficientApprovals(proposalId, proposal.approvalCount, THRESHOLD);
        }

        bytes32 actualIntentHash = computeIntentHash(proposalId, target, value, data);
        if (proposal.intentHash != actualIntentHash) {
            revert IntentMismatch(proposal.intentHash, actualIntentHash);
        }
        if (address(this).balance < value) {
            revert InsufficientBalance(address(this).balance, value);
        }

        proposal.status = ProposalStatus.Executed;

        bool success;
        (success, returnData) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed(returnData);

        emit ProposalExecuted(proposalId, msg.sender, target, value, data, proposal.intentHash);
    }

    function computeIntentHash(uint256 proposalId, address target, uint256 value, bytes calldata data)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(address(this), block.chainid, proposalId, target, value, keccak256(data)));
    }
}
