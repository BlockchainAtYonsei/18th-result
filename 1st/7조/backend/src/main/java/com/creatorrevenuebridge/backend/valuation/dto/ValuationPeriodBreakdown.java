package com.creatorrevenuebridge.backend.valuation.dto;

import com.creatorrevenuebridge.backend.common.Amount;

import java.math.BigDecimal;

public record ValuationPeriodBreakdown(
        int month,
        Amount projectedRevenue,
        Amount riskAdjustedRevenue,
        Amount eligibleInvestorRevenue,
        BigDecimal discountFactor,
        Amount presentValue
) {
}
