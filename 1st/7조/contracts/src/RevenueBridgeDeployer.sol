// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {RevenueBridge} from "./RevenueBridge.sol";
import {RevenueRightTokenFactory} from "./RevenueRightTokenFactory.sol";

/// @notice Deploys RevenueBridge instances for the demo deployment manager.
contract RevenueBridgeDeployer {
    RevenueRightTokenFactory public immutable RIGHT_TOKEN_FACTORY;

    constructor(RevenueRightTokenFactory rightTokenFactory) {
        RIGHT_TOKEN_FACTORY = rightTokenFactory;
    }

    function deploy(IERC20 settlementToken, address admin, string calldata tokenBaseUri)
        external
        returns (RevenueBridge bridge)
    {
        bridge = new RevenueBridge(settlementToken, admin, tokenBaseUri, RIGHT_TOKEN_FACTORY);
    }
}
