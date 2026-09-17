// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Test} from "forge-std/Test.sol";

import {IRevenueBridge} from "../src/interfaces/IRevenueBridge.sol";
import {RevenueBridge} from "../src/RevenueBridge.sol";
import {RevenueRightTokenFactory} from "../src/RevenueRightTokenFactory.sol";

contract ToggleFeeToken is ERC20 {
    uint256 internal constant FEE_BPS = 100;
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    bool public feeEnabled;

    constructor() ERC20("Toggle Fee USD", "tfUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeEnabled(bool enabled) external {
        feeEnabled = enabled;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (feeEnabled && from != address(0) && to != address(0)) {
            uint256 fee = value * FEE_BPS / BPS_DENOMINATOR;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
            return;
        }

        super._update(from, to, value);
    }
}

contract RejectingInvestor is IERC1155Receiver {
    error RevenueRightRejected();

    IERC20 internal immutable settlementToken;
    RevenueBridge internal immutable bridge;

    constructor(IERC20 settlementToken_, RevenueBridge bridge_) {
        settlementToken = settlementToken_;
        bridge = bridge_;
    }

    function invest(uint256 offeringId, uint256 units) external {
        settlementToken.approve(address(bridge), type(uint256).max);
        bridge.invest(offeringId, units);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert RevenueRightRejected();
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert RevenueRightRejected();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

contract ReenteringInvestor is IERC1155Receiver {
    IERC20 internal immutable settlementToken;
    RevenueBridge internal immutable bridge;

    uint256 internal offeringId;

    constructor(IERC20 settlementToken_, RevenueBridge bridge_) {
        settlementToken = settlementToken_;
        bridge = bridge_;
    }

    function attack(uint256 offeringId_, uint256 units) external {
        offeringId = offeringId_;
        settlementToken.approve(address(bridge), type(uint256).max);
        bridge.invest(offeringId_, units);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        bridge.invest(offeringId, 1);
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

contract RevenueBridgeSecurityTest is Test {
    ToggleFeeToken internal settlementToken;
    RevenueBridge internal bridge;

    address internal creator = makeAddr("creator");
    address internal investor = makeAddr("investor");

    uint256 internal constant UNIT_PRICE = 10e18;
    uint256 internal constant UNITS_FOR_SALE = 100;
    uint256 internal constant TARGET_RAISE = UNIT_PRICE * UNITS_FOR_SALE;
    uint64 internal constant BASE_TIMESTAMP = 1_800_000_000;
    uint64 internal constant FUNDING_DEADLINE = BASE_TIMESTAMP + 7 days;
    uint64 internal constant REVENUE_START = BASE_TIMESTAMP + 8 days;
    uint64 internal constant REVENUE_END = BASE_TIMESTAMP + 38 days;

    function setUp() public {
        vm.warp(BASE_TIMESTAMP);
        settlementToken = new ToggleFeeToken();
        bridge = new RevenueBridge(
            settlementToken, address(this), "ipfs://revenue-rights/{id}.json", new RevenueRightTokenFactory()
        );

        bridge.setInvestorAllowed(investor, true);
        settlementToken.mint(investor, TARGET_RAISE);
        vm.prank(investor);
        settlementToken.approve(address(bridge), type(uint256).max);
    }

    function testFeeOnTransferInvestmentRollsBackAccountingAndMint() public {
        uint256 offeringId = _createOffering();
        settlementToken.setFeeEnabled(true);

        vm.prank(investor);
        vm.expectRevert(
            abi.encodeWithSelector(
                RevenueBridge.SettlementTokenAmountMismatch.selector, TARGET_RAISE, TARGET_RAISE * 99 / 100
            )
        );
        bridge.invest(offeringId, UNITS_FOR_SALE);

        assertEq(bridge.getOffering(offeringId).raisedUnits, 0);
        assertEq(bridge.investedUnits(offeringId, investor), 0);
        assertEq(bridge.totalEscrowLiability(), 0);
        assertEq(bridge.REVENUE_RIGHT_TOKEN().totalSupply(offeringId), 0);
        assertEq(settlementToken.balanceOf(investor), TARGET_RAISE);
        assertEq(settlementToken.balanceOf(address(bridge)), 0);
    }

    function testFeeOnTransferWithdrawalRollsBackAccountingAndPayment() public {
        uint256 offeringId = _createOffering();
        vm.prank(investor);
        bridge.invest(offeringId, UNITS_FOR_SALE);
        bridge.finalizeFunding(offeringId);
        settlementToken.setFeeEnabled(true);

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                RevenueBridge.SettlementTokenAmountMismatch.selector, TARGET_RAISE, TARGET_RAISE * 99 / 100
            )
        );
        bridge.withdrawAdvance(offeringId);

        assertFalse(bridge.getOffering(offeringId).advanceWithdrawn);
        assertEq(bridge.totalEscrowLiability(), TARGET_RAISE);
        assertEq(settlementToken.balanceOf(address(bridge)), TARGET_RAISE);
        assertEq(settlementToken.balanceOf(creator), 0);
    }

    function testReceiverRejectionRollsBackInvestment() public {
        uint256 offeringId = _createOffering();
        RejectingInvestor rejectingInvestor = new RejectingInvestor(settlementToken, bridge);
        bridge.setInvestorAllowed(address(rejectingInvestor), true);
        settlementToken.mint(address(rejectingInvestor), UNIT_PRICE);

        vm.expectRevert(RejectingInvestor.RevenueRightRejected.selector);
        rejectingInvestor.invest(offeringId, 1);

        _assertRejectedInvestmentRolledBack(offeringId, address(rejectingInvestor));
    }

    function testReceiverCallbackCannotReenterInvestment() public {
        uint256 offeringId = _createOffering();
        ReenteringInvestor reenteringInvestor = new ReenteringInvestor(settlementToken, bridge);
        bridge.setInvestorAllowed(address(reenteringInvestor), true);
        settlementToken.mint(address(reenteringInvestor), 2 * UNIT_PRICE);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        reenteringInvestor.attack(offeringId, 1);

        _assertRejectedInvestmentRolledBack(offeringId, address(reenteringInvestor));
    }

    function _createOffering() internal returns (uint256) {
        IRevenueBridge.OfferingTerms memory terms = IRevenueBridge.OfferingTerms({
            creatorPayout: creator,
            assetKey: keccak256("youtube:security-test"),
            termsHash: keccak256("terms-security-test"),
            valuationHash: keccak256("valuation-security-test"),
            unitsForSale: UNITS_FOR_SALE,
            unitPrice: UNIT_PRICE,
            fundingDeadline: FUNDING_DEADLINE,
            revenueStart: REVENUE_START,
            revenueEnd: REVENUE_END,
            revenueShareBps: 2_000
        });
        uint64[] memory periodEnds = new uint64[](1);
        periodEnds[0] = REVENUE_END;
        return bridge.createOffering(terms, periodEnds);
    }

    function _assertRejectedInvestmentRolledBack(uint256 offeringId, address account) internal view {
        assertEq(bridge.getOffering(offeringId).raisedUnits, 0);
        assertEq(bridge.investedUnits(offeringId, account), 0);
        assertEq(bridge.totalEscrowLiability(), 0);
        assertEq(bridge.REVENUE_RIGHT_TOKEN().balanceOf(account, offeringId), 0);
        assertEq(settlementToken.balanceOf(address(bridge)), 0);
    }
}
