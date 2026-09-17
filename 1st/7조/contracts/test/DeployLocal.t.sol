// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {DeployLocal} from "../script/DeployLocal.s.sol";
import {DemoDeploymentFactory} from "../src/DemoDeploymentFactory.sol";
import {RevenueBridge} from "../src/RevenueBridge.sol";
import {RevenueRightToken} from "../src/RevenueRightToken.sol";
import {IRevenueBridge} from "../src/interfaces/IRevenueBridge.sol";
import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

contract DeployLocalTest is Test {
    uint256 internal constant DEPLOYER_PRIVATE_KEY = 0xA11CE;
    uint256 internal constant INVESTOR_BALANCE = 25_000e6;
    uint256 internal constant SETTLER_BALANCE = 50_000e6;

    address internal issuer = makeAddr("issuer");
    address internal settler = makeAddr("settler");
    address internal creator = makeAddr("creator");
    address internal investor = makeAddr("investor");

    function setUp() public {
        vm.chainId(31_337);
        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(DEPLOYER_PRIVATE_KEY));
        vm.setEnv("LOCAL_ISSUER_ADDRESS", vm.toString(issuer));
        vm.setEnv("LOCAL_SETTLER_ADDRESS", vm.toString(settler));
        vm.setEnv("LOCAL_CREATOR_ADDRESS", vm.toString(creator));
        vm.setEnv("LOCAL_INVESTOR_ADDRESS", vm.toString(investor));
        vm.setEnv("LOCAL_INVESTOR_BALANCE", vm.toString(INVESTOR_BALANCE));
        vm.setEnv("LOCAL_SETTLER_BALANCE", vm.toString(SETTLER_BALANCE));
        vm.setEnv("LOCAL_TOKEN_BASE_URI", "http://localhost/token/{id}.json");
        vm.setEnv("LOCAL_DEPLOYMENT_PATH", string.concat(vm.projectRoot(), "/cache/test-deployment.json"));
    }

    function testDeploysAndSeedsLocalEnvironment() public {
        DeployLocal script = new DeployLocal();
        (
            MockSettlementToken settlementToken,
            RevenueBridge bridge,
            RevenueRightToken rightToken,
            uint256 demoOfferingId
        ) = script.run();

        address deployer = vm.addr(DEPLOYER_PRIVATE_KEY);
        assertTrue(bridge.hasRole(bridge.DEFAULT_ADMIN_ROLE(), deployer));
        assertTrue(bridge.hasRole(bridge.ISSUER_ROLE(), deployer));
        assertTrue(bridge.hasRole(bridge.SETTLER_ROLE(), deployer));
        assertTrue(bridge.hasRole(bridge.ISSUER_ROLE(), issuer));
        assertTrue(bridge.hasRole(bridge.SETTLER_ROLE(), settler));
        assertTrue(bridge.allowedInvestors(investor));
        assertEq(settlementToken.balanceOf(investor), INVESTOR_BALANCE);
        assertEq(settlementToken.balanceOf(settler), SETTLER_BALANCE);
        assertEq(address(bridge.SETTLEMENT_TOKEN()), address(settlementToken));
        assertEq(address(bridge.REVENUE_RIGHT_TOKEN()), address(rightToken));
        assertEq(rightToken.CONTROLLER(), address(bridge));
        assertEq(rightToken.uri(1), "http://localhost/token/{id}.json");

        IRevenueBridge.Offering memory offering = bridge.getOffering(demoOfferingId);
        assertEq(demoOfferingId, 1);
        assertEq(uint256(offering.status), uint256(IRevenueBridge.OfferingStatus.Funding));
        assertEq(offering.creatorPayout, creator);
        assertEq(offering.assetKey, keccak256("demo-studio-aurora-2026"));
        assertEq(offering.termsHash, keccak256("local-demo-terms-v1"));
        assertEq(offering.valuationHash, keccak256("local-demo-valuation-v1"));
        assertEq(offering.unitsForSale, 100);
        assertEq(offering.unitPrice, 100e6);
        assertEq(offering.revenueShareBps, 2_000);
        assertEq(bridge.targetRaise(demoOfferingId), 10_000e6);
        assertEq(bridge.nextOfferingId(), 4);

        IRevenueBridge.Offering memory secondOffering = bridge.getOffering(2);
        assertEq(secondOffering.unitsForSale, 200);
        assertEq(secondOffering.unitPrice, 50e6);
        assertEq(secondOffering.revenueShareBps, 1_500);

        IRevenueBridge.Offering memory instantOffering = bridge.getOffering(3);
        assertEq(instantOffering.unitsForSale, 10);
        assertEq(instantOffering.unitPrice, 1e6);
        assertEq(instantOffering.revenueShareBps, 1_000);
        assertEq(instantOffering.fundingDeadline, block.timestamp + 10 minutes);
        assertEq(instantOffering.revenueStart, instantOffering.fundingDeadline + 1 minutes);
        assertEq(instantOffering.revenueEnd, instantOffering.revenueStart + 3 minutes);

        uint64[] memory periodEnds = bridge.getPeriodEnds(demoOfferingId);
        assertEq(periodEnds.length, 3);
        assertEq(periodEnds[0], offering.revenueStart + 30 days);
        assertEq(periodEnds[1], offering.revenueStart + 60 days);
        assertEq(periodEnds[2], offering.revenueEnd);

        string memory deploymentJson = vm.readFile(string.concat(vm.projectRoot(), "/cache/test-deployment.json"));
        assertEq(vm.parseJsonUint(deploymentJson, ".chainId"), 31_337);
        assertEq(vm.parseJsonAddress(deploymentJson, ".contracts.settlementToken"), address(settlementToken));
        assertEq(vm.parseJsonAddress(deploymentJson, ".contracts.revenueBridge"), address(bridge));
        assertEq(vm.parseJsonAddress(deploymentJson, ".contracts.revenueRightToken"), address(rightToken));
        address demoFactoryAddress = vm.parseJsonAddress(deploymentJson, ".contracts.demoFactory");
        DemoDeploymentFactory.Deployment memory active = DemoDeploymentFactory(demoFactoryAddress).activeDeployment();
        assertEq(active.revenueBridge, address(bridge));
        assertEq(active.version, 1);
        assertEq(vm.parseJsonAddress(deploymentJson, ".accounts.creator"), creator);
        assertEq(vm.parseJsonAddress(deploymentJson, ".accounts.investor"), investor);
        assertEq(vm.parseJsonUint(deploymentJson, ".demo.offeringId"), demoOfferingId);
        assertEq(vm.parseJsonUint(deploymentJson, ".demo.targetRaise"), 10_000e6);
    }

    function testRejectsNonLocalChain() public {
        vm.chainId(1);
        DeployLocal script = new DeployLocal();

        vm.expectRevert(abi.encodeWithSelector(DeployLocal.UnsupportedChain.selector, 1));
        script.run();
    }
}
