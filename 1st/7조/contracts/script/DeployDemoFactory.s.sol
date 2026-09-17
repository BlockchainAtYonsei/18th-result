// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DemoDeploymentFactory} from "../src/DemoDeploymentFactory.sol";
import {RevenueBridgeDeployer} from "../src/RevenueBridgeDeployer.sol";
import {RevenueRightTokenFactory} from "../src/RevenueRightTokenFactory.sol";

/// @notice Adds a stable demo deployment entry point in front of an existing Base Sepolia deployment.
contract DeployDemoFactory is Script {
    error UnsupportedChain(uint256 chainId);
    error InvalidConfiguration();

    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    struct DeploymentConfig {
        uint256 privateKey;
        address deployer;
        address admin;
        address issuer;
        address settler;
        address creator;
        address investor;
        address settlementToken;
        address revenueBridge;
        address revenueRightToken;
        string tokenBaseUri;
        string deploymentPath;
        bool writeManifest;
    }

    function run() external returns (DemoDeploymentFactory demoFactory) {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) revert UnsupportedChain(block.chainid);

        DeploymentConfig memory config = _loadConfig();

        if (
            config.privateKey == 0 || config.deployer == address(0) || config.admin == address(0)
                || config.issuer == address(0) || config.settler == address(0) || config.creator == address(0)
                || config.investor == address(0) || config.settlementToken == address(0)
                || config.revenueBridge == address(0) || config.revenueRightToken == address(0)
                || bytes(config.tokenBaseUri).length == 0 || bytes(config.deploymentPath).length == 0
        ) revert InvalidConfiguration();

        vm.startBroadcast(config.privateKey);
        RevenueRightTokenFactory rightTokenFactory = new RevenueRightTokenFactory();
        RevenueBridgeDeployer bridgeDeployer = new RevenueBridgeDeployer(rightTokenFactory);
        demoFactory = new DemoDeploymentFactory(
            config.admin,
            bridgeDeployer,
            DemoDeploymentFactory.DemoConfig({
                admin: config.admin,
                issuer: config.issuer,
                settler: config.settler,
                creator: config.creator,
                investor: config.investor,
                tokenBaseUri: config.tokenBaseUri
            }),
            config.settlementToken,
            config.revenueBridge,
            config.revenueRightToken
        );
        vm.stopBroadcast();

        if (config.writeManifest) {
            _writeManifest(config, rightTokenFactory, bridgeDeployer, demoFactory);
        }

        console2.log("DemoDeploymentFactory", address(demoFactory));
        console2.log("RevenueBridgeDeployer", address(bridgeDeployer));
        console2.log("RevenueRightTokenFactory", address(rightTokenFactory));
    }

    function _loadConfig() private view returns (DeploymentConfig memory config) {
        config.privateKey = vm.envUint("BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY");
        config.deployer = vm.addr(config.privateKey);
        config.admin = vm.envAddress("BASE_SEPOLIA_ADMIN_ADDRESS");
        config.issuer = vm.envAddress("BASE_SEPOLIA_ISSUER_ADDRESS");
        config.settler = vm.envAddress("BASE_SEPOLIA_SETTLER_ADDRESS");
        config.creator = vm.envOr("BASE_SEPOLIA_DEMO_CREATOR_ADDRESS", config.admin);
        config.investor = vm.envOr("BASE_SEPOLIA_DEMO_INVESTOR_ADDRESS", config.admin);
        config.settlementToken = vm.envAddress("BASE_SEPOLIA_INITIAL_SETTLEMENT_TOKEN");
        config.revenueBridge = vm.envAddress("BASE_SEPOLIA_INITIAL_REVENUE_BRIDGE");
        config.revenueRightToken = vm.envAddress("BASE_SEPOLIA_INITIAL_REVENUE_RIGHT_TOKEN");
        config.tokenBaseUri = vm.envString("BASE_SEPOLIA_TOKEN_BASE_URI");
        config.deploymentPath = vm.envString("BASE_SEPOLIA_DEPLOYMENT_PATH");
        config.writeManifest = vm.envOr("BASE_SEPOLIA_WRITE_MANIFEST", false);
    }

    function _writeManifest(
        DeploymentConfig memory config,
        RevenueRightTokenFactory rightTokenFactory,
        RevenueBridgeDeployer bridgeDeployer,
        DemoDeploymentFactory demoFactory
    ) private {
        string memory contractsJson = vm.serializeAddress("demoContracts", "settlementToken", config.settlementToken);
        vm.serializeAddress("demoContracts", "revenueBridge", config.revenueBridge);
        vm.serializeAddress("demoContracts", "revenueRightToken", config.revenueRightToken);
        vm.serializeAddress("demoContracts", "revenueRightTokenFactory", address(rightTokenFactory));
        vm.serializeAddress("demoContracts", "revenueBridgeDeployer", address(bridgeDeployer));
        contractsJson = vm.serializeAddress("demoContracts", "demoFactory", address(demoFactory));

        string memory rolesJson = vm.serializeAddress("demoRoles", "admin", config.admin);
        vm.serializeAddress("demoRoles", "issuer", config.issuer);
        rolesJson = vm.serializeAddress("demoRoles", "settler", config.settler);

        string memory manifest = vm.serializeUint("demoManifest", "chainId", BASE_SEPOLIA_CHAIN_ID);
        vm.serializeString("demoManifest", "network", "base-sepolia");
        vm.serializeString("demoManifest", "tokenBaseUri", config.tokenBaseUri);
        vm.serializeAddress("demoManifest", "deployer", config.deployer);
        vm.serializeBool("demoManifest", "usesMockSettlementToken", true);
        vm.serializeString("demoManifest", "contracts", contractsJson);
        manifest = vm.serializeString("demoManifest", "roles", rolesJson);
        vm.writeJson(manifest, config.deploymentPath);
    }
}
