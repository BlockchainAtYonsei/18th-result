package com.creatorrevenuebridge.backend.chainconfig.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Mirrors the subset of contracts/deployments/31337.json (copied by scripts/deploy-local.sh
 * into backend/src/main/resources/contracts/generated/deployment.json) that this API exposes.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DeploymentManifest(long chainId, String network, Contracts contracts) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Contracts(String settlementToken, String revenueBridge, String revenueRightToken) {
    }
}
