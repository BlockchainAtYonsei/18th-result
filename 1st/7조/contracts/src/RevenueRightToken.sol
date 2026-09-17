// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";

/// @title RevenueRightToken
/// @notice Represents fixed units of creator revenue-right offerings.
/// @dev Each token ID maps to one offering. Units can only be minted or burned
///      by the controller and cannot be transferred between investors.
contract RevenueRightToken is ERC1155, ERC1155Supply {
    error InvalidController();
    error UnauthorizedController(address caller);
    error TransfersDisabled();

    address public immutable CONTROLLER;

    modifier onlyController() {
        if (msg.sender != CONTROLLER) {
            revert UnauthorizedController(msg.sender);
        }
        _;
    }

    constructor(address controller_, string memory baseUri) ERC1155(baseUri) {
        if (controller_ == address(0)) {
            revert InvalidController();
        }

        CONTROLLER = controller_;
    }

    /// @notice Mints offering units to an investor.
    function mint(address to, uint256 offeringId, uint256 amount, bytes calldata data) external onlyController {
        _mint(to, offeringId, amount, data);
    }

    /// @notice Burns offering units when a failed investment is refunded.
    function burn(address from, uint256 offeringId, uint256 amount) external onlyController {
        _burn(from, offeringId, amount);
    }

    /// @dev Allows controller-driven minting and burning while blocking all
    ///      transfers between non-zero addresses, including operator transfers.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
    {
        if (from != address(0) && to != address(0)) {
            revert TransfersDisabled();
        }

        super._update(from, to, ids, values);
    }
}
