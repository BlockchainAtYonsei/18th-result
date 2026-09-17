package com.creatorrevenuebridge.backend.chainconfig;

import com.creatorrevenuebridge.backend.chainconfig.dto.ChainConfigResponse;
import com.creatorrevenuebridge.backend.chainconfig.dto.ClientMetadata;
import com.creatorrevenuebridge.backend.chainconfig.dto.DeploymentManifest;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;

/**
 * Reads the local deployment artifacts that scripts/deploy-local.sh copies into
 * backend/src/main/resources/contracts/generated/. The backend never talks to the chain itself
 * (team decision) - it only republishes these generated files as JSON.
 */
@Service
public class ChainConfigService {

    private static final String DEPLOYMENT_MANIFEST_LOCATION = "classpath:contracts/generated/deployment.json";
    private static final String CLIENT_METADATA_LOCATION = "classpath:contracts/generated/RevenueBridge.client.json";

    private final ResourceLoader resourceLoader;
    private final ObjectMapper objectMapper;

    public ChainConfigService(ResourceLoader resourceLoader, ObjectMapper objectMapper) {
        this.resourceLoader = resourceLoader;
        this.objectMapper = objectMapper;
    }

    public ChainConfigResponse getChainConfig() {
        DeploymentManifest manifest = readResource(DEPLOYMENT_MANIFEST_LOCATION, DeploymentManifest.class);
        ClientMetadata metadata = readResource(CLIENT_METADATA_LOCATION, ClientMetadata.class);

        ChainConfigResponse.ContractAddresses contracts = new ChainConfigResponse.ContractAddresses(
                manifest.contracts().settlementToken(),
                manifest.contracts().revenueBridge(),
                manifest.contracts().revenueRightToken()
        );

        return new ChainConfigResponse(
                manifest.chainId(),
                manifest.network(),
                contracts,
                metadata.offeringStatuses(),
                metadata.errorMessages()
        );
    }

    private <T> T readResource(String location, Class<T> type) {
        Resource resource = resourceLoader.getResource(location);
        if (!resource.exists()) {
            throw new ChainArtifactsNotFoundException(location);
        }
        try (InputStream in = resource.getInputStream()) {
            return objectMapper.readValue(in, type);
        } catch (IOException e) {
            throw new ChainArtifactsNotFoundException(location, e);
        }
    }
}
