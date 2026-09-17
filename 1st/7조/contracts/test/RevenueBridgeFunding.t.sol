// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IRevenueBridge} from "../src/interfaces/IRevenueBridge.sol";
import {RevenueBridge} from "../src/RevenueBridge.sol";
import {RevenueRightTokenFactory} from "../src/RevenueRightTokenFactory.sol";
import {RevenueRightToken} from "../src/RevenueRightToken.sol";
import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

contract RevenueBridgeFundingTest is Test {
    MockSettlementToken internal settlementToken;
    RevenueBridge internal bridge;
    RevenueRightToken internal rightToken;

    address internal creator = makeAddr("creator");
    address internal investor = makeAddr("investor");
    address internal secondInvestor = makeAddr("secondInvestor");
    address internal outsider = makeAddr("outsider");

    uint256 internal constant UNIT_PRICE = 10e6;
    uint256 internal constant UNITS_FOR_SALE = 100;
    uint64 internal constant BASE_TIMESTAMP = 1_800_000_000;
    uint64 internal constant FUNDING_DEADLINE = BASE_TIMESTAMP + 7 days;
    uint64 internal constant REVENUE_START = BASE_TIMESTAMP + 8 days;
    uint64 internal constant FIRST_PERIOD_END = BASE_TIMESTAMP + 23 days;
    uint64 internal constant REVENUE_END = BASE_TIMESTAMP + 38 days;
    uint16 internal constant REVENUE_SHARE_BPS = 2_000;

    function setUp() public {
        vm.warp(BASE_TIMESTAMP);

        settlementToken = new MockSettlementToken();
        bridge = new RevenueBridge(
            settlementToken, address(this), "ipfs://revenue-rights/{id}.json", new RevenueRightTokenFactory()
        );
        rightToken = bridge.REVENUE_RIGHT_TOKEN();

        bridge.setInvestorAllowed(investor, true);
        bridge.setInvestorAllowed(secondInvestor, true);

        settlementToken.mint(investor, 2_000e6);
        settlementToken.mint(secondInvestor, 2_000e6);

        vm.prank(investor);
        assertTrue(settlementToken.approve(address(bridge), type(uint256).max));
        vm.prank(secondInvestor);
        assertTrue(settlementToken.approve(address(bridge), type(uint256).max));
    }

    function testCreateOfferingStoresImmutableFundingTerms() public {
        uint256 offeringId = _createOffering();
        RevenueBridge.Offering memory offering = bridge.getOffering(offeringId);

        assertEq(uint256(offering.status), uint256(IRevenueBridge.OfferingStatus.Funding));
        assertEq(offering.creatorPayout, creator);
        assertEq(offering.assetKey, keccak256("youtube:creator:2027"));
        assertEq(offering.termsHash, keccak256("terms-v1"));
        assertEq(offering.valuationHash, keccak256("valuation-v1"));
        assertEq(offering.unitsForSale, UNITS_FOR_SALE);
        assertEq(offering.unitPrice, UNIT_PRICE);
        assertEq(offering.raisedUnits, 0);
        assertEq(offering.totalRefunded, 0);
        assertEq(offering.fundingDeadline, FUNDING_DEADLINE);
        assertEq(offering.revenueStart, REVENUE_START);
        assertEq(offering.revenueEnd, REVENUE_END);
        assertEq(offering.revenueShareBps, REVENUE_SHARE_BPS);
        assertFalse(offering.advanceWithdrawn);
        assertEq(bridge.targetRaise(offeringId), UNITS_FOR_SALE * UNIT_PRICE);

        uint64[] memory periodEnds = bridge.getPeriodEnds(offeringId);
        assertEq(periodEnds.length, 2);
        assertEq(periodEnds[0], FIRST_PERIOD_END);
        assertEq(periodEnds[1], REVENUE_END);
        assertEq(rightToken.CONTROLLER(), address(bridge));
    }

    function testInvestEscrowsExactAmountAndMintsUnits() public {
        uint256 offeringId = _createOffering();

        vm.prank(investor);
        bridge.invest(offeringId, 40);

        assertEq(settlementToken.balanceOf(address(bridge)), 40 * UNIT_PRICE);
        assertEq(bridge.totalEscrowLiability(), 40 * UNIT_PRICE);
        assertEq(bridge.investedUnits(offeringId, investor), 40);
        assertEq(rightToken.balanceOf(investor, offeringId), 40);
        assertEq(rightToken.totalSupply(offeringId), 40);
    }

    function testFullyFundedOfferingPaysCreatorOnce() public {
        uint256 offeringId = _createOffering();
        _invest(investor, offeringId, 40);
        _invest(secondInvestor, offeringId, 60);

        bridge.finalizeFunding(offeringId);

        assertEq(uint256(bridge.statusOf(offeringId)), uint256(IRevenueBridge.OfferingStatus.Active));

        uint256 creatorBalanceBefore = settlementToken.balanceOf(creator);
        vm.prank(creator);
        bridge.withdrawAdvance(offeringId);

        assertEq(settlementToken.balanceOf(creator) - creatorBalanceBefore, UNITS_FOR_SALE * UNIT_PRICE);
        assertEq(settlementToken.balanceOf(address(bridge)), 0);
        assertEq(bridge.totalEscrowLiability(), 0);

        vm.prank(creator);
        vm.expectRevert(RevenueBridge.AdvanceAlreadyWithdrawn.selector);
        bridge.withdrawAdvance(offeringId);
    }

    function testFundingFailureRefundsAndBurnsInvestorUnits() public {
        uint256 offeringId = _createOffering();
        _invest(investor, offeringId, 40);

        vm.warp(FUNDING_DEADLINE);
        bridge.finalizeFunding(offeringId);

        assertEq(uint256(bridge.statusOf(offeringId)), uint256(IRevenueBridge.OfferingStatus.Failed));
        assertEq(bridge.refundable(offeringId, investor), 40 * UNIT_PRICE);

        uint256 investorBalanceBefore = settlementToken.balanceOf(investor);
        vm.prank(investor);
        bridge.refund(offeringId);

        assertEq(settlementToken.balanceOf(investor) - investorBalanceBefore, 40 * UNIT_PRICE);
        assertEq(bridge.refundable(offeringId, investor), 0);
        assertEq(rightToken.balanceOf(investor, offeringId), 0);
        assertEq(rightToken.totalSupply(offeringId), 0);
        assertEq(bridge.totalEscrowLiability(), 0);

        vm.prank(investor);
        vm.expectRevert(RevenueBridge.NothingToRefund.selector);
        bridge.refund(offeringId);
    }

    function testUnlistedInvestorCannotInvest() public {
        uint256 offeringId = _createOffering();

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(RevenueBridge.InvestorNotAllowed.selector, outsider));
        bridge.invest(offeringId, 1);
    }

    function testCannotOverfundOffering() public {
        uint256 offeringId = _createOffering();

        vm.prank(investor);
        vm.expectRevert(abi.encodeWithSelector(RevenueBridge.OfferingCapacityExceeded.selector, 100));
        bridge.invest(offeringId, 101);
    }

    function testCannotInvestAtFundingDeadline() public {
        uint256 offeringId = _createOffering();
        vm.warp(FUNDING_DEADLINE);

        vm.prank(investor);
        vm.expectRevert(RevenueBridge.FundingClosed.selector);
        bridge.invest(offeringId, 1);
    }

    function testCannotFinalizeIncompleteOfferingBeforeDeadline() public {
        uint256 offeringId = _createOffering();
        _invest(investor, offeringId, 40);

        vm.expectRevert(RevenueBridge.FundingStillOpen.selector);
        bridge.finalizeFunding(offeringId);
    }

    function testPauseBlocksNewOfferingsAndInvestments() public {
        uint256 offeringId = _createOffering();
        bridge.setIntakePaused(true);

        vm.expectRevert(RevenueBridge.IntakePaused.selector);
        _createOffering();

        vm.prank(investor);
        vm.expectRevert(RevenueBridge.IntakePaused.selector);
        bridge.invest(offeringId, 1);
    }

    function testRejectsInvalidSettlementPeriods() public {
        IRevenueBridge.OfferingTerms memory terms = _defaultTerms();
        uint64[] memory periodEnds = new uint64[](2);
        periodEnds[0] = terms.revenueEnd;
        periodEnds[1] = terms.revenueEnd;

        vm.expectRevert(RevenueBridge.InvalidSettlementPeriods.selector);
        // The expected revert prevents a meaningful return value.
        // forge-lint: disable-next-line(unused-return)
        bridge.createOffering(terms, periodEnds);
    }

    function _createOffering() internal returns (uint256) {
        IRevenueBridge.OfferingTerms memory terms = _defaultTerms();
        uint64[] memory periodEnds = new uint64[](2);
        periodEnds[0] = FIRST_PERIOD_END;
        periodEnds[1] = terms.revenueEnd;
        return bridge.createOffering(terms, periodEnds);
    }

    function _defaultTerms() internal view returns (IRevenueBridge.OfferingTerms memory) {
        return IRevenueBridge.OfferingTerms({
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
    }

    function _invest(address account, uint256 offeringId, uint256 units) internal {
        vm.prank(account);
        bridge.invest(offeringId, units);
    }
}
