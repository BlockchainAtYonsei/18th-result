// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Minimal example mimicking owner/balances layout.
 * Label: 최소 예제 (NOT actual Notional V1 storage).
 */
contract Baseline {
    // slot 0
    address public owner;
    // slot 1
    bool public paused;
    uint96 public unusedGap; // packed with paused conceptually — actually separate for clarity
    // slot 2
    mapping(address => uint256) public balances;
    // slot 3
    uint256 public totalSupply;
}
