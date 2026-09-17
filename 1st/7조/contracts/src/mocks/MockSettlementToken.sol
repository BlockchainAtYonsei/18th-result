// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockSettlementToken
/// @notice Test-only ERC-20 with USDC-like decimals and unrestricted minting.
contract MockSettlementToken is ERC20 {
    constructor() ERC20("Mock Settlement USD", "mUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
