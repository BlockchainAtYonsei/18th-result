// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {DemoDeploymentFactory} from "../src/DemoDeploymentFactory.sol";
import {RevenueBridge} from "../src/RevenueBridge.sol";
import {RevenueBridgeDeployer} from "../src/RevenueBridgeDeployer.sol";
import {RevenueRightToken} from "../src/RevenueRightToken.sol";
import {RevenueRightTokenFactory} from "../src/RevenueRightTokenFactory.sol";
import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

contract DemoDeploymentFactoryTest is Test {
    address internal owner = makeAddr("owner");
    address internal issuer = makeAddr("issuer");
    address internal settler = makeAddr("settler");
    address internal creator = makeAddr("creator");
    address internal investor = makeAddr("investor");

    MockSettlementToken internal initialToken;
    RevenueBridge internal initialBridge;
    DemoDeploymentFactory internal factory;

    function setUp() public {
        initialToken = new MockSettlementToken();
        RevenueRightTokenFactory rightTokenFactory = new RevenueRightTokenFactory();
        RevenueBridgeDeployer bridgeDeployer = new RevenueBridgeDeployer(rightTokenFactory);
        initialBridge = new RevenueBridge(initialToken, owner, "https://example.test/{id}.json", rightTokenFactory);
        factory = new DemoDeploymentFactory(
            owner,
            bridgeDeployer,
            DemoDeploymentFactory.DemoConfig({
                admin: owner,
                issuer: issuer,
                settler: settler,
                creator: creator,
                investor: investor,
                tokenBaseUri: "https://example.test/{id}.json"
            }),
            address(initialToken),
            address(initialBridge),
            address(initialBridge.REVENUE_RIGHT_TOKEN())
        );
    }

    function testOwnerCanReplaceAndSeedDemoDeployment() public {
        vm.prank(owner);
        DemoDeploymentFactory.Deployment memory deployment = factory.resetDemo();

        assertEq(deployment.version, 2);
        assertTrue(deployment.settlementToken != address(initialToken));
        assertTrue(deployment.revenueBridge != address(initialBridge));

        RevenueBridge bridge = RevenueBridge(deployment.revenueBridge);
        MockSettlementToken token = MockSettlementToken(deployment.settlementToken);
        RevenueRightToken rightToken = RevenueRightToken(deployment.revenueRightToken);
        assertEq(bridge.nextOfferingId(), 4);
        assertEq(address(bridge.SETTLEMENT_TOKEN()), address(token));
        assertEq(address(bridge.REVENUE_RIGHT_TOKEN()), address(rightToken));
        assertEq(rightToken.CONTROLLER(), address(bridge));
        assertEq(token.balanceOf(investor), 1_000_000e6);
        assertEq(token.balanceOf(settler), 1_000_000e6);
        assertTrue(bridge.allowedInvestors(investor));
        assertTrue(bridge.hasRole(bridge.DEFAULT_ADMIN_ROLE(), owner));
        assertTrue(bridge.hasRole(bridge.ISSUER_ROLE(), issuer));
        assertTrue(bridge.hasRole(bridge.SETTLER_ROLE(), settler));
        assertFalse(bridge.hasRole(bridge.DEFAULT_ADMIN_ROLE(), address(factory)));
        assertFalse(bridge.hasRole(bridge.ISSUER_ROLE(), address(factory)));
        assertFalse(bridge.hasRole(bridge.SETTLER_ROLE(), address(factory)));

        DemoDeploymentFactory.Deployment memory active = factory.activeDeployment();
        assertEq(active.version, 2);
        assertEq(active.revenueBridge, deployment.revenueBridge);
    }

    function testNonOwnerCannotResetDemo() public {
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("OwnableUnauthorizedAccount(address)")), investor));
        vm.prank(investor);
        factory.resetDemo();
    }
}
