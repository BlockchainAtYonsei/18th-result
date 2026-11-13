// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CastingHelper
 * @notice Minimal mirror of Notional V1 ExchangeRate pattern:
 *         uint128 absBalance = uint128(balance.abs());
 * V1 source uses pragma ^0.6.0 and SafeInt256.abs(); this 0.8 helper
 * reproduces the same explicit downcast truncation semantics.
 * Explicit casts still truncate in 0.8.x (arithmetic overflow checks
 * do not cover narrowing casts).
 */
library CastingHelper {
    /// @dev Like SafeInt256.abs then uint128 cast (V1 unsafe path)
    function unsafeAbsToUint128(int256 balance) internal pure returns (uint128) {
        uint256 absBalance = balance < 0 ? uint256(-balance) : uint256(balance);
        return uint128(absBalance); // truncates high bits if absBalance > type(uint128).max
    }

    /// @dev Range check then cast (safe path without OZ dependency in library)
    function safeAbsToUint128(int256 balance) internal pure returns (uint128) {
        require(balance != type(int256).min, "abs overflow");
        uint256 absBalance = balance < 0 ? uint256(-balance) : uint256(balance);
        require(absBalance <= type(uint128).max, "SafeCast: value doesn't fit in 128 bits");
        return uint128(absBalance);
    }

    /// @dev Sum of two int256 values then unsafe abs->uint128 (debt sum case)
    function unsafeSumAbsToUint128(int256 a, int256 b) internal pure returns (uint128) {
        // Plan case: absolutes of -1 and -(2^128-1) sum to 2^128 then cast.
        // We model summing the *absolute magnitudes* then casting, matching
        // the analysis abstract (not reconstructing the full attack path).
        uint256 absA = a < 0 ? uint256(-a) : uint256(a);
        uint256 absB = b < 0 ? uint256(-b) : uint256(b);
        uint256 sumAbs = absA + absB;
        return uint128(sumAbs);
    }

    function safeSumAbsToUint128(int256 a, int256 b) internal pure returns (uint128) {
        uint256 absA = a < 0 ? uint256(-a) : uint256(a);
        uint256 absB = b < 0 ? uint256(-b) : uint256(b);
        uint256 sumAbs = absA + absB;
        require(sumAbs <= type(uint128).max, "SafeCast: value doesn't fit in 128 bits");
        return uint128(sumAbs);
    }
}

contract CastingDemo {
    function unsafeCast(int256 balance) external pure returns (uint128) {
        return CastingHelper.unsafeAbsToUint128(balance);
    }

    function safeCast(int256 balance) external pure returns (uint128) {
        return CastingHelper.safeAbsToUint128(balance);
    }

    function unsafeSumCast(int256 a, int256 b) external pure returns (uint128) {
        return CastingHelper.unsafeSumAbsToUint128(a, b);
    }

    function safeSumCast(int256 a, int256 b) external pure returns (uint128) {
        return CastingHelper.safeSumAbsToUint128(a, b);
    }
}
