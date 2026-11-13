// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Restricted/halt variant that PRESERVES layout (append-only after existing fields).
 * Label: 최소 예제 — layout-preserving upgrade candidate.
 * OZ guidance: do not change order/type of existing vars; append new vars.
 * https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable#modifying-your-contracts
 */
contract Restricted {
    address public owner;
    bool public paused;
    uint96 public unusedGap;
    mapping(address => uint256) public balances;
    uint256 public totalSupply;
    // appended — does not shift prior slots
    bool public halted;
    address public rescueReceiver;
}
