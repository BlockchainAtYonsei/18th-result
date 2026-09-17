// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IRevenueBridge} from "../src/interfaces/IRevenueBridge.sol";

contract ClientMetadataTest is Test {
    string internal metadata;

    function setUp() public {
        metadata = vm.readFile(string.concat(vm.projectRoot(), "/client/RevenueBridge.client.json"));
    }

    function testOfferingStatusValuesMatchContractEnum() public view {
        assertEq(vm.parseJsonUint(metadata, ".offeringStatuses[0].value"), uint256(IRevenueBridge.OfferingStatus.None));
        assertEq(
            vm.parseJsonUint(metadata, ".offeringStatuses[1].value"), uint256(IRevenueBridge.OfferingStatus.Funding)
        );
        assertEq(
            vm.parseJsonUint(metadata, ".offeringStatuses[2].value"), uint256(IRevenueBridge.OfferingStatus.Active)
        );
        assertEq(
            vm.parseJsonUint(metadata, ".offeringStatuses[3].value"), uint256(IRevenueBridge.OfferingStatus.Failed)
        );
        assertEq(
            vm.parseJsonUint(metadata, ".offeringStatuses[4].value"), uint256(IRevenueBridge.OfferingStatus.Settling)
        );
        assertEq(
            vm.parseJsonUint(metadata, ".offeringStatuses[5].value"), uint256(IRevenueBridge.OfferingStatus.Closed)
        );
    }

    function testProvidesMessagesForFrontendFacingErrors() public view {
        assertTrue(vm.keyExistsJson(metadata, ".errorMessages.InvestorNotAllowed"));
        assertTrue(vm.keyExistsJson(metadata, ".errorMessages.FundingClosed"));
        assertTrue(vm.keyExistsJson(metadata, ".errorMessages.NothingToRefund"));
        assertTrue(vm.keyExistsJson(metadata, ".errorMessages.NothingToClaim"));
        assertTrue(vm.keyExistsJson(metadata, ".errorMessages.AccessControlUnauthorizedAccount"));
        assertTrue(vm.keyExistsJson(metadata, ".errorMessages.TransfersDisabled"));
    }
}
