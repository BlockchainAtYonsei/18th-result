// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {RevenueBridge} from "./RevenueBridge.sol";
import {RevenueBridgeDeployer} from "./RevenueBridgeDeployer.sol";
import {RevenueRightToken} from "./RevenueRightToken.sol";
import {IRevenueBridge} from "./interfaces/IRevenueBridge.sol";
import {MockSettlementToken} from "./mocks/MockSettlementToken.sol";

/// @title DemoDeploymentFactory
/// @notice Keeps a stable entry point while replacing the complete demo contract set.
/// @dev Intended for test networks and local development only. Each reset deploys a freely mintable token.
contract DemoDeploymentFactory is Ownable {
    error InvalidAddress();
    error InvalidInitialDeployment();

    uint256 public constant ACTOR_BALANCE = 1_000_000e6;

    struct Deployment {
        address settlementToken;
        address revenueBridge;
        address revenueRightToken;
        uint256 version;
    }

    struct DemoConfig {
        address admin;
        address issuer;
        address settler;
        address creator;
        address investor;
        string tokenBaseUri;
    }

    struct OfferingSeed {
        string assetKey;
        string termsDocument;
        string valuationDocument;
        uint256 unitsForSale;
        uint256 unitPrice;
        uint16 revenueShareBps;
        uint256 fundingDuration;
        uint256 revenueStartDelay;
        uint256 settlementPeriodDuration;
        uint256 settlementPeriodCount;
    }

    Deployment private _activeDeployment;
    DemoConfig private _config;
    RevenueBridgeDeployer public immutable BRIDGE_DEPLOYER;

    event DemoDeploymentActivated(
        uint256 indexed version,
        address indexed settlementToken,
        address indexed revenueBridge,
        address revenueRightToken
    );

    constructor(
        address initialOwner,
        RevenueBridgeDeployer bridgeDeployer,
        DemoConfig memory config,
        address initialSettlementToken,
        address initialRevenueBridge,
        address initialRevenueRightToken
    ) Ownable(initialOwner) {
        if (
            initialOwner == address(0) || address(bridgeDeployer) == address(0) || config.admin == address(0)
                || config.issuer == address(0) || config.settler == address(0) || config.creator == address(0)
                || config.investor == address(0) || bytes(config.tokenBaseUri).length == 0
        ) revert InvalidAddress();
        if (
            initialSettlementToken.code.length == 0 || initialRevenueBridge.code.length == 0
                || initialRevenueRightToken.code.length == 0
                || address(RevenueBridge(initialRevenueBridge).SETTLEMENT_TOKEN()) != initialSettlementToken
                || address(RevenueBridge(initialRevenueBridge).REVENUE_RIGHT_TOKEN()) != initialRevenueRightToken
        ) revert InvalidInitialDeployment();

        BRIDGE_DEPLOYER = bridgeDeployer;
        _config = config;
        _activeDeployment = Deployment({
            settlementToken: initialSettlementToken,
            revenueBridge: initialRevenueBridge,
            revenueRightToken: initialRevenueRightToken,
            version: 1
        });
        emit DemoDeploymentActivated(1, initialSettlementToken, initialRevenueBridge, initialRevenueRightToken);
    }

    function activeDeployment() external view returns (Deployment memory) {
        return _activeDeployment;
    }

    function demoConfig() external view returns (DemoConfig memory) {
        return _config;
    }

    function resetDemo() external onlyOwner returns (Deployment memory deployment) {
        DemoConfig memory config = _config;
        MockSettlementToken settlementToken = new MockSettlementToken();
        RevenueBridge bridge = BRIDGE_DEPLOYER.deploy(settlementToken, address(this), config.tokenBaseUri);
        RevenueRightToken rightToken = bridge.REVENUE_RIGHT_TOKEN();

        bridge.setInvestorAllowed(config.investor, true);
        settlementToken.mint(config.investor, ACTOR_BALANCE);
        settlementToken.mint(config.settler, ACTOR_BALANCE);
        _seedOfferings(bridge, config.creator);
        _transferRoles(bridge, config);

        deployment = Deployment({
            settlementToken: address(settlementToken),
            revenueBridge: address(bridge),
            revenueRightToken: address(rightToken),
            version: _activeDeployment.version + 1
        });
        _activeDeployment = deployment;
        emit DemoDeploymentActivated(
            deployment.version, deployment.settlementToken, deployment.revenueBridge, deployment.revenueRightToken
        );
    }

    function _seedOfferings(RevenueBridge bridge, address creator) private {
        _createOffering(
            bridge,
            creator,
            OfferingSeed({
                assetKey: "demo-studio-aurora-2026",
                termsDocument: "demo-studio-aurora-terms-v1",
                valuationDocument: "demo-studio-aurora-valuation-v1",
                unitsForSale: 100,
                unitPrice: 100e6,
                revenueShareBps: 2_000,
                fundingDuration: 30 days,
                revenueStartDelay: 7 days,
                settlementPeriodDuration: 30 days,
                settlementPeriodCount: 3
            })
        );
        _createOffering(
            bridge,
            creator,
            OfferingSeed({
                assetKey: "demo-podcast-wave-2026",
                termsDocument: "demo-podcast-wave-terms-v1",
                valuationDocument: "demo-podcast-wave-valuation-v1",
                unitsForSale: 200,
                unitPrice: 50e6,
                revenueShareBps: 1_500,
                fundingDuration: 45 days,
                revenueStartDelay: 7 days,
                settlementPeriodDuration: 90 days,
                settlementPeriodCount: 2
            })
        );
        _createOffering(
            bridge,
            creator,
            OfferingSeed({
                assetKey: "demo-instant-maturity-2026",
                termsDocument: "demo-instant-maturity-terms-v1",
                valuationDocument: "demo-instant-maturity-valuation-v1",
                unitsForSale: 10,
                unitPrice: 1e6,
                revenueShareBps: 1_000,
                fundingDuration: 10 minutes,
                revenueStartDelay: 1 minutes,
                settlementPeriodDuration: 1 minutes,
                settlementPeriodCount: 3
            })
        );
    }

    function _createOffering(RevenueBridge bridge, address creator, OfferingSeed memory seed) private {
        uint64 fundingDeadline = uint64(block.timestamp + seed.fundingDuration);
        uint64 revenueStart = uint64(fundingDeadline + seed.revenueStartDelay);
        uint64 revenueEnd = uint64(revenueStart + seed.settlementPeriodDuration * seed.settlementPeriodCount);
        uint64[] memory periodEnds = new uint64[](seed.settlementPeriodCount);
        for (uint256 i = 0; i < seed.settlementPeriodCount; ++i) {
            periodEnds[i] = uint64(revenueStart + seed.settlementPeriodDuration * (i + 1));
        }

        IRevenueBridge.OfferingTerms memory terms = IRevenueBridge.OfferingTerms({
            creatorPayout: creator,
            assetKey: keccak256(bytes(seed.assetKey)),
            termsHash: keccak256(bytes(seed.termsDocument)),
            valuationHash: keccak256(bytes(seed.valuationDocument)),
            unitsForSale: seed.unitsForSale,
            unitPrice: seed.unitPrice,
            fundingDeadline: fundingDeadline,
            revenueStart: revenueStart,
            revenueEnd: revenueEnd,
            revenueShareBps: seed.revenueShareBps
        });
        bridge.createOffering(terms, periodEnds);
    }

    function _transferRoles(RevenueBridge bridge, DemoConfig memory config) private {
        bytes32 adminRole = bridge.DEFAULT_ADMIN_ROLE();
        bytes32 issuerRole = bridge.ISSUER_ROLE();
        bytes32 settlerRole = bridge.SETTLER_ROLE();

        bridge.grantRole(adminRole, config.admin);
        bridge.grantRole(issuerRole, config.issuer);
        bridge.grantRole(settlerRole, config.settler);
        bridge.revokeRole(issuerRole, address(this));
        bridge.revokeRole(settlerRole, address(this));
        bridge.revokeRole(adminRole, address(this));
    }
}
