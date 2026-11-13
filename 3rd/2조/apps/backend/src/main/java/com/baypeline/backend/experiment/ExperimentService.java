package com.baypeline.backend.experiment;

import com.baypeline.backend.compliance.ReviewRecord;
import com.baypeline.backend.compliance.ReviewRepository;
import com.baypeline.backend.support.ApiContracts;
import com.baypeline.backend.support.ApiException;
import com.baypeline.backend.support.Contract;
import com.baypeline.backend.support.JsonContracts;
import java.time.Clock;
import java.time.format.DateTimeFormatterBuilder;
import java.util.UUID;
import com.baypeline.backend.upstream.UpstreamException;
import com.baypeline.backend.upstream.UpstreamServices;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Gateway·Constellation 실험. 브라우저는 intentId·decisionId만 보내고, Backend가 저장된 심사 기록에서
 * 원본 intent·decision을 찾아 내부 모듈 요청을 구성한다.
 */
@Service
public class ExperimentService {

    private static final JsonNodeFactory JSON = JsonNodeFactory.instance;
    private static final Set<String> GATEWAY_OUTCOMES = Set.of("SUBMISSION_ALLOWED", "SUBMISSION_REJECTED",
            "REVIEW_REQUIRED");
    private static final Set<String> SIMULATION_OUTCOMES = Set.of("NO_SUBMISSION_PATH", "INCLUSION_NOT_ENFORCED",
            "INCLUSION_ENFORCED", "INVALID_SCENARIO", "BLOCK_SKIPPED");

    private final ExperimentRepository records;
    private final Clock clock;
    private final ReviewRepository reviews;
    private final UpstreamServices upstream;

    public ExperimentService(ReviewRepository reviews, UpstreamServices upstream, ExperimentRepository records, Clock clock) {
        this.records = records;
        this.clock = clock;
        this.reviews = reviews;
        this.upstream = upstream;
    }

    /** POST /api/v1/experiments/gateway. */
    public ObjectNode gateway(JsonNode request, String requestId) {
        ApiContracts.gatewayRequest(request);
        ReviewRecord review = review(request);

        ObjectNode internal = JSON.objectNode();
        internal.put("requestId", requestId);
        internal.set("intent", review.intent());
        internal.set("decision", review.decision());
        internal.set("route", request.get("route"));

        JsonNode result = call(() -> upstream.runGateway(requestId, internal));
        JsonContracts.upstream("mock-gateway", "experiment", "GatewayExperimentResult", result);
        requireResponse("mock-gateway", result.get("policyApplied").equals(request.get("route").get("policyEnforced")));
        String routeId = request.get("route").get("routeId").textValue();
        requireResponse("mock-gateway", Contract.SCHEMA_VERSION.equals(result.path("schemaVersion").asText())
                && review.intentId().equals(result.path("intentId").asText())
                && routeId.equals(result.path("routeId").asText())
                && GATEWAY_OUTCOMES.contains(result.path("outcome").asText())
                && result.path("reasonCodes").isArray() && !result.path("reasonCodes").isEmpty()
                && result.path("actualBroadcast").isBoolean() && !result.get("actualBroadcast").booleanValue());
        return save("GATEWAY", request, requestId, review, result);
    }

    /** POST /api/v1/experiments/constellation. */
    public ObjectNode constellation(JsonNode request, String requestId) {
        ApiContracts.constellationRequest(request);
        ReviewRecord review = review(request);

        ObjectNode internal = JSON.objectNode();
        internal.put("requestId", requestId);
        internal.put("intentId", review.intentId());
        internal.put("decisionId", review.decisionId());
        internal.set("protocolModelVersion", request.get("protocolModelVersion"));
        internal.set("scenario", request.get("scenario"));

        JsonNode result = call(() -> upstream.simulateConstellation(requestId, internal));
        JsonContracts.upstream("constellation-simulator", "experiment", "ConstellationSimulationResult", result);
        requireResponse("constellation-simulator",
                Contract.SCHEMA_VERSION.equals(result.path("schemaVersion").asText())
                        && review.intentId().equals(result.path("intentId").asText())
                        && request.get("protocolModelVersion").textValue()
                                .equals(result.path("protocolModelVersion").asText())
                        && SIMULATION_OUTCOMES.contains(result.path("outcome").asText())
                        && result.path("explanationCodes").isArray() && !result.path("explanationCodes").isEmpty()
                        && result.path("simulationOnly").isBoolean() && result.get("simulationOnly").booleanValue());
        return save("CONSTELLATION", request, requestId, review, result);
    }

    public ObjectNode get(String recordId) { return records.find(recordId); }

    public ObjectNode list(String type, String intentId, String decisionId, String limit, String cursor) {
        return records.list(type, intentId, decisionId, limit, cursor);
    }

    private ObjectNode save(String type, JsonNode request, String requestId, ReviewRecord review, JsonNode result) {
        ObjectNode record = JSON.objectNode();
        record.put("schemaVersion", Contract.SCHEMA_VERSION);
        record.put("recordId", "record-" + UUID.randomUUID());
        record.put("type", type);
        record.put("requestId", requestId);
        record.put("createdAt", new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(clock.instant()));
        record.put("intentId", review.intentId());
        record.put("decisionId", review.decisionId());
        record.set("request", request.deepCopy());
        record.set("result", result.deepCopy());
        ObjectNode context = record.putObject("review");
        context.put("schemaVersion", Contract.SCHEMA_VERSION);
        context.put("requestId", review.requestId());
        context.set("intent", review.intent());
        context.set("assessments", review.assessments());
        context.set("decision", review.decision());
        records.save(record);
        return record;
    }

    private ReviewRecord review(JsonNode request) {
        String decisionId = request.get("decisionId").textValue();
        ReviewRecord review = reviews.find(decisionId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                "NOT_FOUND", "Compliance decision not found", false));
        if (!review.intentId().equals(request.get("intentId").textValue())) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT",
                    "intentId does not belong to the stored compliance decision", false);
        }
        return review;
    }

    private static JsonNode call(java.util.function.Supplier<JsonNode> call) {
        try {
            return call.get();
        } catch (UpstreamException e) {
            throw e.toPublic();
        }
    }

    private static void requireResponse(String service, boolean valid) {
        if (!valid) {
            throw UpstreamException.invalidResponse(service, "result does not match the request").toPublic();
        }
    }
}
