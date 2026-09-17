// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IRevenueBridge} from "./interfaces/IRevenueBridge.sol";
import {RevenueRightToken} from "./RevenueRightToken.sol";
import {RevenueRightTokenFactory} from "./RevenueRightTokenFactory.sol";

/// @title RevenueBridge
/// @notice Manages revenue-right funding, settlement, and investor claims.
contract RevenueBridge is IRevenueBridge, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error InvalidOfferingTerms();
    error InvalidSettlementPeriods();
    error OfferingNotFound(uint256 offeringId);
    error InvalidOfferingStatus(OfferingStatus actual);
    error IntakePaused();
    error InvestorNotAllowed(address investor);
    error InvalidUnits();
    error FundingClosed();
    error FundingStillOpen();
    error OfferingCapacityExceeded(uint256 remainingUnits);
    error SettlementTokenAmountMismatch(uint256 expected, uint256 actual);
    error UnauthorizedCreator(address caller);
    error AdvanceAlreadyWithdrawn();
    error NothingToRefund();
    error InvalidSettlementStatus(OfferingStatus actual);
    error InvalidPeriodIndex(uint256 expected, uint256 actual);
    error SettlementPeriodStillOpen(uint64 periodEnd);
    error InvalidEvidenceHash();
    error NothingToClaim();
    error SettlementPeriodsRemaining(uint256 remainingPeriods);

    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    uint256 public constant MAX_SETTLEMENT_PERIODS = 24;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable SETTLEMENT_TOKEN;
    RevenueRightToken public immutable REVENUE_RIGHT_TOKEN;

    uint256 public nextOfferingId = 1;
    uint256 public totalEscrowLiability;
    uint256 public totalRevenueLiability;
    bool public intakeIsPaused;

    mapping(uint256 offeringId => Offering offering) private _offerings;
    mapping(uint256 offeringId => uint64[] periodEnds) private _periodEnds;
    mapping(uint256 offeringId => mapping(uint256 periodIndex => PeriodSettlement settlement)) private
        _periodSettlements;
    mapping(uint256 offeringId => mapping(address investor => uint256 units)) public investedUnits;
    mapping(uint256 offeringId => mapping(address investor => uint256 amount)) public claimed;
    mapping(address investor => bool allowed) public allowedInvestors;

    constructor(
        IERC20 settlementToken_,
        address admin,
        string memory tokenBaseUri,
        RevenueRightTokenFactory rightTokenFactory
    ) {
        if (address(settlementToken_) == address(0) || admin == address(0) || address(rightTokenFactory) == address(0))
        {
            revert InvalidAddress();
        }

        SETTLEMENT_TOKEN = settlementToken_;
        REVENUE_RIGHT_TOKEN = rightTokenFactory.deploy(address(this), tokenBaseUri);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
        _grantRole(SETTLER_ROLE, admin);
    }

    function setInvestorAllowed(address investor, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (investor == address(0)) {
            revert InvalidAddress();
        }

        // An event is emitted immediately after this access-control state change.
        // forge-lint: disable-next-line(missing-events-access-control)
        allowedInvestors[investor] = allowed;
        emit InvestorPermissionUpdated(investor, allowed);
    }

    function setIntakePaused(bool paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        intakeIsPaused = paused;
        emit IntakePauseUpdated(paused);
    }

    function createOffering(OfferingTerms calldata terms, uint64[] calldata periodEnds)
        external
        onlyRole(ISSUER_ROLE)
        returns (uint256 offeringId)
    {
        if (intakeIsPaused) {
            revert IntakePaused();
        }

        _validateTerms(terms, periodEnds);

        offeringId = nextOfferingId++;
        Offering storage offering = _offerings[offeringId];
        offering.status = OfferingStatus.Funding;
        offering.creatorPayout = terms.creatorPayout;
        offering.assetKey = terms.assetKey;
        offering.termsHash = terms.termsHash;
        offering.valuationHash = terms.valuationHash;
        offering.unitsForSale = terms.unitsForSale;
        offering.unitPrice = terms.unitPrice;
        offering.fundingDeadline = terms.fundingDeadline;
        offering.revenueStart = terms.revenueStart;
        offering.revenueEnd = terms.revenueEnd;
        offering.revenueShareBps = terms.revenueShareBps;

        for (uint256 i = 0; i < periodEnds.length; ++i) {
            _periodEnds[offeringId].push(periodEnds[i]);
        }

        emit OfferingCreated(offeringId, terms.creatorPayout, terms.assetKey, terms.unitsForSale, terms.unitPrice);
    }

    function invest(uint256 offeringId, uint256 units) external nonReentrant {
        if (intakeIsPaused) {
            revert IntakePaused();
        }
        if (!allowedInvestors[msg.sender]) {
            revert InvestorNotAllowed(msg.sender);
        }
        if (units == 0) {
            revert InvalidUnits();
        }

        Offering storage offering = _getOffering(offeringId);
        if (offering.status != OfferingStatus.Funding) {
            revert InvalidOfferingStatus(offering.status);
        }
        uint256 currentTimestamp = block.timestamp;
        // Funding deadlines intentionally use the L2 block timestamp.
        // forge-lint: disable-next-line(block-timestamp)
        if (currentTimestamp >= offering.fundingDeadline) {
            revert FundingClosed();
        }

        uint256 remainingUnits = offering.unitsForSale - offering.raisedUnits;
        if (units > remainingUnits) {
            revert OfferingCapacityExceeded(remainingUnits);
        }

        uint256 amount = units * offering.unitPrice;

        offering.raisedUnits += units;
        investedUnits[offeringId][msg.sender] += units;
        totalEscrowLiability += amount;

        emit Invested(offeringId, msg.sender, units, amount);

        _pullExact(msg.sender, amount);
        REVENUE_RIGHT_TOKEN.mint(msg.sender, offeringId, units, "");
    }

    function finalizeFunding(uint256 offeringId) external {
        Offering storage offering = _getOffering(offeringId);
        if (offering.status != OfferingStatus.Funding) {
            revert InvalidOfferingStatus(offering.status);
        }

        if (offering.raisedUnits == offering.unitsForSale) {
            offering.status = OfferingStatus.Active;
        } else {
            uint256 currentTimestamp = block.timestamp;
            // Funding deadlines intentionally use the L2 block timestamp.
            // forge-lint: disable-next-line(block-timestamp)
            if (currentTimestamp < offering.fundingDeadline) {
                revert FundingStillOpen();
            }
            offering.status = OfferingStatus.Failed;
        }

        emit FundingFinalized(offeringId, offering.status, offering.raisedUnits * offering.unitPrice);
    }

    function withdrawAdvance(uint256 offeringId) external nonReentrant {
        Offering storage offering = _getOffering(offeringId);
        if (
            offering.status != OfferingStatus.Active && offering.status != OfferingStatus.Settling
                && offering.status != OfferingStatus.Closed
        ) {
            revert InvalidOfferingStatus(offering.status);
        }
        if (msg.sender != offering.creatorPayout) {
            revert UnauthorizedCreator(msg.sender);
        }
        if (offering.advanceWithdrawn) {
            revert AdvanceAlreadyWithdrawn();
        }

        uint256 amount = offering.unitsForSale * offering.unitPrice;
        offering.advanceWithdrawn = true;
        totalEscrowLiability -= amount;

        emit AdvanceWithdrawn(offeringId, msg.sender, amount);

        _pushExact(msg.sender, amount);
    }

    function refund(uint256 offeringId) external nonReentrant {
        Offering storage offering = _getOffering(offeringId);
        if (offering.status != OfferingStatus.Failed) {
            revert InvalidOfferingStatus(offering.status);
        }

        uint256 units = investedUnits[offeringId][msg.sender];
        if (units == 0) {
            revert NothingToRefund();
        }

        uint256 amount = units * offering.unitPrice;
        investedUnits[offeringId][msg.sender] = 0;
        offering.totalRefunded += amount;
        totalEscrowLiability -= amount;

        emit Refunded(offeringId, msg.sender, units, amount);

        REVENUE_RIGHT_TOKEN.burn(msg.sender, offeringId, units);
        _pushExact(msg.sender, amount);
    }

    function settlePeriod(uint256 offeringId, uint256 periodIndex, uint256 grossRevenue, bytes32 evidenceHash)
        external
        nonReentrant
        onlyRole(SETTLER_ROLE)
    {
        Offering storage offering = _getOffering(offeringId);
        if (offering.status != OfferingStatus.Active && offering.status != OfferingStatus.Settling) {
            revert InvalidSettlementStatus(offering.status);
        }
        if (periodIndex != offering.nextPeriodIndex) {
            revert InvalidPeriodIndex(offering.nextPeriodIndex, periodIndex);
        }
        if (periodIndex >= _periodEnds[offeringId].length) {
            revert InvalidPeriodIndex(offering.nextPeriodIndex, periodIndex);
        }

        uint64 periodEnd = _periodEnds[offeringId][periodIndex];
        uint256 currentTimestamp = block.timestamp;
        // Settlement periods intentionally use the L2 block timestamp.
        // forge-lint: disable-next-line(block-timestamp)
        if (currentTimestamp < periodEnd) {
            revert SettlementPeriodStillOpen(periodEnd);
        }
        if (evidenceHash == bytes32(0)) {
            revert InvalidEvidenceHash();
        }

        uint256 newGrossRevenueTotal = offering.grossRevenueTotal + grossRevenue;
        uint256 newInvestorRevenueTotal = Math.mulDiv(newGrossRevenueTotal, offering.revenueShareBps, BPS_DENOMINATOR);
        uint256 investorAmount = newInvestorRevenueTotal - offering.investorRevenueTotal;

        offering.status = OfferingStatus.Settling;
        offering.grossRevenueTotal = newGrossRevenueTotal;
        offering.investorRevenueTotal = newInvestorRevenueTotal;
        offering.nextPeriodIndex = periodIndex + 1;
        totalRevenueLiability += investorAmount;
        _periodSettlements[offeringId][periodIndex] = PeriodSettlement({
            grossRevenue: grossRevenue,
            investorAmount: investorAmount,
            evidenceHash: evidenceHash,
            settledAt: currentTimestamp
        });

        emit PeriodSettled(
            offeringId,
            periodIndex,
            evidenceHash,
            grossRevenue,
            investorAmount,
            newGrossRevenueTotal,
            newInvestorRevenueTotal
        );

        if (investorAmount != 0) {
            _pullExact(msg.sender, investorAmount);
        }
    }

    function claim(uint256 offeringId) external nonReentrant {
        Offering storage offering = _getOffering(offeringId);
        uint256 amount = _claimable(offeringId, msg.sender, offering);
        if (amount == 0) {
            revert NothingToClaim();
        }

        claimed[offeringId][msg.sender] += amount;
        offering.totalClaimed += amount;
        totalRevenueLiability -= amount;

        emit RevenueClaimed(offeringId, msg.sender, amount);

        _pushExact(msg.sender, amount);
    }

    function closeOffering(uint256 offeringId) external {
        Offering storage offering = _getOffering(offeringId);
        if (offering.status != OfferingStatus.Settling) {
            revert InvalidSettlementStatus(offering.status);
        }

        uint256 periodCount = _periodEnds[offeringId].length;
        if (offering.nextPeriodIndex != periodCount) {
            revert SettlementPeriodsRemaining(periodCount - offering.nextPeriodIndex);
        }

        offering.status = OfferingStatus.Closed;
        emit OfferingClosed(offeringId);
    }

    function statusOf(uint256 offeringId) external view returns (OfferingStatus) {
        return _getOffering(offeringId).status;
    }

    function getOffering(uint256 offeringId) external view returns (Offering memory) {
        return _getOffering(offeringId);
    }

    function targetRaise(uint256 offeringId) public view returns (uint256) {
        Offering storage offering = _getOffering(offeringId);
        return offering.unitsForSale * offering.unitPrice;
    }

    function refundable(uint256 offeringId, address investor) external view returns (uint256) {
        Offering storage offering = _getOffering(offeringId);
        if (offering.status != OfferingStatus.Failed) {
            return 0;
        }
        return investedUnits[offeringId][investor] * offering.unitPrice;
    }

    function claimable(uint256 offeringId, address investor) external view returns (uint256) {
        Offering storage offering = _getOffering(offeringId);
        return _claimable(offeringId, investor, offering);
    }

    function nextUnsettledPeriod(uint256 offeringId)
        external
        view
        returns (uint256 periodIndex, uint64 periodEnd, bool allSettled)
    {
        Offering storage offering = _getOffering(offeringId);
        periodIndex = offering.nextPeriodIndex;
        allSettled = periodIndex == _periodEnds[offeringId].length;
        if (!allSettled) {
            periodEnd = _periodEnds[offeringId][periodIndex];
        }
    }

    function settlementOverdue(uint256 offeringId) external view returns (bool) {
        Offering storage offering = _getOffering(offeringId);
        if (offering.status != OfferingStatus.Active && offering.status != OfferingStatus.Settling) {
            return false;
        }
        if (offering.nextPeriodIndex == _periodEnds[offeringId].length) {
            return false;
        }

        uint256 currentTimestamp = block.timestamp;
        // Settlement deadlines intentionally use the L2 block timestamp.
        // forge-lint: disable-next-line(block-timestamp)
        return currentTimestamp >= _periodEnds[offeringId][offering.nextPeriodIndex];
    }

    function getPeriodEnds(uint256 offeringId) external view returns (uint64[] memory) {
        _getOffering(offeringId);
        return _periodEnds[offeringId];
    }

    function getPeriodSettlement(uint256 offeringId, uint256 periodIndex)
        external
        view
        returns (PeriodSettlement memory)
    {
        Offering storage offering = _getOffering(offeringId);
        if (periodIndex >= offering.nextPeriodIndex) {
            revert InvalidPeriodIndex(offering.nextPeriodIndex, periodIndex);
        }
        return _periodSettlements[offeringId][periodIndex];
    }

    function _validateTerms(OfferingTerms calldata terms, uint64[] calldata periodEnds) private view {
        if (
            terms.creatorPayout == address(0) || terms.assetKey == bytes32(0) || terms.termsHash == bytes32(0)
                || terms.valuationHash == bytes32(0) || terms.unitsForSale == 0 || terms.unitPrice == 0
                || terms.revenueShareBps == 0 || terms.revenueShareBps > BPS_DENOMINATOR
        ) {
            revert InvalidOfferingTerms();
        }
        uint256 currentTimestamp = block.timestamp;
        // New offerings intentionally compare their deadline to the L2 block timestamp.
        // forge-lint: disable-next-line(block-timestamp)
        bool fundingDeadlinePassed = currentTimestamp >= terms.fundingDeadline;
        bool invalidTimeline = fundingDeadlinePassed || terms.fundingDeadline >= terms.revenueStart
            || terms.revenueStart >= terms.revenueEnd;
        if (invalidTimeline) {
            revert InvalidOfferingTerms();
        }
        if (periodEnds.length == 0 || periodEnds.length > MAX_SETTLEMENT_PERIODS) {
            revert InvalidSettlementPeriods();
        }

        uint64 previousEnd = terms.revenueStart;
        bool invalidPeriod = false;
        for (uint256 i = 0; i < periodEnds.length; ++i) {
            if (periodEnds[i] <= previousEnd || periodEnds[i] > terms.revenueEnd) {
                invalidPeriod = true;
                break;
            }
            previousEnd = periodEnds[i];
        }
        if (invalidPeriod || previousEnd != terms.revenueEnd) {
            revert InvalidSettlementPeriods();
        }
    }

    function _getOffering(uint256 offeringId) private view returns (Offering storage offering) {
        offering = _offerings[offeringId];
        if (offering.status == OfferingStatus.None) {
            revert OfferingNotFound(offeringId);
        }
    }

    function _claimable(uint256 offeringId, address investor, Offering storage offering)
        private
        view
        returns (uint256)
    {
        uint256 balance = REVENUE_RIGHT_TOKEN.balanceOf(investor, offeringId);
        uint256 entitled = Math.mulDiv(offering.investorRevenueTotal, balance, offering.unitsForSale);
        return entitled - claimed[offeringId][investor];
    }

    function _pullExact(address from, uint256 amount) private {
        uint256 balanceBefore = SETTLEMENT_TOKEN.balanceOf(address(this));
        SETTLEMENT_TOKEN.safeTransferFrom(from, address(this), amount);
        uint256 balanceAfter = SETTLEMENT_TOKEN.balanceOf(address(this));
        uint256 received = balanceAfter >= balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) {
            revert SettlementTokenAmountMismatch(amount, received);
        }
    }

    function _pushExact(address to, uint256 amount) private {
        uint256 contractBalanceBefore = SETTLEMENT_TOKEN.balanceOf(address(this));
        uint256 recipientBalanceBefore = SETTLEMENT_TOKEN.balanceOf(to);

        SETTLEMENT_TOKEN.safeTransfer(to, amount);

        uint256 contractBalanceAfter = SETTLEMENT_TOKEN.balanceOf(address(this));
        uint256 recipientBalanceAfter = SETTLEMENT_TOKEN.balanceOf(to);
        uint256 sent = contractBalanceBefore >= contractBalanceAfter ? contractBalanceBefore - contractBalanceAfter : 0;
        uint256 received =
            recipientBalanceAfter >= recipientBalanceBefore ? recipientBalanceAfter - recipientBalanceBefore : 0;
        if (sent != amount || received != amount) {
            revert SettlementTokenAmountMismatch(amount, received);
        }
    }
}
