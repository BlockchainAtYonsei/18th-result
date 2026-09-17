package com.creatorrevenuebridge.backend.offering;

import com.creatorrevenuebridge.backend.offering.dto.OfferingResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/offerings")
public class OfferingController {

    private final OfferingService offeringService;

    public OfferingController(OfferingService offeringService) {
        this.offeringService = offeringService;
    }

    @GetMapping
    public List<OfferingResponse> getOfferings() {
        return offeringService.getOfferings();
    }

    @GetMapping("/{offeringId}")
    public OfferingResponse getOffering(@PathVariable long offeringId) {
        return offeringService.getOffering(offeringId);
    }
}
