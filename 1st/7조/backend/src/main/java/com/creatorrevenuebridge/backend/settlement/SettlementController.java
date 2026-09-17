package com.creatorrevenuebridge.backend.settlement;

import com.creatorrevenuebridge.backend.settlement.dto.SettlementResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/offerings")
public class SettlementController {

    private final SettlementService settlementService;

    public SettlementController(SettlementService settlementService) {
        this.settlementService = settlementService;
    }

    @GetMapping("/{offeringId}/settlement")
    public SettlementResponse getSettlement(@PathVariable long offeringId) {
        return settlementService.getSettlement(offeringId);
    }
}
