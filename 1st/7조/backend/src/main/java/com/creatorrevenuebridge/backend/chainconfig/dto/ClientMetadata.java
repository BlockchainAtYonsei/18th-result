package com.creatorrevenuebridge.backend.chainconfig.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * Mirrors contracts/client/RevenueBridge.client.json, copied by scripts/deploy-local.sh into
 * backend/src/main/resources/contracts/generated/RevenueBridge.client.json.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ClientMetadata(List<OfferingStatusEntry> offeringStatuses, Map<String, String> errorMessages) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OfferingStatusEntry(int value, String name, String label) {
    }
}
