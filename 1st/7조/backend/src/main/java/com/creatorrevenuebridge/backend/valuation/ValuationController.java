package com.creatorrevenuebridge.backend.valuation;

import com.creatorrevenuebridge.backend.valuation.dto.ValuationResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/offerings")
public class ValuationController {

    private final ValuationService valuationService;

    public ValuationController(ValuationService valuationService) {
        this.valuationService = valuationService;
    }

    @GetMapping("/{offeringId}/valuation")
    public ValuationResponse getValuation(@PathVariable long offeringId) {
        return valuationService.getValuation(offeringId);
    }
}
