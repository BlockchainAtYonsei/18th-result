// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {RevenueRightToken} from "../src/RevenueRightToken.sol";

contract RevenueRightTokenTest is Test {
    RevenueRightToken internal token;

    address internal investor = makeAddr("investor");
    address internal recipient = makeAddr("recipient");
    address internal operator = makeAddr("operator");

    uint256 internal constant OFFERING_ID = 1;

    function setUp() public {
        token = new RevenueRightToken(address(this), "ipfs://revenue-rights/{id}.json");
    }

    function testControllerCanMintAndBurn() public {
        token.mint(investor, OFFERING_ID, 100, "");

        assertEq(token.balanceOf(investor, OFFERING_ID), 100);
        assertEq(token.totalSupply(OFFERING_ID), 100);

        token.burn(investor, OFFERING_ID, 40);

        assertEq(token.balanceOf(investor, OFFERING_ID), 60);
        assertEq(token.totalSupply(OFFERING_ID), 60);
    }

    function testNonControllerCannotMint() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RevenueRightToken.UnauthorizedController.selector, operator));

        token.mint(investor, OFFERING_ID, 1, "");
    }

    function testNonControllerCannotBurn() public {
        token.mint(investor, OFFERING_ID, 1, "");

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RevenueRightToken.UnauthorizedController.selector, operator));

        token.burn(investor, OFFERING_ID, 1);
    }

    function testInvestorCannotTransfer() public {
        token.mint(investor, OFFERING_ID, 100, "");

        vm.prank(investor);
        vm.expectRevert(RevenueRightToken.TransfersDisabled.selector);

        token.safeTransferFrom(investor, recipient, OFFERING_ID, 10, "");
    }

    function testApprovedOperatorCannotTransfer() public {
        token.mint(investor, OFFERING_ID, 100, "");

        vm.prank(investor);
        token.setApprovalForAll(operator, true);

        vm.prank(operator);
        vm.expectRevert(RevenueRightToken.TransfersDisabled.selector);

        token.safeTransferFrom(investor, recipient, OFFERING_ID, 10, "");
    }

    function testConstructorRejectsZeroController() public {
        vm.expectRevert(RevenueRightToken.InvalidController.selector);

        new RevenueRightToken(address(0), "");
    }

    function testFuzzControllerMaintainsSupply(uint256 minted, uint256 burned) public {
        minted = bound(minted, 1, type(uint128).max);
        burned = bound(burned, 0, minted);

        token.mint(investor, OFFERING_ID, minted, "");
        token.burn(investor, OFFERING_ID, burned);

        assertEq(token.balanceOf(investor, OFFERING_ID), uint256(minted) - burned);
        assertEq(token.totalSupply(OFFERING_ID), uint256(minted) - burned);
    }
}
