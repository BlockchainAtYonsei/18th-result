// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Broken variant: reorders fields and changes a type — layout UNSAFE.
 * Label: 최소 예제 — intentional mismatch.
 */
contract Broken {
    // REORDERED: paused before owner
    bool public paused;
    address public owner;
    // TYPE CHANGE: balances as uint128 mapping instead of uint256
    mapping(address => uint128) public balances;
    // REMOVED unusedGap / shifted totalSupply
    uint256 public totalSupply;
    bool public halted;
}
