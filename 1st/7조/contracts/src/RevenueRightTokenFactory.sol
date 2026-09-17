// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {RevenueRightToken} from "./RevenueRightToken.sol";

/// @notice Deploys revenue-right tokens without embedding their creation code in RevenueBridge.
contract RevenueRightTokenFactory {
    function deploy(address controller, string calldata baseUri) external returns (RevenueRightToken token) {
        token = new RevenueRightToken(controller, baseUri);
    }
}
