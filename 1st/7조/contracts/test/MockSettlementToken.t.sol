// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

contract MockSettlementTokenTest is Test {
    function testMintUsesSixDecimals() public {
        MockSettlementToken token = new MockSettlementToken();
        address investor = makeAddr("investor");

        token.mint(investor, 1_000e6);

        assertEq(token.decimals(), 6);
        assertEq(token.balanceOf(investor), 1_000e6);
    }
}
