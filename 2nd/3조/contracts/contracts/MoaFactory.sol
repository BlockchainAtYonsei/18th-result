// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MoaAccount} from "./MoaAccount.sol";

/// @title MoaFactory
/// @notice Creates Moa accounts and indexes them by owner.
contract MoaFactory {
    uint256 public constant OWNER_COUNT = 5;
    uint256 public constant THRESHOLD = 3;

    error CreatorNotOwner(address creator);

    event AccountCreated(
        address indexed account,
        address indexed creator,
        address[OWNER_COUNT] owners,
        uint256 threshold
    );

    address[] private _accounts;
    mapping(address owner => address[] accounts) private _accountsByOwner;
    mapping(address account => bool) public isMoaAccount;

    function createAccount(address[OWNER_COUNT] calldata owners) external returns (address account) {
        bool creatorIncluded;

        for (uint256 i = 0; i < OWNER_COUNT; ++i) {
            if (owners[i] == msg.sender) creatorIncluded = true;
        }

        if (!creatorIncluded) revert CreatorNotOwner(msg.sender);

        account = address(new MoaAccount(owners));
        _accounts.push(account);
        isMoaAccount[account] = true;

        for (uint256 i = 0; i < OWNER_COUNT; ++i) {
            _accountsByOwner[owners[i]].push(account);
        }

        emit AccountCreated(account, msg.sender, owners, THRESHOLD);
    }

    function accountCount() external view returns (uint256) {
        return _accounts.length;
    }

    function accountAt(uint256 index) external view returns (address) {
        return _accounts[index];
    }

    function accountsOf(address owner) external view returns (address[] memory) {
        return _accountsByOwner[owner];
    }
}
