// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {DeployBaseSepolia} from "../script/DeployBaseSepolia.s.sol";
import {DemoDeploymentFactory} from "../src/DemoDeploymentFactory.sol";
import {RevenueBridge} from "../src/RevenueBridge.sol";
import {RevenueRightToken} from "../src/RevenueRightToken.sol";
import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

contract DeployBaseSepoliaTest is Test {
    uint256 internal constant DEPLOYER_PRIVATE_KEY = 0xB453;
    string internal deploymentPath;

    address internal admin = makeAddr("base-sepolia-admin");
    address internal issuer = makeAddr("base-sepolia-issuer");
    address internal settler = makeAddr("base-sepolia-settler");

    function setUp() public {
        vm.chainId(84_532);
        deploymentPath = string.concat(vm.projectRoot(), "/cache/test-base-sepolia-deployment.json");
    }

    function testDeploysMockTokenAndTransfersOperationalRoles() public {
        DeployBaseSepolia script = new DeployBaseSepolia();
        (, RevenueBridge bridge, RevenueRightToken rightToken) =
            script.runWithConfig(_config(address(0), deploymentPath));

        address deployer = vm.addr(DEPLOYER_PRIVATE_KEY);
        assertFalse(bridge.hasRole(bridge.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(bridge.hasRole(bridge.ISSUER_ROLE(), deployer));
        assertFalse(bridge.hasRole(bridge.SETTLER_ROLE(), deployer));
        assertTrue(bridge.hasRole(bridge.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(bridge.hasRole(bridge.ISSUER_ROLE(), issuer));
        assertTrue(bridge.hasRole(bridge.SETTLER_ROLE(), settler));
        assertEq(rightToken.CONTROLLER(), address(bridge));
        assertEq(rightToken.uri(1), "https://example.test/revenue-rights/{id}.json");

        string memory deploymentJson = vm.readFile(deploymentPath);
        assertEq(vm.parseJsonUint(deploymentJson, ".chainId"), 84_532);
        assertEq(vm.parseJsonString(deploymentJson, ".network"), "base-sepolia");
        assertEq(vm.parseJsonString(deploymentJson, ".tokenBaseUri"), "https://example.test/revenue-rights/{id}.json");
        assertEq(vm.parseJsonAddress(deploymentJson, ".deployer"), deployer);
        assertTrue(vm.parseJsonBool(deploymentJson, ".usesMockSettlementToken"));
        assertEq(vm.parseJsonAddress(deploymentJson, ".contracts.revenueBridge"), address(bridge));
        assertEq(vm.parseJsonAddress(deploymentJson, ".contracts.revenueRightToken"), address(rightToken));
        address demoFactoryAddress = vm.parseJsonAddress(deploymentJson, ".contracts.demoFactory");
        DemoDeploymentFactory.Deployment memory active = DemoDeploymentFactory(demoFactoryAddress).activeDeployment();
        assertEq(active.revenueBridge, address(bridge));
        assertEq(vm.parseJsonAddress(deploymentJson, ".roles.admin"), admin);
        assertEq(vm.parseJsonAddress(deploymentJson, ".roles.issuer"), issuer);
        assertEq(vm.parseJsonAddress(deploymentJson, ".roles.settler"), settler);
    }

    function testRunLoadsEnvironmentConfiguration() public {
        string memory environmentDeploymentPath =
            string.concat(vm.projectRoot(), "/cache/test-base-sepolia-environment.json");
        vm.setEnv("BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY", vm.toString(DEPLOYER_PRIVATE_KEY));
        vm.setEnv("BASE_SEPOLIA_ADMIN_ADDRESS", vm.toString(admin));
        vm.setEnv("BASE_SEPOLIA_ISSUER_ADDRESS", vm.toString(issuer));
        vm.setEnv("BASE_SEPOLIA_SETTLER_ADDRESS", vm.toString(settler));
        vm.setEnv("BASE_SEPOLIA_SETTLEMENT_TOKEN_ADDRESS", vm.toString(address(0)));
        vm.setEnv("BASE_SEPOLIA_TOKEN_BASE_URI", "https://example.test/revenue-rights/{id}.json");
        vm.setEnv("BASE_SEPOLIA_DEPLOYMENT_PATH", environmentDeploymentPath);
        vm.setEnv("BASE_SEPOLIA_WRITE_MANIFEST", "true");

        DeployBaseSepolia script = new DeployBaseSepolia();
        (, RevenueBridge bridge,) = script.run();

        assertTrue(bridge.hasRole(bridge.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(bridge.hasRole(bridge.ISSUER_ROLE(), issuer));
        assertTrue(bridge.hasRole(bridge.SETTLER_ROLE(), settler));
        string memory deploymentJson = vm.readFile(environmentDeploymentPath);
        assertEq(vm.parseJsonUint(deploymentJson, ".chainId"), 84_532);
        assertTrue(vm.parseJsonBool(deploymentJson, ".usesMockSettlementToken"));
    }

    function testUsesConfiguredSettlementToken() public {
        MockSettlementToken settlementToken = new MockSettlementToken();
        string memory existingTokenDeploymentPath =
            string.concat(vm.projectRoot(), "/cache/test-base-sepolia-existing-token.json");

        DeployBaseSepolia script = new DeployBaseSepolia();
        (, RevenueBridge bridge,) = script.runWithConfig(_config(address(settlementToken), existingTokenDeploymentPath));

        assertEq(address(bridge.SETTLEMENT_TOKEN()), address(settlementToken));
        string memory deploymentJson = vm.readFile(existingTokenDeploymentPath);
        assertFalse(vm.parseJsonBool(deploymentJson, ".usesMockSettlementToken"));
        assertEq(vm.parseJsonAddress(deploymentJson, ".contracts.settlementToken"), address(settlementToken));
    }

    function testRejectsAddressWithoutSettlementTokenCode() public {
        address missingToken = makeAddr("missing-token");

        DeployBaseSepolia script = new DeployBaseSepolia();
        vm.expectRevert(abi.encodeWithSelector(DeployBaseSepolia.SettlementTokenHasNoCode.selector, missingToken));
        script.runWithConfig(_config(missingToken, deploymentPath));
    }

    function testRejectsNonBaseSepoliaChain() public {
        vm.chainId(1);
        DeployBaseSepolia script = new DeployBaseSepolia();

        vm.expectRevert(abi.encodeWithSelector(DeployBaseSepolia.UnsupportedChain.selector, 1));
        script.runWithConfig(_config(address(0), deploymentPath));
    }

    function _config(address settlementToken, string memory manifestPath)
        private
        view
        returns (DeployBaseSepolia.DeploymentConfig memory config)
    {
        config = DeployBaseSepolia.DeploymentConfig({
            deployerPrivateKey: DEPLOYER_PRIVATE_KEY,
            deployer: vm.addr(DEPLOYER_PRIVATE_KEY),
            admin: admin,
            issuer: issuer,
            settler: settler,
            configuredSettlementToken: settlementToken,
            tokenBaseUri: "https://example.test/revenue-rights/{id}.json",
            deploymentPath: manifestPath,
            writeManifest: true
        });
    }
}
