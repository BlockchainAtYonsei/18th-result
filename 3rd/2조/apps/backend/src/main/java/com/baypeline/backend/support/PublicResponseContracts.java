package com.baypeline.backend.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/** Last check before any successful Public response leaves the Backend. */
@RestControllerAdvice
public class PublicResponseContracts implements ResponseBodyAdvice<Object> {
    private static final Map<String, String> DEFINITIONS = Map.ofEntries(
            Map.entry("AnalysisController#create", "api/AnalysisAccepted"),
            Map.entry("AnalysisController#get", "api/KYTAnalysisResult"),
            Map.entry("AnalysisController#transfers", "api/TransferPage"),
            Map.entry("ComplianceController#evaluate", "api/ComplianceResponse"),
            Map.entry("ExperimentController#gateway", "experiment/GatewayExperimentResult"),
            Map.entry("ExperimentController#constellation", "experiment/ConstellationSimulationResult"),
            Map.entry("ExperimentController#get", "api/ExperimentRecord"),
            Map.entry("ExperimentController#list", "api/ExperimentPage"),
            Map.entry("CaseController#list", "api/CasePage"),
            Map.entry("CaseController#get", "api/CaseDocument"),
            Map.entry("CaseController#put", "api/CaseDocument"),
            Map.entry("CaseController#delete", "api/CaseDeleted"));
    private final ObjectMapper mapper;
    public PublicResponseContracts(ObjectMapper mapper) { this.mapper = mapper; }

    @Override
    public boolean supports(MethodParameter method, Class<? extends HttpMessageConverter<?>> converter) {
        return DEFINITIONS.containsKey(key(method));
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter method, MediaType mediaType,
            Class<? extends HttpMessageConverter<?>> converter, ServerHttpRequest request, ServerHttpResponse response) {
        String[] definition = DEFINITIONS.get(key(method)).split("/");
        JsonNode value = mapper.valueToTree(body);
        try { JsonContracts.validate(definition[0], definition[1], value); }
        catch (ApiException e) {
            throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR", "Backend produced an invalid contract response", false);
        }
        return body;
    }

    private static String key(MethodParameter method) {
        return method.getContainingClass().getSimpleName() + "#" + method.getMethod().getName();
    }
}
