package com.creatorrevenuebridge.backend.settlement.dto;

import java.util.List;

public record SettlementResponse(
        long offeringId,
        String dataSource,
        String disclaimer,
        CurrencyView settlementCurrency,
        List<SettlementPeriodView> periods
) {

    public record CurrencyView(String symbol, int decimals) {
    }
}
