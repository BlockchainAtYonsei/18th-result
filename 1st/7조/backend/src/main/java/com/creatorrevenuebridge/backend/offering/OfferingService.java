package com.creatorrevenuebridge.backend.offering;

import com.creatorrevenuebridge.backend.common.Amount;
import com.creatorrevenuebridge.backend.offering.dto.OfferingRecord;
import com.creatorrevenuebridge.backend.offering.dto.OfferingResponse;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.List;

@Service
public class OfferingService {

    private final OfferingDataStore offeringDataStore;

    public OfferingService(OfferingDataStore offeringDataStore) {
        this.offeringDataStore = offeringDataStore;
    }

    public OfferingResponse getOffering(long offeringId) {
        return toResponse(offeringDataStore.get(offeringId));
    }

    public List<OfferingResponse> getOfferings() {
        return offeringDataStore.findAll().stream().map(this::toResponse).toList();
    }

    private OfferingResponse toResponse(OfferingRecord record) {
        int decimals = record.settlementCurrency().decimals();

        BigInteger unitPriceRaw = new BigInteger(record.terms().unitPriceRaw());
        BigInteger targetRaiseRaw = unitPriceRaw.multiply(BigInteger.valueOf(record.terms().unitsForSale()));

        OfferingResponse.TermsView terms = new OfferingResponse.TermsView(
                record.terms().unitsForSale(),
                Amount.fromRaw(unitPriceRaw, decimals),
                Amount.fromRaw(targetRaiseRaw, decimals),
                record.terms().revenueShareBps(),
                BigDecimal.valueOf(record.terms().revenueShareBps()).movePointLeft(2),
                record.terms().fundingDeadline(),
                record.terms().revenueStart(),
                record.terms().revenueEnd()
        );

        return new OfferingResponse(
                record.offeringId(),
                record.status().getContractName(),
                record.status().getLabel(),
                record.assetKey(),
                new OfferingResponse.CreatorView(
                        record.creator().name(),
                        record.creator().platform(),
                        record.creator().handle(),
                        record.creator().imageUrl()
                ),
                record.title(),
                record.description(),
                new OfferingResponse.CurrencyView(record.settlementCurrency().symbol(), decimals),
                terms
        );
    }
}
