package com.creatorrevenuebridge.backend.valuation.dto;

import com.creatorrevenuebridge.backend.common.Amount;

import java.math.BigDecimal;
import java.util.List;

public record ValuationResponse(
        long offeringId,
        Assumptions assumptions,
        List<ValuationPeriodBreakdown> periods,
        Amount totalPresentValue,
        Amount targetRaise,
        BigDecimal presentValueToTargetRaiseRatio,
        String methodologyNote
) {

    public record Assumptions(
            Amount historicalMonthlyRevenue,
            BigDecimal monthlyGrowthRate,
            BigDecimal annualDiscountRate,
            BigDecimal volatilityRisk,
            BigDecimal creatorRisk,
            BigDecimal platformRisk,
            int projectionMonths,
            BigDecimal revenueShareRatio
    ) {
    }
}
