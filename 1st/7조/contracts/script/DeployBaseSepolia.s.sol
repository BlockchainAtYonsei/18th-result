// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {RevenueBridge} from "../src/RevenueBridge.sol";
import {DemoDeploymentFactory} from "../src/DemoDeploymentFactory.sol";
import {RevenueBridgeDeployer} from "../src/RevenueBridgeDeployer.sol";
import {RevenueRightToken} from "../src/RevenueRightToken.sol";
import {RevenueRightTokenFactory} from "../src/RevenueRightTokenFactory.sol";
import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

/// @notice Deploys the Base Sepolia contracts without creating offerings or funding accounts.
contract DeployBaseSepolia is Script {
    error UnsupportedChain(uint256 chainId);
    error InvalidBaseSepoliaConfiguration();
    error SettlementTokenHasNoCode(address settlementToken);

    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    struct DeploymentConfig {
        uint256 deployerPrivateKey;
        address deployer;
        address admin;
        address issuer;
        address settler;
        address configuredSettlementToken;
        string tokenBaseUri;
        string deploymentPath;
        bool writeManifest;
    }

    function run() external returns (IERC20 settlementToken, RevenueBridge bridge, RevenueRightToken rightToken) {
        return _run(_loadConfig());
    }

    /// @dev Deterministic entry point for tests that must not mutate process-wide environment variables.
    function runWithConfig(DeploymentConfig memory config)
        external
        returns (IERC20 settlementToken, RevenueBridge bridge, RevenueRightToken rightToken)
    {
        return _run(config);
    }

    function _run(DeploymentConfig memory config)
        private
        returns (IERC20 settlementToken, RevenueBridge bridge, RevenueRightToken rightToken)
    {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        _validateConfig(config);
        bool deployedMockSettlementToken = config.configuredSettlementToken == address(0);

        vm.startBroadcast(config.deployerPrivateKey);

        if (deployedMockSettlementToken) {
            settlementToken = IERC20(address(new MockSettlementToken()));
        } else {
            settlementToken = IERC20(config.configuredSettlementToken);
        }

        RevenueRightTokenFactory rightTokenFactory = new RevenueRightTokenFactory();
        bridge = new RevenueBridge(settlementToken, config.deployer, config.tokenBaseUri, rightTokenFactory);
        rightToken = bridge.REVENUE_RIGHT_TOKEN();

        _configureRoles(bridge, config);
        RevenueBridgeDeployer bridgeDeployer = new RevenueBridgeDeployer(rightTokenFactory);
        DemoDeploymentFactory demoFactory = new DemoDeploymentFactory(
            config.admin,
            bridgeDeployer,
            DemoDeploymentFactory.DemoConfig({
                admin: config.admin,
                issuer: config.issuer,
                settler: config.settler,
                creator: config.admin,
                investor: config.admin,
                tokenBaseUri: config.tokenBaseUri
            }),
            address(settlementToken),
            address(bridge),
            address(rightToken)
        );

        vm.stopBroadcast();

        if (config.writeManifest) {
            _writeDeploymentManifest(
                settlementToken,
                bridge,
                rightToken,
                rightTokenFactory,
                bridgeDeployer,
                demoFactory,
                config,
                deployedMockSettlementToken
            );
        }
        _logDeployment(settlementToken, bridge, rightToken, config, deployedMockSettlementToken);
    }

    function _loadConfig() private view returns (DeploymentConfig memory config) {
        config.deployerPrivateKey = vm.envUint("BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY");
        config.deployer = vm.addr(config.deployerPrivateKey);
        config.admin = vm.envAddress("BASE_SEPOLIA_ADMIN_ADDRESS");
        config.issuer = vm.envAddress("BASE_SEPOLIA_ISSUER_ADDRESS");
        config.settler = vm.envAddress("BASE_SEPOLIA_SETTLER_ADDRESS");
        config.configuredSettlementToken = vm.envOr("BASE_SEPOLIA_SETTLEMENT_TOKEN_ADDRESS", address(0));
        config.tokenBaseUri = vm.envString("BASE_SEPOLIA_TOKEN_BASE_URI");
        config.deploymentPath = vm.envOr(
            "BASE_SEPOLIA_DEPLOYMENT_PATH", string.concat(vm.projectRoot(), "/deployments/base-sepolia/84532.json")
        );
        config.writeManifest = vm.envOr("BASE_SEPOLIA_WRITE_MANIFEST", false);
    }

    function _validateConfig(DeploymentConfig memory config) private view {
        if (
            config.deployerPrivateKey == 0 || config.deployer == address(0)
                || config.deployer != vm.addr(config.deployerPrivateKey) || config.admin == address(0)
                || config.issuer == address(0) || config.settler == address(0) || bytes(config.tokenBaseUri).length == 0
                || bytes(config.deploymentPath).length == 0
        ) {
            revert InvalidBaseSepoliaConfiguration();
        }
        if (config.configuredSettlementToken != address(0) && config.configuredSettlementToken.code.length == 0) {
            revert SettlementTokenHasNoCode(config.configuredSettlementToken);
        }
    }

    function _configureRoles(RevenueBridge bridge, DeploymentConfig memory config) private {
        bytes32 adminRole = bridge.DEFAULT_ADMIN_ROLE();
        bytes32 issuerRole = bridge.ISSUER_ROLE();
        bytes32 settlerRole = bridge.SETTLER_ROLE();

        if (config.admin != config.deployer) {
            bridge.grantRole(adminRole, config.admin);
        }
        if (config.issuer != config.deployer) {
            bridge.grantRole(issuerRole, config.issuer);
            bridge.revokeRole(issuerRole, config.deployer);
        }
        if (config.settler != config.deployer) {
            bridge.grantRole(settlerRole, config.settler);
            bridge.revokeRole(settlerRole, config.deployer);
        }
        if (config.admin != config.deployer) {
            bridge.revokeRole(adminRole, config.deployer);
        }
    }

    function _writeDeploymentManifest(
        IERC20 settlementToken,
        RevenueBridge bridge,
        RevenueRightToken rightToken,
        RevenueRightTokenFactory rightTokenFactory,
        RevenueBridgeDeployer bridgeDeployer,
        DemoDeploymentFactory demoFactory,
        DeploymentConfig memory config,
        bool deployedMockSettlementToken
    ) private {
        string memory contractsJson = vm.serializeAddress(
            "baseSepoliaContracts", "settlementToken", address(settlementToken)
        );
        vm.serializeAddress("baseSepoliaContracts", "revenueBridge", address(bridge));
        vm.serializeAddress("baseSepoliaContracts", "revenueRightToken", address(rightToken));
        vm.serializeAddress("baseSepoliaContracts", "revenueRightTokenFactory", address(rightTokenFactory));
        vm.serializeAddress("baseSepoliaContracts", "revenueBridgeDeployer", address(bridgeDeployer));
        contractsJson = vm.serializeAddress("baseSepoliaContracts", "demoFactory", address(demoFactory));

        string memory rolesJson = vm.serializeAddress("baseSepoliaRoles", "admin", config.admin);
        vm.serializeAddress("baseSepoliaRoles", "issuer", config.issuer);
        rolesJson = vm.serializeAddress("baseSepoliaRoles", "settler", config.settler);

        string memory deploymentJson = vm.serializeUint("baseSepoliaDeployment", "chainId", BASE_SEPOLIA_CHAIN_ID);
        vm.serializeString("baseSepoliaDeployment", "network", "base-sepolia");
        vm.serializeString("baseSepoliaDeployment", "tokenBaseUri", config.tokenBaseUri);
        vm.serializeAddress("baseSepoliaDeployment", "deployer", config.deployer);
        vm.serializeBool("baseSepoliaDeployment", "usesMockSettlementToken", deployedMockSettlementToken);
        vm.serializeString("baseSepoliaDeployment", "contracts", contractsJson);
        deploymentJson = vm.serializeString("baseSepoliaDeployment", "roles", rolesJson);

        vm.writeJson(deploymentJson, config.deploymentPath);
    }

    function _logDeployment(
        IERC20 settlementToken,
        RevenueBridge bridge,
        RevenueRightToken rightToken,
        DeploymentConfig memory config,
        bool deployedMockSettlementToken
    ) private view {
        console2.log("Base Sepolia deployment prepared");
        console2.log("Chain ID", block.chainid);
        console2.log("Deployer", config.deployer);
        console2.log("Admin", config.admin);
        console2.log("Issuer", config.issuer);
        console2.log("Settler", config.settler);
        console2.log("Settlement token", address(settlementToken));
        console2.log("Uses mock settlement token", deployedMockSettlementToken);
        console2.log("RevenueBridge", address(bridge));
        console2.log("RevenueRightToken", address(rightToken));
        if (config.writeManifest) {
            console2.log("Deployment manifest", config.deploymentPath);
        }
    }
}
