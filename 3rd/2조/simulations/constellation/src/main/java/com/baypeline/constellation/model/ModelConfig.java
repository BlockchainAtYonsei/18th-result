package com.baypeline.constellation.model;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "constellation.models.enabled", havingValue = "true", matchIfMissing = true)
public class ModelConfig {
    @Bean ProtocolModel constellationDraftModel() { return new ConstellationDraftModel(); }
    @Bean ProtocolModel singleLeaderBaselineModel() { return new SingleLeaderBaselineModel("0.2.0-single-leader"); }
}
