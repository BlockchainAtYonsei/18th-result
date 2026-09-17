// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {LoanBroker} from "../src/LoanBroker.sol";
import {LoanBrokerHarness} from "../src/LoanBrokerHarness.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}
    function mint(address to, uint256 a) external { _mint(to, a); }
}

/// @notice Tests for the §4.2 LoanBroker harness: ① concentration, ② recovery timelock,
///         ③ history-linked cover rate. Harness is enabled in setUp.
contract HarnessTest is Test {
    uint256 constant UNIT = 1e18;
    bytes32 constant TYPEHASH = keccak256(
        "LoanTerms(address borrower,uint256 principal,uint256 interestRate,uint256 lateInterestRate,uint256 closeInterestRate,uint32 paymentInterval,uint32 gracePeriod,uint32 paymentsTotal,uint256 loanServiceFee,uint256 latePaymentFee,uint256 closePaymentFee,uint256 originationFee,uint256 nonce,uint256 deadline)"
    );

    MockERC20 asset;
    Vault vault;
    LoanBroker broker;

    address admin = address(this);
    address ownerOp = address(0x0BEE);
    address depositor = address(0xD3);
    uint256 pkA = 0xA11CE;
    uint256 pkB = 0xB0B;
    address borA;
    address borB;

    uint256 constant ALPHA = 5e17; // 50%
    uint256 constant ALPHA_B = 5e17; // 50%
    uint256 constant DEBT_FLOOR = 20_000 * UNIT;
    uint256 constant LOCK = 100; // seconds
    uint256 constant LAMBDA = 1e18; // 1.0

    function setUp() public {
        borA = vm.addr(pkA);
        borB = vm.addr(pkB);
        asset = new MockERC20();
        vault = new Vault(IERC20(address(asset)), "V", "V", admin, false, 0, 6);
        broker = new LoanBroker(vault, ownerOp, 0, 1_000, 10_000, 100_000, 10_000);
        vault.grantRole(vault.PROTOCOL_ROLE(), address(broker));

        asset.mint(depositor, 1_000_000 * UNIT);
        vm.startPrank(depositor);
        asset.approve(address(vault), type(uint256).max);
        vault.deposit(500_000 * UNIT, depositor);
        vm.stopPrank();

        asset.mint(ownerOp, 100_000 * UNIT);
        vm.startPrank(ownerOp);
        asset.approve(address(broker), type(uint256).max);
        broker.coverDeposit(50_000 * UNIT);
        vm.stopPrank();

        asset.mint(borA, 100_000 * UNIT);
        asset.mint(borB, 100_000 * UNIT);
        vm.prank(borA); asset.approve(address(broker), type(uint256).max);
        vm.prank(borB); asset.approve(address(broker), type(uint256).max);

        vm.prank(ownerOp);
        broker.initHarness(true, ALPHA, ALPHA_B, DEBT_FLOOR, LOCK, LAMBDA);
    }

    function _terms(uint256 pk, address borrower, uint256 principal, uint256 interest)
        internal view returns (LoanBroker.LoanTerms memory t)
    {
        t = LoanBroker.LoanTerms({
            borrower: borrower, principal: principal, interestRate: interest, lateInterestRate: 0,
            closeInterestRate: 0, paymentInterval: 40, gracePeriod: 20, paymentsTotal: 2,
            loanServiceFee: 0, latePaymentFee: 0, closePaymentFee: 0, originationFee: 0,
            nonce: broker.nonces(borrower), deadline: block.timestamp + 1 days
        });
        pk;
    }

    function _sign(uint256 pk, LoanBroker.LoanTerms memory t) internal view returns (bytes memory) {
        bytes32 sh = keccak256(abi.encode(TYPEHASH, t.borrower, t.principal, t.interestRate,
            t.lateInterestRate, t.closeInterestRate, t.paymentInterval, t.gracePeriod, t.paymentsTotal,
            t.loanServiceFee, t.latePaymentFee, t.closePaymentFee, t.originationFee, t.nonce, t.deadline));
        bytes32 ds = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("XLS66-LoanBroker")), keccak256(bytes("1")), block.chainid, address(broker)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", ds, sh)));
        return abi.encodePacked(r, s, v);
    }

    function _originate(uint256 pk, address borrower, uint256 principal) internal returns (uint256 id) {
        LoanBroker.LoanTerms memory t = _terms(pk, borrower, principal, 0);
        bytes memory sig = _sign(pk, t);
        vm.prank(ownerOp);
        id = broker.originate(t, sig);
    }

    function test_concentration_oversizedLoanReverts() public {
        LoanBroker.LoanTerms memory t = _terms(pkA, borA, 15_000 * UNIT, 0);
        bytes memory sig = _sign(pkA, t);
        vm.prank(ownerOp);
        vm.expectPartialRevert(LoanBrokerHarness.ConcentrationExceeded.selector);
        broker.originate(t, sig);
    }

    function test_concentration_withinCapPasses() public {
        uint256 id = _originate(pkA, borA, 8_000 * UNIT);
        assertEq(broker.getLoan(id).principalOutstanding, 8_000 * UNIT);
        assertEq(broker.borrowerDebt(borA), 8_000 * UNIT);
    }

    function test_borrowerConcentration_reverts() public {
        _originate(pkA, borA, 8_000 * UNIT);
        LoanBroker.LoanTerms memory t = _terms(pkA, borA, 8_000 * UNIT, 0);
        bytes memory sig = _sign(pkA, t);
        vm.prank(ownerOp);
        vm.expectPartialRevert(LoanBrokerHarness.BorrowerConcentrationExceeded.selector);
        broker.originate(t, sig);
    }

    function test_recoveryTimelock_blocksThenReleases() public {
        uint256 id = _originate(pkA, borA, 10_000 * UNIT);
        LoanBroker.Loan memory l = broker.getLoan(id);
        vm.warp(uint256(l.nextPaymentDueDate) + l.gracePeriod + 1);
        vm.prank(ownerOp);
        broker.default_(id);

        uint256 locked = broker.lockedCover();
        assertGt(locked, 0, "cover locked after default");
        uint256 withdrawable = broker.coverWithdrawable();

        vm.prank(ownerOp);
        vm.expectPartialRevert(LoanBrokerHarness.CoverLockedByTimelock.selector);
        broker.coverWithdraw(withdrawable + 1);

        vm.warp(block.timestamp + LOCK + 1);
        assertEq(broker.lockedCover(), 0, "lock released");
        assertGt(broker.coverWithdrawable(), withdrawable, "more withdrawable after release");
    }

    function test_historyLinkedCRM_risesWithDefaults() public {
        assertEq(broker.effectiveCoverRateMinimum(), 1e17, "baseline 10%");

        _originate(pkA, borA, 10_000 * UNIT);
        uint256 id2 = _originate(pkB, borB, 10_000 * UNIT);
        LoanBroker.Loan memory l = broker.getLoan(id2);
        vm.warp(uint256(l.nextPaymentDueDate) + l.gracePeriod + 1);
        vm.prank(ownerOp);
        broker.default_(id2);

        assertApproxEqAbs(broker.defaultRateWad(), 5e17, 1e12, "default rate ~50%");
        assertApproxEqAbs(broker.effectiveCoverRateMinimum(), 6e17, 1e12, "effective CRM ~60%");
    }

    function test_initHarness_writeOnce() public {
        vm.prank(ownerOp);
        vm.expectRevert(LoanBrokerHarness.HarnessAlreadyInitialized.selector);
        broker.initHarness(true, ALPHA, ALPHA_B, DEBT_FLOOR, LOCK, LAMBDA);
    }
}
