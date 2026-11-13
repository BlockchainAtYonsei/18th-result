// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CastingHelper, CastingDemo} from "../src/CastingHelper.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * Boundary tests for uint128(abs(int256)) truncation pattern
 * found in Notional V1 ExchangeRate.sol (_convertToETH / _convertETHTo).
 * Abstract numeric cases only — does NOT reconstruct any attack path.
 */
contract CastingBoundaryTest is Test {
    using SafeCast for uint256;

    CastingDemo demo;

    uint256 constant TWO_128 = 1 << 128;
    uint256 constant U128_MAX = type(uint128).max; // 2^128 - 1

    function setUp() public {
        demo = new CastingDemo();
    }

    function test_unsafe_zero() public pure {
        assertEq(CastingHelper.unsafeAbsToUint128(0), 0);
    }

    function test_unsafe_one() public pure {
        assertEq(CastingHelper.unsafeAbsToUint128(1), 1);
        assertEq(CastingHelper.unsafeAbsToUint128(-1), 1);
    }

    function test_unsafe_u128max_minus_one() public pure {
        // 2^128 - 2
        int256 v = int256(U128_MAX - 1);
        assertEq(CastingHelper.unsafeAbsToUint128(v), uint128(U128_MAX - 1));
        assertEq(CastingHelper.unsafeAbsToUint128(-v), uint128(U128_MAX - 1));
    }

    function test_unsafe_u128max() public pure {
        // 2^128 - 1
        int256 v = int256(U128_MAX);
        assertEq(CastingHelper.unsafeAbsToUint128(v), type(uint128).max);
        assertEq(CastingHelper.unsafeAbsToUint128(-v), type(uint128).max);
    }

    function test_unsafe_two128_truncates_to_zero() public view {
        // 2^128 cast to uint128 → 0
        int256 v = int256(TWO_128);
        uint128 got = demo.unsafeCast(v);
        assertEq(got, 0, "2^128 must truncate to 0");
        assertEq(demo.unsafeCast(-v), 0, "-2^128 abs must truncate to 0");
    }

    function test_unsafe_two128_plus_one_truncates_to_one() public view {
        int256 v = int256(TWO_128 + 1);
        assertEq(demo.unsafeCast(v), 1, "2^128+1 must truncate to 1");
        assertEq(demo.unsafeCast(-v), 1, "-(2^128+1) abs must truncate to 1");
    }

    function test_safe_in_range_ok() public pure {
        assertEq(CastingHelper.safeAbsToUint128(0), 0);
        assertEq(CastingHelper.safeAbsToUint128(1), 1);
        assertEq(CastingHelper.safeAbsToUint128(-1), 1);
        assertEq(CastingHelper.safeAbsToUint128(int256(U128_MAX)), type(uint128).max);
        assertEq(CastingHelper.safeAbsToUint128(-int256(U128_MAX)), type(uint128).max);
    }

    function test_safe_two128_reverts() public {
        int256 v = int256(TWO_128);
        vm.expectRevert(bytes("SafeCast: value doesn't fit in 128 bits"));
        demo.safeCast(v);
    }

    function test_safe_two128_plus_one_reverts() public {
        int256 v = int256(TWO_128 + 1);
        vm.expectRevert(bytes("SafeCast: value doesn't fit in 128 bits"));
        demo.safeCast(v);
    }

    function test_safe_neg_two128_reverts() public {
        int256 v = -int256(TWO_128);
        vm.expectRevert(bytes("SafeCast: value doesn't fit in 128 bits"));
        demo.safeCast(v);
    }

    function test_oz_safecast_two128_reverts() public {
        uint256 v = TWO_128;
        vm.expectRevert();
        this._ozToUint128(v);
    }

    function _ozToUint128(uint256 v) external pure returns (uint128) {
        return v.toUint128();
    }

    /// Sum of abs(-1) and abs(-(2^128-1)) = 2^128 → unsafe cast → 0
    function test_sum_case_unsafe_is_zero() public view {
        int256 a = -1;
        int256 b = -int256(U128_MAX); // -(2^128 - 1)
        uint128 got = demo.unsafeSumCast(a, b);
        assertEq(got, 0, "abs(-1)+abs(-(2^128-1))=2^128 truncates to 0");
    }

    function test_sum_case_safe_reverts() public {
        int256 a = -1;
        int256 b = -int256(U128_MAX);
        vm.expectRevert(bytes("SafeCast: value doesn't fit in 128 bits"));
        demo.safeSumCast(a, b);
    }

    /// Table helper: emit results for reporting
    function test_print_boundary_table() public {
        int256[6] memory positives = [
            int256(0),
            int256(1),
            int256(U128_MAX - 1),
            int256(U128_MAX),
            int256(TWO_128),
            int256(TWO_128 + 1)
        ];
        string[6] memory labels = [
            "0",
            "1",
            "2^128-2",
            "2^128-1",
            "2^128",
            "2^128+1"
        ];
        for (uint256 i = 0; i < positives.length; i++) {
            uint128 u = CastingHelper.unsafeAbsToUint128(positives[i]);
            bool safeOk;
            uint128 s;
            try this.externalSafe(positives[i]) returns (uint128 r) {
                safeOk = true;
                s = r;
            } catch {
                safeOk = false;
            }
            // forge -vv will show these asserts' context via logs:
            emit log_named_string("input", labels[i]);
            emit log_named_uint("unsafe", u);
            if (safeOk) emit log_named_uint("safe", s);
            else emit log_string("safe=REVERT");
        }
    }

    function externalSafe(int256 v) external pure returns (uint128) {
        return CastingHelper.safeAbsToUint128(v);
    }
}
