package com.creatorrevenuebridge.backend.valuation;

import com.creatorrevenuebridge.backend.common.Amount;
import com.creatorrevenuebridge.backend.offering.OfferingDataStore;
import com.creatorrevenuebridge.backend.offering.dto.OfferingRecord;
import com.creatorrevenuebridge.backend.valuation.dto.ValuationPeriodBreakdown;
import com.creatorrevenuebridge.backend.valuation.dto.ValuationResponse;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Simple, transparent discounted cash flow estimate for an offering's expected investor revenue.
 * Mirrors the README formula: expected revenue - time value - volatility/creator/platform risk = present value.
 * This is off-chain analysis only (README: "평가 모델은 백엔드와 오프체인 분석의 책임"); it never touches the chain.
 */
@Service
public class ValuationService {

    private static final String METHODOLOGY_NOTE =
            "미래 예상 수익에서 시간가치와 수익 변동/크리에이터/플랫폼 위험을 순차 반영해 현재 가치를 추정한다. "
                    + "실제 모집가·정산 결과를 대체하지 않는 참고용 추정치다.";

    private final OfferingDataStore offeringDataStore;
    private final ValuationProperties valuationProperties;

    public ValuationService(OfferingDataStore offeringDataStore, ValuationProperties valuationProperties) {
        this.offeringDataStore = offeringDataStore;
        this.valuationProperties = valuationProperties;
    }

    public ValuationResponse getValuation(long offeringId) {
        OfferingRecord offering = offeringDataStore.get(offeringId);
        ValuationProperties.OfferingInput input = valuationProperties.offerings().get(Long.toString(offeringId));
        if (input == null) {
            throw new ValuationNotConfiguredException(offeringId);
        }

        int decimals = input.decimals();
        BigDecimal historicalMonthlyRevenue = BigDecimal.valueOf(input.historicalMonthlyRevenueRaw())
                .movePointLeft(decimals);
        BigDecimal revenueShareRatio = BigDecimal.valueOf(offering.terms().revenueShareBps())
                .divide(BigDecimal.valueOf(10_000), 6, RoundingMode.HALF_UP);
        BigDecimal riskMultiplier = BigDecimal.ONE
                .subtract(input.volatilityRisk())
                .multiply(BigDecimal.ONE.subtract(input.creatorRisk()))
                .multiply(BigDecimal.ONE.subtract(input.platformRisk()));

        // Annual discount rate -> monthly rate needs a fractional exponent (1/12), which BigDecimal
        // cannot express with pow(int); double precision is fine for a demo-grade estimate.
        double monthlyDiscountRate = Math.pow(1 + input.annualDiscountRate().doubleValue(), 1.0 / 12) - 1;

        List<ValuationPeriodBreakdown> periods = new ArrayList<>();
        BigDecimal totalPresentValue = BigDecimal.ZERO;

        for (int month = 1; month <= input.projectionMonths(); month++) {
            BigDecimal growthFactor = BigDecimal.ONE.add(input.monthlyGrowthRate()).pow(month);
            BigDecimal projectedRevenue = historicalMonthlyRevenue.multiply(growthFactor);
            BigDecimal riskAdjustedRevenue = projectedRevenue.multiply(riskMultiplier);
            BigDecimal eligibleInvestorRevenue = riskAdjustedRevenue.multiply(revenueShareRatio);

            BigDecimal discountFactor = BigDecimal.valueOf(1 / Math.pow(1 + monthlyDiscountRate, month));
            BigDecimal presentValue = eligibleInvestorRevenue.multiply(discountFactor);
            totalPresentValue = totalPresentValue.add(presentValue);

            periods.add(new ValuationPeriodBreakdown(
                    month,
                    Amount.fromDisplay(projectedRevenue, decimals),
                    Amount.fromDisplay(riskAdjustedRevenue, decimals),
                    Amount.fromDisplay(eligibleInvestorRevenue, decimals),
                    discountFactor.setScale(6, RoundingMode.HALF_UP),
                    Amount.fromDisplay(presentValue, decimals)
            ));
        }

        BigInteger unitPriceRaw = new BigInteger(offering.terms().unitPriceRaw());
        BigInteger targetRaiseRaw = unitPriceRaw.multiply(BigInteger.valueOf(offering.terms().unitsForSale()));
        Amount targetRaise = Amount.fromRaw(targetRaiseRaw, offering.settlementCurrency().decimals());

        BigDecimal targetRaiseDisplay = new BigDecimal(targetRaise.display());
        BigDecimal ratio = targetRaiseDisplay.signum() == 0
                ? BigDecimal.ZERO
                : totalPresentValue.divide(targetRaiseDisplay, 4, RoundingMode.HALF_UP);

        ValuationResponse.Assumptions assumptions = new ValuationResponse.Assumptions(
                Amount.fromDisplay(historicalMonthlyRevenue, decimals),
                input.monthlyGrowthRate(),
                input.annualDiscountRate(),
                input.volatilityRisk(),
                input.creatorRisk(),
                input.platformRisk(),
                input.projectionMonths(),
                revenueShareRatio
        );

        return new ValuationResponse(
                offeringId,
                assumptions,
                periods,
                Amount.fromDisplay(totalPresentValue, decimals),
                targetRaise,
                ratio,
                METHODOLOGY_NOTE
        );
    }
}
