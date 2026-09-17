// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IRevenueBridge {
    enum OfferingStatus {
        None,
        Funding,
        Active,
        Failed,
        Settling,
        Closed
    }

    struct OfferingTerms {
        address creatorPayout;
        bytes32 assetKey;
        bytes32 termsHash;
        bytes32 valuationHash;
        uint256 unitsForSale;
        uint256 unitPrice;
        uint64 fundingDeadline;
        uint64 revenueStart;
        uint64 revenueEnd;
        uint16 revenueShareBps;
    }

    struct Offering {
        OfferingStatus status;
        address creatorPayout;
        bytes32 assetKey;
        bytes32 termsHash;
        bytes32 valuationHash;
        uint256 unitsForSale;
        uint256 unitPrice;
        uint256 raisedUnits;
        uint256 totalRefunded;
        uint256 grossRevenueTotal;
        uint256 investorRevenueTotal;
        uint256 totalClaimed;
        uint256 nextPeriodIndex;
        uint64 fundingDeadline;
        uint64 revenueStart;
        uint64 revenueEnd;
        uint16 revenueShareBps;
        bool advanceWithdrawn;
    }

    struct PeriodSettlement {
        uint256 grossRevenue;
        uint256 investorAmount;
        bytes32 evidenceHash;
        uint256 settledAt;
    }

    event OfferingCreated(
        uint256 indexed offeringId,
        address indexed creatorPayout,
        bytes32 indexed assetKey,
        uint256 unitsForSale,
        uint256 unitPrice
    );
    event InvestorPermissionUpdated(address indexed investor, bool allowed);
    event IntakePauseUpdated(bool paused);
    event Invested(uint256 indexed offeringId, address indexed investor, uint256 units, uint256 amount);
    event FundingFinalized(uint256 indexed offeringId, OfferingStatus status, uint256 raisedAmount);
    event AdvanceWithdrawn(uint256 indexed offeringId, address indexed creatorPayout, uint256 amount);
    event Refunded(uint256 indexed offeringId, address indexed investor, uint256 units, uint256 amount);
    event PeriodSettled(
        uint256 indexed offeringId,
        uint256 indexed periodIndex,
        bytes32 indexed evidenceHash,
        uint256 grossRevenue,
        uint256 investorAmount,
        uint256 grossRevenueTotal,
        uint256 investorRevenueTotal
    );
    event RevenueClaimed(uint256 indexed offeringId, address indexed investor, uint256 amount);
    event OfferingClosed(uint256 indexed offeringId);

    function createOffering(OfferingTerms calldata terms, uint64[] calldata periodEnds)
        external
        returns (uint256 offeringId);

    function invest(uint256 offeringId, uint256 units) external;
    function finalizeFunding(uint256 offeringId) external;
    function withdrawAdvance(uint256 offeringId) external;
    function refund(uint256 offeringId) external;
    function settlePeriod(uint256 offeringId, uint256 periodIndex, uint256 grossRevenue, bytes32 evidenceHash) external;
    function claim(uint256 offeringId) external;
    function closeOffering(uint256 offeringId) external;

    function statusOf(uint256 offeringId) external view returns (OfferingStatus);
    function getOffering(uint256 offeringId) external view returns (Offering memory);
    function targetRaise(uint256 offeringId) external view returns (uint256);
    function refundable(uint256 offeringId, address investor) external view returns (uint256);
    function claimable(uint256 offeringId, address investor) external view returns (uint256);
    function nextUnsettledPeriod(uint256 offeringId)
        external
        view
        returns (uint256 periodIndex, uint64 periodEnd, bool allSettled);
    function settlementOverdue(uint256 offeringId) external view returns (bool);
    function getPeriodEnds(uint256 offeringId) external view returns (uint64[] memory);
    function getPeriodSettlement(uint256 offeringId, uint256 periodIndex)
        external
        view
        returns (PeriodSettlement memory);
}
