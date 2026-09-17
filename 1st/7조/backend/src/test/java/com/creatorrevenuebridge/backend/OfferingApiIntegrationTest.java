package com.creatorrevenuebridge.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Exercises the read-only endpoints end to end against the migrated in-memory database and
 * application.properties valuation inputs.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OfferingApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void getHealthReturnsServiceStatus() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.service").value("backend"));
    }

    @Test
    void getOfferingReturnsOffChainMetadataAndTerms() throws Exception {
        mockMvc.perform(get("/api/offerings/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.offeringId").value(1))
                .andExpect(jsonPath("$.status").value("Funding"))
                .andExpect(jsonPath("$.statusLabel").value("모집 중"))
                .andExpect(jsonPath("$.terms.unitsForSale").value(100))
                .andExpect(jsonPath("$.terms.unitPrice.raw").value("100000000"))
                .andExpect(jsonPath("$.terms.unitPrice.decimals").value(6))
                .andExpect(jsonPath("$.terms.unitPrice.display").value("100.000000"))
                .andExpect(jsonPath("$.terms.targetRaise.raw").value("10000000000"))
                .andExpect(jsonPath("$.terms.revenueSharePercent").value(20.00));
    }

    @Test
    void getOfferingsReturnsSeededDemoCatalogInDisplayOrder() throws Exception {
        mockMvc.perform(get("/api/offerings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].offeringId").value(1))
                .andExpect(jsonPath("$[0].title").value("라이브 콘텐츠 광고 수익권"))
                .andExpect(jsonPath("$[2].offeringId").value(3))
                .andExpect(jsonPath("$[2].title").value("즉시 만기 검증용 수익권"));
    }

    @Test
    void getOfferingUnknownIdReturns404WithApiErrorBody() throws Exception {
        mockMvc.perform(get("/api/offerings/999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("OFFERING_NOT_FOUND"));
    }

    @Test
    void getValuationReturnsPeriodBreakdownDrivenByConfiguredAssumptions() throws Exception {
        mockMvc.perform(get("/api/offerings/1/valuation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.offeringId").value(1))
                .andExpect(jsonPath("$.assumptions.projectionMonths").value(3))
                .andExpect(jsonPath("$.periods.length()").value(3))
                .andExpect(jsonPath("$.periods[0].month").value(1))
                .andExpect(jsonPath("$.totalPresentValue.decimals").value(6));
    }

    @Test
    void getSettlementReturnsOffChainScheduleWithDisclaimer() throws Exception {
        mockMvc.perform(get("/api/offerings/1/settlement"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataSource").value("off-chain-plan"))
                .andExpect(jsonPath("$.periods.length()").value(3))
                .andExpect(jsonPath("$.periods[0].status").value("scheduled"))
                .andExpect(jsonPath("$.disclaimer").isNotEmpty());
    }

}
