// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract ExecutionTarget {
    uint256 public receivedValue;
    bytes32 public receivedMessageHash;

    event Called(address indexed caller, uint256 value, string message);

    function record(string calldata message) external payable returns (bytes32 messageHash) {
        messageHash = keccak256(bytes(message));
        receivedValue += msg.value;
        receivedMessageHash = messageHash;

        emit Called(msg.sender, msg.value, message);
    }

    function fail() external payable {
        revert("ExecutionTarget: failed");
    }
}
