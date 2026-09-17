// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {RevenueBridge} from "../src/RevenueBridge.sol";
import {DemoDeploymentFactory} from "../src/DemoDeploymentFactory.sol";
import {RevenueBridgeDeployer} from "../src/RevenueBridgeDeployer.sol";
import {RevenueRightToken} from "../src/RevenueRightToken.sol";
import {RevenueRightTokenFactory} from "../src/RevenueRightTokenFactory.sol";
import {IRevenueBridge} from "../src/interfaces/IRevenueBridge.sol";
import {MockSettlementToken} from "../src/mocks/MockSettlementToken.sol";

/// @notice Deploys and seeds the contracts used by the local Anvil environment.
contract DeployLocal is Script {
    error UnsupportedChain(uint256 chainId);
    error InvalidLocalConfiguration();

    uint256 internal constant LOCAL_CHAIN_ID = 31_337;
    uint256 internal constant DEFAULT_ACTOR_BALANCE = 1_000_000e6;
    uint256 internal constant DEMO_UNITS_FOR_SALE = 100;
    uint256 internal constant DEMO_UNIT_PRICE = 100e6;
    uint16 internal constant DEMO_REVENUE_SHARE_BPS = 2_000;
    uint256 internal constant DEMO_FUNDING_DURATION = 7 days;
    uint256 internal constant DEMO_REVENUE_START_DELAY = 1 days;
    uint256 internal constant DEMO_SETTLEMENT_PERIOD = 30 days;
    uint256 internal constant INSTANT_FUNDING_DURATION = 10 minutes;
    uint256 internal constant INSTANT_REVENUE_START_DELAY = 1 minutes;
    uint256 internal constant INSTANT_SETTLEMENT_PERIOD = 1 minutes;

    struct LocalConfig {
        uint256 deployerPrivateKey;
        address deployer;
        address issuer;
        address settler;
        address creator;
        address investor;
        uint256 investorBalance;
        uint256 settlerBalance;
        string tokenBaseUri;
        string deploymentPath;
    }

    struct DemoOffering {
        uint256 id;
        uint64 fundingDeadline;
        uint64 revenueStart;
        uint64 revenueEnd;
    }

    function run()
        external
        returns (
            MockSettlementToken settlementToken,
            RevenueBridge bridge,
            RevenueRightToken rightToken,
            uint256 demoOfferingId
        )
    {
        if (block.chainid != LOCAL_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        LocalConfig memory config = _loadConfig();

        vm.startBroadcast(config.deployerPrivateKey);

        settlementToken = new MockSettlementToken();
        RevenueRightTokenFactory rightTokenFactory = new RevenueRightTokenFactory();
        bridge = new RevenueBridge(settlementToken, config.deployer, config.tokenBaseUri, rightTokenFactory);
        rightToken = bridge.REVENUE_RIGHT_TOKEN();

        if (config.issuer != config.deployer) {
            bridge.grantRole(bridge.ISSUER_ROLE(), config.issuer);
        }
        if (config.settler != config.deployer) {
            bridge.grantRole(bridge.SETTLER_ROLE(), config.settler);
        }
        bridge.setInvestorAllowed(config.investor, true);
        settlementToken.mint(config.investor, config.investorBalance);
        settlementToken.mint(config.settler, config.settlerBalance);

        DemoOffering memory demo = _createOffering(
            bridge,
            config.creator,
            "demo-studio-aurora-2026",
            "local-demo-terms-v1",
            "local-demo-valuation-v1",
            DEMO_UNITS_FOR_SALE,
            DEMO_UNIT_PRICE,
            DEMO_REVENUE_SHARE_BPS,
            DEMO_FUNDING_DURATION,
            DEMO_REVENUE_START_DELAY,
            DEMO_SETTLEMENT_PERIOD,
            3
        );
        _createOffering(
            bridge,
            config.creator,
            "demo-podcast-wave-2026",
            "local-podcast-terms-v1",
            "local-podcast-valuation-v1",
            200,
            50e6,
            1_500,
            DEMO_FUNDING_DURATION,
            DEMO_REVENUE_START_DELAY,
            DEMO_SETTLEMENT_PERIOD,
            2
        );
        _createOffering(
            bridge,
            config.creator,
            "demo-instant-maturity-2026",
            "local-instant-terms-v1",
            "local-instant-valuation-v1",
            10,
            1e6,
            1_000,
            INSTANT_FUNDING_DURATION,
            INSTANT_REVENUE_START_DELAY,
            INSTANT_SETTLEMENT_PERIOD,
            3
        );
        demoOfferingId = demo.id;

        RevenueBridgeDeployer bridgeDeployer = new RevenueBridgeDeployer(rightTokenFactory);
        DemoDeploymentFactory demoFactory = new DemoDeploymentFactory(
            config.deployer,
            bridgeDeployer,
            DemoDeploymentFactory.DemoConfig({
                admin: config.deployer,
                issuer: config.issuer,
                settler: config.settler,
                creator: config.creator,
                investor: config.investor,
                tokenBaseUri: config.tokenBaseUri
            }),
            address(settlementToken),
            address(bridge),
            address(rightToken)
        );

        vm.stopBroadcast();

        _writeDeploymentManifest(
            settlementToken, bridge, rightToken, rightTokenFactory, bridgeDeployer, demoFactory, config, demo
        );
        _logDeployment(settlementToken, bridge, rightToken, config, demo);
    }

    function _loadConfig() private view returns (LocalConfig memory config) {
        config.deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        config.deployer = vm.addr(config.deployerPrivateKey);
        config.issuer = vm.envOr("LOCAL_ISSUER_ADDRESS", config.deployer);
        config.settler = vm.envOr("LOCAL_SETTLER_ADDRESS", config.deployer);
        config.creator = vm.envOr("LOCAL_CREATOR_ADDRESS", config.deployer);
        config.investor = vm.envOr("LOCAL_INVESTOR_ADDRESS", config.deployer);
        config.investorBalance = vm.envOr("LOCAL_INVESTOR_BALANCE", DEFAULT_ACTOR_BALANCE);
        config.settlerBalance = vm.envOr("LOCAL_SETTLER_BALANCE", DEFAULT_ACTOR_BALANCE);
        config.tokenBaseUri =
            vm.envOr("LOCAL_TOKEN_BASE_URI", string("http://localhost:3000/api/revenue-rights/{id}.json"));
        config.deploymentPath =
            vm.envOr("LOCAL_DEPLOYMENT_PATH", string.concat(vm.projectRoot(), "/deployments/31337.json"));

        if (
            config.deployer == address(0) || config.issuer == address(0) || config.settler == address(0)
                || config.creator == address(0) || config.investor == address(0) || config.investorBalance == 0
                || config.settlerBalance == 0
        ) {
            revert InvalidLocalConfiguration();
        }
    }

    function _createOffering(
        RevenueBridge bridge,
        address creator,
        string memory assetKey,
        string memory termsDocument,
        string memory valuationDocument,
        uint256 unitsForSale,
        uint256 unitPrice,
        uint16 revenueShareBps,
        uint256 fundingDuration,
        uint256 revenueStartDelay,
        uint256 settlementPeriodDuration,
        uint256 settlementPeriodCount
    ) private returns (DemoOffering memory demo) {
        demo.fundingDeadline = uint64(block.timestamp + fundingDuration);
        demo.revenueStart = uint64(demo.fundingDeadline + revenueStartDelay);
        demo.revenueEnd = uint64(demo.revenueStart + settlementPeriodDuration * settlementPeriodCount);
        uint64[] memory periodEnds = new uint64[](settlementPeriodCount);
        for (uint256 i = 0; i < settlementPeriodCount; ++i) {
            periodEnds[i] = uint64(demo.revenueStart + settlementPeriodDuration * (i + 1));
        }

        IRevenueBridge.OfferingTerms memory demoTerms = IRevenueBridge.OfferingTerms({
            creatorPayout: creator,
            assetKey: keccak256(bytes(assetKey)),
            termsHash: keccak256(bytes(termsDocument)),
            valuationHash: keccak256(bytes(valuationDocument)),
            unitsForSale: unitsForSale,
            unitPrice: unitPrice,
            fundingDeadline: demo.fundingDeadline,
            revenueStart: demo.revenueStart,
            revenueEnd: demo.revenueEnd,
            revenueShareBps: revenueShareBps
        });
        demo.id = bridge.createOffering(demoTerms, periodEnds);
    }

    function _writeDeploymentManifest(
        MockSettlementToken settlementToken,
        RevenueBridge bridge,
        RevenueRightToken rightToken,
        RevenueRightTokenFactory rightTokenFactory,
        RevenueBridgeDeployer bridgeDeployer,
        DemoDeploymentFactory demoFactory,
        LocalConfig memory config,
        DemoOffering memory demo
    ) private {
        string memory contractsJson = vm.serializeAddress("contracts", "settlementToken", address(settlementToken));
        vm.serializeAddress("contracts", "revenueBridge", address(bridge));
        vm.serializeAddress("contracts", "revenueRightToken", address(rightToken));
        vm.serializeAddress("contracts", "revenueRightTokenFactory", address(rightTokenFactory));
        vm.serializeAddress("contracts", "revenueBridgeDeployer", address(bridgeDeployer));
        contractsJson = vm.serializeAddress("contracts", "demoFactory", address(demoFactory));

        string memory accountsJson = vm.serializeAddress("accounts", "admin", config.deployer);
        vm.serializeAddress("accounts", "issuer", config.issuer);
        vm.serializeAddress("accounts", "settler", config.settler);
        vm.serializeAddress("accounts", "creator", config.creator);
        accountsJson = vm.serializeAddress("accounts", "investor", config.investor);

        string memory demoJson = vm.serializeUint("demo", "offeringId", demo.id);
        vm.serializeUint("demo", "unitsForSale", DEMO_UNITS_FOR_SALE);
        vm.serializeUint("demo", "unitPrice", DEMO_UNIT_PRICE);
        vm.serializeUint("demo", "targetRaise", DEMO_UNITS_FOR_SALE * DEMO_UNIT_PRICE);
        vm.serializeUint("demo", "revenueShareBps", DEMO_REVENUE_SHARE_BPS);
        vm.serializeUint("demo", "fundingDeadline", demo.fundingDeadline);
        vm.serializeUint("demo", "revenueStart", demo.revenueStart);
        demoJson = vm.serializeUint("demo", "revenueEnd", demo.revenueEnd);

        string memory deploymentJson = vm.serializeUint("deployment", "chainId", LOCAL_CHAIN_ID);
        vm.serializeString("deployment", "network", "anvil");
        vm.serializeString("deployment", "contracts", contractsJson);
        vm.serializeString("deployment", "accounts", accountsJson);
        deploymentJson = vm.serializeString("deployment", "demo", demoJson);

        vm.writeJson(deploymentJson, config.deploymentPath);
    }

    function _logDeployment(
        MockSettlementToken settlementToken,
        RevenueBridge bridge,
        RevenueRightToken rightToken,
        LocalConfig memory config,
        DemoOffering memory demo
    ) private view {
        console2.log("Local deployment complete");
        console2.log("Chain ID", block.chainid);
        console2.log("Deployer/Admin", config.deployer);
        console2.log("Issuer", config.issuer);
        console2.log("Settler", config.settler);
        console2.log("Creator", config.creator);
        console2.log("Investor", config.investor);
        console2.log("MockSettlementToken", address(settlementToken));
        console2.log("RevenueBridge", address(bridge));
        console2.log("RevenueRightToken", address(rightToken));
        console2.log("Demo Offering ID", demo.id);
        console2.log("Demo Units For Sale", DEMO_UNITS_FOR_SALE);
        console2.log("Demo Unit Price (mUSD base units)", DEMO_UNIT_PRICE);
        console2.log("Demo Target Raise (mUSD base units)", DEMO_UNITS_FOR_SALE * DEMO_UNIT_PRICE);
        console2.log("Demo Funding Deadline", demo.fundingDeadline);
        console2.log("Demo Revenue Start", demo.revenueStart);
        console2.log("Demo Revenue End", demo.revenueEnd);
        console2.log("Deployment Manifest", config.deploymentPath);
    }
}
