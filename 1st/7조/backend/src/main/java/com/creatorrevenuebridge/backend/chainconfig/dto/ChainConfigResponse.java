package com.creatorrevenuebridge.backend.chainconfig.dto;

import java.util.List;
import java.util.Map;

public record ChainConfigResponse(
        long chainId,
        String network,
        ContractAddresses contracts,
        List<ClientMetadata.OfferingStatusEntry> offeringStatuses,
        Map<String, String> errorMessages
) {

    public record ContractAddresses(String settlementToken, String revenueBridge, String revenueRightToken) {
    }
}
