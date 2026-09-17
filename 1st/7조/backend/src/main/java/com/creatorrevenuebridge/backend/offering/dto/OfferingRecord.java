package com.creatorrevenuebridge.backend.offering.dto;

import com.creatorrevenuebridge.backend.offering.OfferingStatus;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.List;

/** Database representation of off-chain offering metadata and mirrored contract terms. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record OfferingRecord(
        long offeringId,
        OfferingStatus status,
        String assetKey,
        Creator creator,
        String title,
        String description,
        SettlementCurrency settlementCurrency,
        Terms terms,
        SettlementPlan settlementPlan
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Creator(String name, String platform, String handle, String imageUrl) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SettlementCurrency(String symbol, int decimals) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Terms(
            long unitsForSale,
            String unitPriceRaw,
            int revenueShareBps,
            Instant fundingDeadline,
            Instant revenueStart,
            Instant revenueEnd
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SettlementPlan(List<Period> periods) {

        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Period(int periodIndex, Instant periodStart, Instant periodEnd) {
        }
    }
}
