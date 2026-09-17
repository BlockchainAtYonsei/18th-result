// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Test} from "forge-std/Test.sol";

import {IRevenueBridge} from "../src/interfaces/IRevenueBridge.sol";
import {RevenueBridge} from "../src/RevenueBridge.sol";
import {RevenueRightTokenFactory} from "../src/RevenueRightTokenFactory.sol";
import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

contract RevenueBridgeSettlementTest is Test {
    MockSettlementToken internal settlementToken;
    RevenueBridge internal bridge;

    address internal creator = makeAddr("creator");
    address internal investor = makeAddr("investor");
    address internal secondInvestor = makeAddr("secondInvestor");
    address internal settler = makeAddr("settler");
    address internal outsider = makeAddr("outsider");

    uint256 internal constant UNIT_PRICE = 10e6;
    uint256 internal constant UNITS_FOR_SALE = 100;
    uint64 internal constant BASE_TIMESTAMP = 1_800_000_000;
    uint64 internal constant FUNDING_DEADLINE = BASE_TIMESTAMP + 7 days;
    uint64 internal constant REVENUE_START = BASE_TIMESTAMP + 8 days;
    uint64 internal constant FIRST_PERIOD_END = BASE_TIMESTAMP + 23 days;
    uint64 internal constant REVENUE_END = BASE_TIMESTAMP + 38 days;
    uint16 internal constant REVENUE_SHARE_BPS = 2_000;
    bytes32 internal constant FIRST_EVIDENCE_HASH = keccak256("january-revenue-evidence");
    bytes32 internal constant SECOND_EVIDENCE_HASH = keccak256("february-revenue-evidence");

    function setUp() public {
        vm.warp(BASE_TIMESTAMP);

        settlementToken = new MockSettlementToken();
        bridge = new RevenueBridge(
            settlementToken, address(this), "ipfs://revenue-rights/{id}.json", new RevenueRightTokenFactory()
        );

        bridge.setInvestorAllowed(investor, true);
        bridge.setInvestorAllowed(secondInvestor, true);
        bridge.grantRole(bridge.SETTLER_ROLE(), settler);

        settlementToken.mint(investor, 2_000e6);
        settlementToken.mint(secondInvestor, 2_000e6);
        settlementToken.mint(settler, 10_000e6);

        _approve(investor);
        _approve(secondInvestor);
        _approve(settler);
    }

    function testSettlesCompletedPeriodAndPullsInvestorShare() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);

        uint256 settlerBalanceBefore = settlementToken.balanceOf(settler);
        vm.prank(settler);
        bridge.settlePeriod(offeringId, 0, 1_001e6, FIRST_EVIDENCE_HASH);

        IRevenueBridge.Offering memory offering = bridge.getOffering(offeringId);
        IRevenueBridge.PeriodSettlement memory settlement = bridge.getPeriodSettlement(offeringId, 0);

        assertEq(uint256(offering.status), uint256(IRevenueBridge.OfferingStatus.Settling));
        assertEq(offering.grossRevenueTotal, 1_001e6);
        assertEq(offering.investorRevenueTotal, 200_200_000);
        assertEq(offering.nextPeriodIndex, 1);
        assertEq(settlement.grossRevenue, 1_001e6);
        assertEq(settlement.investorAmount, 200_200_000);
        assertEq(settlement.evidenceHash, FIRST_EVIDENCE_HASH);
        assertEq(settlement.settledAt, FIRST_PERIOD_END);
        assertEq(settlerBalanceBefore - settlementToken.balanceOf(settler), 200_200_000);
        assertEq(settlementToken.balanceOf(address(bridge)), 200_200_000);
        assertEq(bridge.totalRevenueLiability(), 200_200_000);
        assertEq(bridge.claimable(offeringId, investor), 80_080_000);
        assertEq(bridge.claimable(offeringId, secondInvestor), 120_120_000);
    }

    function testCumulativeCalculationCarriesRoundingAcrossPeriods() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);

        vm.prank(settler);
        bridge.settlePeriod(offeringId, 0, 3, FIRST_EVIDENCE_HASH);
        assertEq(bridge.getOffering(offeringId).investorRevenueTotal, 0);

        vm.warp(REVENUE_END);
        vm.prank(settler);
        bridge.settlePeriod(offeringId, 1, 2, SECOND_EVIDENCE_HASH);

        IRevenueBridge.Offering memory offering = bridge.getOffering(offeringId);
        assertEq(offering.grossRevenueTotal, 5);
        assertEq(offering.investorRevenueTotal, 1);
        assertEq(bridge.getPeriodSettlement(offeringId, 1).investorAmount, 1);
        assertEq(bridge.totalRevenueLiability(), 1);
    }

    function testInvestorClaimsAccumulatedRevenue() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);
        _settle(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);

        uint256 investorBalanceBefore = settlementToken.balanceOf(investor);
        vm.prank(investor);
        bridge.claim(offeringId);

        assertEq(settlementToken.balanceOf(investor) - investorBalanceBefore, 80e6);
        assertEq(bridge.claimed(offeringId, investor), 80e6);
        assertEq(bridge.getOffering(offeringId).totalClaimed, 80e6);
        assertEq(bridge.totalRevenueLiability(), 120e6);
        assertEq(bridge.claimable(offeringId, investor), 0);

        vm.prank(investor);
        vm.expectRevert(RevenueBridge.NothingToClaim.selector);
        bridge.claim(offeringId);
    }

    function testClaimAfterEveryPeriodMatchesSingleClaim() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);
        _settle(offeringId, 0, 1_001e6, FIRST_EVIDENCE_HASH);

        vm.prank(investor);
        bridge.claim(offeringId);
        uint256 claimedAfterFirstPeriod = bridge.claimed(offeringId, investor);

        vm.warp(REVENUE_END);
        _settle(offeringId, 1, 999e6, SECOND_EVIDENCE_HASH);

        vm.prank(investor);
        bridge.claim(offeringId);

        assertEq(claimedAfterFirstPeriod, 80_080_000);
        assertEq(bridge.claimed(offeringId, investor), 160e6);
        assertEq(bridge.claimable(offeringId, secondInvestor), 240e6);
    }

    function testOnlySettlerCanSettlePeriod() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, bridge.SETTLER_ROLE()
            )
        );
        vm.prank(outsider);
        bridge.settlePeriod(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);
    }

    function testRejectsOpenOutOfOrderAndDuplicatePeriods() public {
        uint256 offeringId = _createActiveOffering();

        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(RevenueBridge.SettlementPeriodStillOpen.selector, FIRST_PERIOD_END));
        bridge.settlePeriod(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);

        vm.warp(FIRST_PERIOD_END);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(RevenueBridge.InvalidPeriodIndex.selector, 0, 1));
        bridge.settlePeriod(offeringId, 1, 1_000e6, FIRST_EVIDENCE_HASH);

        _settle(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);

        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(RevenueBridge.InvalidPeriodIndex.selector, 1, 0));
        bridge.settlePeriod(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);
    }

    function testAllowsZeroRevenueWithEvidence() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);

        uint256 settlerBalanceBefore = settlementToken.balanceOf(settler);
        _settle(offeringId, 0, 0, FIRST_EVIDENCE_HASH);

        assertEq(bridge.getOffering(offeringId).nextPeriodIndex, 1);
        assertEq(bridge.getPeriodSettlement(offeringId, 0).grossRevenue, 0);
        assertEq(settlementToken.balanceOf(settler), settlerBalanceBefore);
        assertEq(bridge.totalRevenueLiability(), 0);
    }

    function testRejectsEmptyEvidenceHash() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);

        vm.prank(settler);
        vm.expectRevert(RevenueBridge.InvalidEvidenceHash.selector);
        bridge.settlePeriod(offeringId, 0, 1_000e6, bytes32(0));
    }

    function testDepositFailureRollsBackSettlementReport() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);

        vm.prank(settler);
        assertTrue(settlementToken.approve(address(bridge), 0));

        vm.expectRevert();
        vm.prank(settler);
        bridge.settlePeriod(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);

        IRevenueBridge.Offering memory offering = bridge.getOffering(offeringId);
        assertEq(uint256(offering.status), uint256(IRevenueBridge.OfferingStatus.Active));
        assertEq(offering.nextPeriodIndex, 0);
        assertEq(offering.grossRevenueTotal, 0);
        assertEq(offering.investorRevenueTotal, 0);
        assertEq(bridge.totalRevenueLiability(), 0);
    }

    function testDirectTokenTransferDoesNotCreateClaimableRevenue() public {
        uint256 offeringId = _createActiveOffering();
        settlementToken.mint(address(bridge), 200e6);

        assertEq(settlementToken.balanceOf(address(bridge)), 200e6);
        assertEq(bridge.totalRevenueLiability(), 0);
        assertEq(bridge.claimable(offeringId, investor), 0);
    }

    function testReportsOverduePeriodForFrontend() public {
        uint256 offeringId = _createActiveOffering();
        assertFalse(bridge.settlementOverdue(offeringId));

        vm.warp(FIRST_PERIOD_END);
        assertTrue(bridge.settlementOverdue(offeringId));

        _settle(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);
        assertFalse(bridge.settlementOverdue(offeringId));

        vm.warp(REVENUE_END);
        assertTrue(bridge.settlementOverdue(offeringId));
    }

    function testClosesOnlyAfterAllPeriodsAndKeepsClaimsAvailable() public {
        uint256 offeringId = _createActiveOffering();
        vm.warp(FIRST_PERIOD_END);
        _settle(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);

        vm.expectRevert(abi.encodeWithSelector(RevenueBridge.SettlementPeriodsRemaining.selector, 1));
        bridge.closeOffering(offeringId);

        vm.warp(REVENUE_END);
        _settle(offeringId, 1, 1_000e6, SECOND_EVIDENCE_HASH);
        bridge.closeOffering(offeringId);

        assertEq(uint256(bridge.statusOf(offeringId)), uint256(IRevenueBridge.OfferingStatus.Closed));
        assertEq(bridge.claimable(offeringId, investor), 160e6);
        assertFalse(bridge.settlementOverdue(offeringId));

        vm.prank(investor);
        bridge.claim(offeringId);
        assertEq(bridge.claimed(offeringId, investor), 160e6);
    }

    function testCreatorCanWithdrawAdvanceAfterOfferingCloses() public {
        uint256 offeringId = _createActiveOfferingWithoutAdvanceWithdrawal();

        vm.warp(FIRST_PERIOD_END);
        _settle(offeringId, 0, 1_000e6, FIRST_EVIDENCE_HASH);
        vm.warp(REVENUE_END);
        _settle(offeringId, 1, 1_000e6, SECOND_EVIDENCE_HASH);
        bridge.closeOffering(offeringId);

        assertEq(uint256(bridge.statusOf(offeringId)), uint256(IRevenueBridge.OfferingStatus.Closed));
        assertFalse(bridge.getOffering(offeringId).advanceWithdrawn);

        uint256 creatorBalanceBefore = settlementToken.balanceOf(creator);
        vm.prank(creator);
        bridge.withdrawAdvance(offeringId);

        assertEq(settlementToken.balanceOf(creator) - creatorBalanceBefore, UNITS_FOR_SALE * UNIT_PRICE);
        assertTrue(bridge.getOffering(offeringId).advanceWithdrawn);
        assertEq(bridge.totalEscrowLiability(), 0);
        assertEq(bridge.totalRevenueLiability(), 400e6);
        assertEq(settlementToken.balanceOf(address(bridge)), 400e6);
    }

    function _createActiveOffering() internal returns (uint256 offeringId) {
        offeringId = _createActiveOfferingWithoutAdvanceWithdrawal();

        vm.prank(creator);
        bridge.withdrawAdvance(offeringId);
    }

    function _createActiveOfferingWithoutAdvanceWithdrawal() internal returns (uint256 offeringId) {
        IRevenueBridge.OfferingTerms memory terms = IRevenueBridge.OfferingTerms({
            creatorPayout: creator,
            assetKey: keccak256("youtube:creator:2027"),
            termsHash: keccak256("terms-v1"),
            valuationHash: keccak256("valuation-v1"),
            unitsForSale: UNITS_FOR_SALE,
            unitPrice: UNIT_PRICE,
            fundingDeadline: FUNDING_DEADLINE,
            revenueStart: REVENUE_START,
            revenueEnd: REVENUE_END,
            revenueShareBps: REVENUE_SHARE_BPS
        });
        uint64[] memory periodEnds = new uint64[](2);
        periodEnds[0] = FIRST_PERIOD_END;
        periodEnds[1] = REVENUE_END;
        offeringId = bridge.createOffering(terms, periodEnds);

        vm.prank(investor);
        bridge.invest(offeringId, 40);
        vm.prank(secondInvestor);
        bridge.invest(offeringId, 60);
        bridge.finalizeFunding(offeringId);
    }

    function _settle(uint256 offeringId, uint256 periodIndex, uint256 grossRevenue, bytes32 evidenceHash) internal {
        vm.prank(settler);
        bridge.settlePeriod(offeringId, periodIndex, grossRevenue, evidenceHash);
    }

    function _approve(address account) internal {
        vm.prank(account);
        assertTrue(settlementToken.approve(address(bridge), type(uint256).max));
    }
}
