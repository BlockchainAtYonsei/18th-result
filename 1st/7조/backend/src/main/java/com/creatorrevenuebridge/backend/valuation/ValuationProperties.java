package com.creatorrevenuebridge.backend.valuation;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Valuation model inputs per offeringId (application.properties: crb.valuation.offerings.*).
 * These are the only knobs the DCF estimate in ValuationService depends on.
 */
@ConfigurationProperties(prefix = "crb.valuation")
public record ValuationProperties(Map<String, OfferingInput> offerings) {

    public record OfferingInput(
            long historicalMonthlyRevenueRaw,
            int decimals,
            BigDecimal monthlyGrowthRate,
            BigDecimal annualDiscountRate,
            BigDecimal volatilityRisk,
            BigDecimal creatorRisk,
            BigDecimal platformRisk,
            int projectionMonths
    ) {
    }
}
