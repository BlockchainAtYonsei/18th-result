// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IRevenueBridge} from "../src/interfaces/IRevenueBridge.sol";
import {RevenueBridge} from "../src/RevenueBridge.sol";
import {RevenueRightTokenFactory} from "../src/RevenueRightTokenFactory.sol";
import {RevenueRightToken} from "../src/RevenueRightToken.sol";
import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

contract RevenueBridgeHandler is Test {
    RevenueBridge internal immutable bridge;
    MockSettlementToken internal immutable settlementToken;

    uint256[2] internal offeringIds;
    address[2] internal creators;
    address[2] internal investors;

    constructor(
        RevenueBridge bridge_,
        MockSettlementToken settlementToken_,
        uint256[2] memory offeringIds_,
        address[2] memory creators_,
        address[2] memory investors_
    ) {
        bridge = bridge_;
        settlementToken = settlementToken_;
        offeringIds = offeringIds_;
        creators = creators_;
        investors = investors_;
    }

    function withdrawAdvance(uint256 offeringSeed) external {
        uint256 selected = offeringSeed % offeringIds.length;
        uint256 offeringId = offeringIds[selected];
        IRevenueBridge.Offering memory offering = bridge.getOffering(offeringId);

        bool successfulStatus = offering.status == IRevenueBridge.OfferingStatus.Active
            || offering.status == IRevenueBridge.OfferingStatus.Settling
            || offering.status == IRevenueBridge.OfferingStatus.Closed;
        if (!successfulStatus || offering.advanceWithdrawn) {
            return;
        }

        vm.prank(creators[selected]);
        bridge.withdrawAdvance(offeringId);
    }

    function settleNextPeriod(uint256 offeringSeed, uint256 grossRevenue) external {
        uint256 offeringId = offeringIds[offeringSeed % offeringIds.length];
        IRevenueBridge.OfferingStatus status = bridge.statusOf(offeringId);
        if (status != IRevenueBridge.OfferingStatus.Active && status != IRevenueBridge.OfferingStatus.Settling) {
            return;
        }

        (uint256 periodIndex, uint64 periodEnd, bool allSettled) = bridge.nextUnsettledPeriod(offeringId);
        if (allSettled) {
            return;
        }
        if (block.timestamp < periodEnd) {
            vm.warp(periodEnd);
        }

        grossRevenue = bound(grossRevenue, 0, 1_000_000e6);
        bytes32 evidenceHash = keccak256(abi.encode(offeringId, periodIndex, grossRevenue));
        bridge.settlePeriod(offeringId, periodIndex, grossRevenue, evidenceHash);
    }

    function claim(uint256 offeringSeed, uint256 investorSeed) external {
        uint256 offeringId = offeringIds[offeringSeed % offeringIds.length];
        address investor = investors[investorSeed % investors.length];
        if (bridge.claimable(offeringId, investor) == 0) {
            return;
        }

        vm.prank(investor);
        bridge.claim(offeringId);
    }

    function closeOffering(uint256 offeringSeed) external {
        uint256 offeringId = offeringIds[offeringSeed % offeringIds.length];
        if (bridge.statusOf(offeringId) != IRevenueBridge.OfferingStatus.Settling) {
            return;
        }

        (,, bool allSettled) = bridge.nextUnsettledPeriod(offeringId);
        if (allSettled) {
            bridge.closeOffering(offeringId);
        }
    }
}

contract RevenueBridgeInvariantTest is Test {
    MockSettlementToken internal settlementToken;
    RevenueBridge internal bridge;
    RevenueRightToken internal rightToken;
    RevenueBridgeHandler internal handler;

    address[2] internal creators;
    address[2] internal investors;
    uint256[2] internal offeringIds;

    uint256 internal constant UNIT_PRICE = 10e6;
    uint256 internal constant UNITS_FOR_SALE = 100;
    uint256 internal constant TARGET_RAISE = UNIT_PRICE * UNITS_FOR_SALE;
    uint64 internal constant BASE_TIMESTAMP = 1_800_000_000;
    uint64 internal constant FUNDING_DEADLINE = BASE_TIMESTAMP + 7 days;
    uint64 internal constant REVENUE_START = BASE_TIMESTAMP + 8 days;
    uint64 internal constant FIRST_PERIOD_END = BASE_TIMESTAMP + 23 days;
    uint64 internal constant REVENUE_END = BASE_TIMESTAMP + 38 days;

    function setUp() public {
        vm.warp(BASE_TIMESTAMP);
        creators = [makeAddr("firstCreator"), makeAddr("secondCreator")];
        investors = [makeAddr("firstInvestor"), makeAddr("secondInvestor")];

        settlementToken = new MockSettlementToken();
        bridge = new RevenueBridge(
            settlementToken, address(this), "ipfs://revenue-rights/{id}.json", new RevenueRightTokenFactory()
        );
        rightToken = bridge.REVENUE_RIGHT_TOKEN();

        for (uint256 i = 0; i < investors.length; ++i) {
            bridge.setInvestorAllowed(investors[i], true);
            settlementToken.mint(investors[i], 2 * TARGET_RAISE);
            vm.prank(investors[i]);
            settlementToken.approve(address(bridge), type(uint256).max);
        }

        offeringIds[0] = _createFundedOffering(0);
        offeringIds[1] = _createFundedOffering(1);

        handler = new RevenueBridgeHandler(bridge, settlementToken, offeringIds, creators, investors);
        bridge.grantRole(bridge.SETTLER_ROLE(), address(handler));
        settlementToken.mint(address(handler), type(uint128).max);
        vm.prank(address(handler));
        settlementToken.approve(address(bridge), type(uint256).max);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = handler.withdrawAdvance.selector;
        selectors[1] = handler.settleNextPeriod.selector;
        selectors[2] = handler.claim.selector;
        selectors[3] = handler.closeOffering.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariantTokenBalanceEqualsRecordedLiabilities() public view {
        assertEq(
            settlementToken.balanceOf(address(bridge)), bridge.totalEscrowLiability() + bridge.totalRevenueLiability()
        );
    }

    function invariantAggregateLiabilitiesMatchOfferings() public view {
        uint256 expectedEscrowLiability;
        uint256 expectedRevenueLiability;

        for (uint256 i = 0; i < offeringIds.length; ++i) {
            IRevenueBridge.Offering memory offering = bridge.getOffering(offeringIds[i]);
            if (!offering.advanceWithdrawn) {
                expectedEscrowLiability += TARGET_RAISE;
            }
            expectedRevenueLiability += offering.investorRevenueTotal - offering.totalClaimed;
        }

        assertEq(bridge.totalEscrowLiability(), expectedEscrowLiability);
        assertEq(bridge.totalRevenueLiability(), expectedRevenueLiability);
    }

    function invariantClaimsNeverExceedDepositedRevenue() public view {
        for (uint256 i = 0; i < offeringIds.length; ++i) {
            IRevenueBridge.Offering memory offering = bridge.getOffering(offeringIds[i]);
            assertLe(offering.totalClaimed, offering.investorRevenueTotal);
            assertEq(
                offering.totalClaimed,
                bridge.claimed(offeringIds[i], investors[0]) + bridge.claimed(offeringIds[i], investors[1])
            );
        }
    }

    function invariantSuccessfulOfferingSupplyStaysFixed() public view {
        for (uint256 i = 0; i < offeringIds.length; ++i) {
            assertEq(rightToken.totalSupply(offeringIds[i]), UNITS_FOR_SALE);
            assertEq(rightToken.balanceOf(investors[0], offeringIds[i]), 40);
            assertEq(rightToken.balanceOf(investors[1], offeringIds[i]), 60);
        }
    }

    function _createFundedOffering(uint256 index) internal returns (uint256 offeringId) {
        IRevenueBridge.OfferingTerms memory terms = IRevenueBridge.OfferingTerms({
            creatorPayout: creators[index],
            assetKey: keccak256(abi.encode("youtube:invariant", index)),
            termsHash: keccak256(abi.encode("terms-invariant", index)),
            valuationHash: keccak256(abi.encode("valuation-invariant", index)),
            unitsForSale: UNITS_FOR_SALE,
            unitPrice: UNIT_PRICE,
            fundingDeadline: FUNDING_DEADLINE,
            revenueStart: REVENUE_START,
            revenueEnd: REVENUE_END,
            revenueShareBps: 2_000
        });
        uint64[] memory periodEnds = new uint64[](2);
        periodEnds[0] = FIRST_PERIOD_END;
        periodEnds[1] = REVENUE_END;
        offeringId = bridge.createOffering(terms, periodEnds);

        vm.prank(investors[0]);
        bridge.invest(offeringId, 40);
        vm.prank(investors[1]);
        bridge.invest(offeringId, 60);
        bridge.finalizeFunding(offeringId);
    }
}
