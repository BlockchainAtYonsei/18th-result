package com.creatorrevenuebridge.backend.settlement;

import com.creatorrevenuebridge.backend.offering.OfferingDataStore;
import com.creatorrevenuebridge.backend.offering.dto.OfferingRecord;
import com.creatorrevenuebridge.backend.settlement.dto.SettlementPeriodView;
import com.creatorrevenuebridge.backend.settlement.dto.SettlementResponse;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Serves the off-chain settlement schedule registered for an offering. The backend does not
 * query the chain (team decision), so this reflects the planned schedule only - not live
 * settlement confirmations or amounts, which the frontend reads directly from the contract.
 */
@Service
public class SettlementService {

    private static final String DISCLAIMER = "이 정보는 백엔드에 등록된 오프체인 정산 일정 계획입니다. "
            + "실제 온체인 정산 확정 여부와 입금액은 컨트랙트를 직접 조회해 확인해야 합니다.";

    private final OfferingDataStore offeringDataStore;

    public SettlementService(OfferingDataStore offeringDataStore) {
        this.offeringDataStore = offeringDataStore;
    }

    public SettlementResponse getSettlement(long offeringId) {
        OfferingRecord offering = offeringDataStore.get(offeringId);

        List<SettlementPeriodView> periods = offering.settlementPlan().periods().stream()
                .map(period -> new SettlementPeriodView(
                        period.periodIndex(),
                        period.periodStart(),
                        period.periodEnd(),
                        "scheduled"
                ))
                .toList();

        return new SettlementResponse(
                offeringId,
                "off-chain-plan",
                DISCLAIMER,
                new SettlementResponse.CurrencyView(
                        offering.settlementCurrency().symbol(),
                        offering.settlementCurrency().decimals()
                ),
                periods
        );
    }
}
