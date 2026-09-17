package com.creatorrevenuebridge.backend.offering.dto;

import com.creatorrevenuebridge.backend.common.Amount;

import java.math.BigDecimal;
import java.time.Instant;

public record OfferingResponse(
        long offeringId,
        String status,
        String statusLabel,
        String assetKey,
        CreatorView creator,
        String title,
        String description,
        CurrencyView settlementCurrency,
        TermsView terms
) {

    public record CreatorView(String name, String platform, String handle, String imageUrl) {
    }

    public record CurrencyView(String symbol, int decimals) {
    }

    public record TermsView(
            long unitsForSale,
            Amount unitPrice,
            Amount targetRaise,
            int revenueShareBps,
            BigDecimal revenueSharePercent,
            Instant fundingDeadline,
            Instant revenueStart,
            Instant revenueEnd
    ) {
    }
}
