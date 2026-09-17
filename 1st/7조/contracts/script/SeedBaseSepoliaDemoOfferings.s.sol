// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {RevenueBridge} from "../src/RevenueBridge.sol";
import {IRevenueBridge} from "../src/interfaces/IRevenueBridge.sol";

/// @notice Creates the initial Base Sepolia demo catalog, including an accelerated maturity item.
contract SeedBaseSepoliaDemoOfferings is Script {
    error UnsupportedChain(uint256 chainId);
    error InvalidConfiguration();
    error CatalogAlreadySeeded(uint256 nextOfferingId);

    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    struct SeedResult {
        uint256 id;
        uint64 fundingDeadline;
        uint64 revenueStart;
        uint64 revenueEnd;
    }

    function run() external returns (SeedResult memory first, SeedResult memory second, SeedResult memory instantDemo) {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) revert UnsupportedChain(block.chainid);

        uint256 privateKey = vm.envUint("BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY");
        address sender = vm.addr(privateKey);
        address bridgeAddress = vm.envAddress("BASE_SEPOLIA_REVENUE_BRIDGE_ADDRESS");
        address creator = vm.envOr("BASE_SEPOLIA_DEMO_CREATOR_ADDRESS", sender);
        uint256 instantFundingDuration = vm.envOr("DEMO_INSTANT_FUNDING_SECONDS", uint256(600));
        uint256 instantStartDelay = vm.envOr("DEMO_INSTANT_START_DELAY_SECONDS", uint256(60));
        uint256 instantPeriodDuration = vm.envOr("DEMO_INSTANT_PERIOD_SECONDS", uint256(60));

        if (
            privateKey == 0 || bridgeAddress == address(0) || creator == address(0) || instantFundingDuration == 0
                || instantStartDelay == 0 || instantPeriodDuration == 0
        ) revert InvalidConfiguration();

        RevenueBridge bridge = RevenueBridge(bridgeAddress);
        uint256 nextOfferingId = bridge.nextOfferingId();
        if (nextOfferingId != 1) revert CatalogAlreadySeeded(nextOfferingId);

        vm.startBroadcast(privateKey);
        first = _createOffering(
            bridge,
            creator,
            "demo-studio-aurora-2026",
            "demo-studio-aurora-terms-v1",
            "demo-studio-aurora-valuation-v1",
            100,
            100e6,
            2_000,
            30 days,
            7 days,
            30 days,
            3
        );
        second = _createOffering(
            bridge,
            creator,
            "demo-podcast-wave-2026",
            "demo-podcast-wave-terms-v1",
            "demo-podcast-wave-valuation-v1",
            200,
            50e6,
            1_500,
            45 days,
            7 days,
            90 days,
            2
        );
        instantDemo = _createOffering(
            bridge,
            creator,
            "demo-instant-maturity-2026",
            "demo-instant-maturity-terms-v1",
            "demo-instant-maturity-valuation-v1",
            10,
            1e6,
            1_000,
            instantFundingDuration,
            instantStartDelay,
            instantPeriodDuration,
            3
        );
        vm.stopBroadcast();

        _logOffering("Demo offering 1", first);
        _logOffering("Demo offering 2", second);
        _logOffering("Instant maturity demo", instantDemo);
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
    ) private returns (SeedResult memory result) {
        result.fundingDeadline = uint64(block.timestamp + fundingDuration);
        result.revenueStart = uint64(result.fundingDeadline + revenueStartDelay);
        result.revenueEnd = uint64(result.revenueStart + settlementPeriodDuration * settlementPeriodCount);

        uint64[] memory periodEnds = new uint64[](settlementPeriodCount);
        for (uint256 i = 0; i < settlementPeriodCount; ++i) {
            periodEnds[i] = uint64(result.revenueStart + settlementPeriodDuration * (i + 1));
        }

        IRevenueBridge.OfferingTerms memory terms = IRevenueBridge.OfferingTerms({
            creatorPayout: creator,
            assetKey: keccak256(bytes(assetKey)),
            termsHash: keccak256(bytes(termsDocument)),
            valuationHash: keccak256(bytes(valuationDocument)),
            unitsForSale: unitsForSale,
            unitPrice: unitPrice,
            fundingDeadline: result.fundingDeadline,
            revenueStart: result.revenueStart,
            revenueEnd: result.revenueEnd,
            revenueShareBps: revenueShareBps
        });
        result.id = bridge.createOffering(terms, periodEnds);
    }

    function _logOffering(string memory label, SeedResult memory result) private pure {
        console2.log(label);
        console2.log("  Offering ID", result.id);
        console2.log("  Funding deadline", result.fundingDeadline);
        console2.log("  Revenue start", result.revenueStart);
        console2.log("  Revenue end", result.revenueEnd);
    }
}
