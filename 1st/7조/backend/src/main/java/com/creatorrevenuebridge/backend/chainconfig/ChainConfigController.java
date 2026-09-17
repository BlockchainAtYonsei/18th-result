package com.creatorrevenuebridge.backend.chainconfig;

import com.creatorrevenuebridge.backend.chainconfig.dto.ChainConfigResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chain")
public class ChainConfigController {

    private final ChainConfigService chainConfigService;

    public ChainConfigController(ChainConfigService chainConfigService) {
        this.chainConfigService = chainConfigService;
    }

    @GetMapping("/config")
    public ChainConfigResponse getChainConfig() {
        return chainConfigService.getChainConfig();
    }
}
