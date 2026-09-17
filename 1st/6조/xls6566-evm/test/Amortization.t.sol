// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Amortization} from "../src/libraries/Amortization.sol";

contract AmortHarness {
    function periodicRate(uint256 annualRateWad, uint256 interval) external pure returns (uint256) {
        return Amortization.periodicRate(annualRateWad, interval);
    }

    function factor(uint256 r, uint256 n) external pure returns (uint256) {
        return Amortization.factor(r, n);
    }

    function periodicPayment(uint256 p, uint256 r, uint256 n) external pure returns (uint256) {
        return Amortization.periodicPayment(p, r, n);
    }

    function paymentBreakdown(uint256 p, uint256 pay, uint256 r)
        external
        pure
        returns (uint256 principalPortion, uint256 interest)
    {
        return Amortization.paymentBreakdown(p, pay, r);
    }

    function principalFromPeriodic(uint256 pay, uint256 r, uint256 n) external pure returns (uint256) {
        return Amortization.principalFromPeriodic(pay, r, n);
    }

    function fromTenthBps(uint256 raw) external pure returns (uint256) {
        return Amortization.fromTenthBps(raw);
    }

    function latePeriodicRate(uint256 lateAnnual, uint256 secondsOverdue) external pure returns (uint256) {
        return Amortization.latePeriodicRate(lateAnnual, secondsOverdue);
    }

    function latePaymentInterest(uint256 p, uint256 lr, uint256 fee)
        external
        pure
        returns (uint256 gross, uint256 mgmtFee, uint256 net)
    {
        return Amortization.latePaymentInterest(p, lr, fee);
    }

    function overpaymentBreakdown(uint256 amt, uint256 rate, uint256 feeRate, uint256 mgmt)
        external
        pure
        returns (uint256 interestNet, uint256 mgmtFee, uint256 fee, uint256 principalPortion)
    {
        return Amortization.overpaymentBreakdown(amt, rate, feeRate, mgmt);
    }

    function accruedInterest(uint256 p, uint256 r, uint256 since, uint256 interval)
        external
        pure
        returns (uint256)
    {
        return Amortization.accruedInterest(p, r, since, interval);
    }

    function prepaymentPenalty(uint256 p, uint256 closeRate) external pure returns (uint256) {
        return Amortization.prepaymentPenalty(p, closeRate);
    }

    function earlyFullRepayment(uint256 p, uint256 accrued, uint256 penalty, uint256 closeFee, uint256 netInt)
        external
        pure
        returns (uint256 totalDue, int256 valueChange)
    {
        return Amortization.earlyFullRepayment(p, accrued, penalty, closeFee, netInt);
    }
}

contract AmortizationTest is Test {
    uint256 constant WAD = 1e18;
    AmortHarness h;

    function setUp() public {
        h = new AmortHarness();
    }

    function test_fromTenthBps_bounds() public view {
        assertEq(h.fromTenthBps(100_000), 1e18, "100000 tenth-bps == 100%");
        assertEq(h.fromTenthBps(10_000), 1e17, "10000 tenth-bps == 10%");
        assertEq(h.fromTenthBps(0), 0);
    }

    function test_periodicRate_monthly() public view {
        uint256 r = h.periodicRate(12e16, Amortization.SECONDS_PER_YEAR / 12);
        assertEq(r, 1e16, "1% per month");
    }

    function test_periodicPayment_knownValue() public view {
        uint256 pay = h.periodicPayment(10_000 * WAD, 1e16, 12);
        assertApproxEqAbs(pay, 888_487_887_960_000_000_000, 1e14, "annuity payment");
    }

    function test_factor_knownValue() public view {
        uint256 f = h.factor(1e16, 12);
        assertApproxEqAbs(f, 88_848_787_960_000_000, 1e11, "annuity factor");
    }

    function test_periodicPayment_zeroInterest() public view {
        uint256 pay = h.periodicPayment(1200 * WAD, 0, 12);
        assertEq(pay, 100 * WAD, "flat principal / n");
    }

    function test_periodicPayment_singlePayment() public view {
        uint256 pay = h.periodicPayment(1000 * WAD, 5e16, 1);
        assertApproxEqAbs(pay, 1050 * WAD, 1e9, "single payment = principal + interest");
    }

    function test_factor_revertsOnZeroRate() public {
        vm.expectRevert(Amortization.ZeroPeriodicRate.selector);
        h.factor(0, 12);
    }

    function test_factor_revertsOnZeroPayments() public {
        vm.expectRevert(Amortization.ZeroPayments.selector);
        h.factor(1e16, 0);
    }

    function test_paymentBreakdown_revertsWhenPaymentBelowInterest() public {
        vm.expectRevert(Amortization.PaymentBelowInterest.selector);
        h.paymentBreakdown(1000 * WAD, 50 * WAD, 1e17);
    }

    function testFuzz_principalRoundTrip(uint256 principal, uint256 rate, uint256 n) public view {
        principal = bound(principal, 1 * WAD, 1e12 * WAD);
        rate = bound(rate, 1e12, 5e16);
        n = bound(n, 1, 120);

        uint256 pay = h.periodicPayment(principal, rate, n);
        vm.assume(pay > 0);
        uint256 recovered = h.principalFromPeriodic(pay, rate, n);

        assertApproxEqRel(recovered, principal, 1e12, "round trip");
    }

    function testFuzz_scheduleFullyAmortizes(uint256 principal, uint256 rate, uint256 n) public view {
        principal = bound(principal, 1 * WAD, 1e12 * WAD);
        rate = bound(rate, 1e12, 5e16);
        n = bound(n, 1, 120);

        uint256 pay = h.periodicPayment(principal, rate, n);
        vm.assume(pay > 0);

        uint256 remaining = principal;
        for (uint256 i = 0; i < n; i++) {
            (uint256 principalPortion, uint256 interest) = h.paymentBreakdown(remaining, pay, rate);
            interest;
            if (principalPortion > remaining) {
                remaining = 0;
            } else {
                remaining -= principalPortion;
            }
        }

        assertApproxEqRel(principal - remaining, principal, 1e12, "schedule amortizes to ~0");
    }

    function test_latePaymentInterest_split() public view {
        (uint256 gross, uint256 mgmtFee, uint256 net) =
            h.latePaymentInterest(1000 * WAD, 2e16, 1e17);
        assertEq(gross, 20 * WAD, "gross");
        assertEq(mgmtFee, 2 * WAD, "mgmt fee");
        assertEq(net, 18 * WAD, "net == valueChange");
    }

    function test_overpaymentBreakdown() public view {
        (uint256 interestNet, uint256 mgmtFee, uint256 fee, uint256 principalPortion) =
            h.overpaymentBreakdown(1000 * WAD, 5e16, 1e16, 1e17);
        assertEq(mgmtFee, 5 * WAD, "mgmt = 50*10%");
        assertEq(interestNet, 45 * WAD, "net interest = 50-5");
        assertEq(fee, 10 * WAD, "overpayment fee = 1%");
        assertEq(principalPortion, 940 * WAD, "principal = 1000-45-5-10");
    }

    function test_accruedInterest_halfPeriod() public view {
        uint256 interval = 2_628_000;
        uint256 accrued = h.accruedInterest(1000 * WAD, 1e16, interval / 2, interval);
        assertApproxEqAbs(accrued, 5 * WAD, 1e6, "half-period interest");
    }

    function test_prepaymentPenalty() public view {
        assertEq(h.prepaymentPenalty(1000 * WAD, 3e16), 30 * WAD, "3% penalty");
    }

    function test_earlyFullRepayment_negativeValueChange() public view {
        (uint256 totalDue, int256 valueChange) =
            h.earlyFullRepayment(1000 * WAD, 5 * WAD, 30 * WAD, 2 * WAD, 40 * WAD);
        assertEq(totalDue, 1037 * WAD, "principal + accrued + penalty + fee");
        assertEq(valueChange, -5 * int256(WAD), "(5+30) - 40 = -5");
    }

    function testFuzz_zeroInterestExact(uint256 principal, uint256 n) public view {
        n = bound(n, 1, 240);
        principal = bound(principal, n * WAD, 1e12 * WAD);

        uint256 pay = h.periodicPayment(principal, 0, n);
        (uint256 principalPortion, uint256 interest) = h.paymentBreakdown(principal, pay, 0);

        assertEq(interest, 0, "no interest");
        assertEq(principalPortion, pay, "all principal");
        assertLe(pay * n, principal, "no over-amortization");
        assertLt(principal - pay * n, n, "remainder below n");
    }
}
