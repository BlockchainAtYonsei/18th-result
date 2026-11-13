// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/// Minimal 0.6 mirror of uint128(abs) truncation (same semantics as V1)
library Cast06 {
    function unsafeAbsToUint128(int256 balance) internal pure returns (uint128) {
        int256 a = balance < 0 ? -balance : balance;
        return uint128(uint256(a));
    }
}

contract Cast06Demo {
    function unsafeCast(int256 balance) external pure returns (uint128) {
        return Cast06.unsafeAbsToUint128(balance);
    }
}
