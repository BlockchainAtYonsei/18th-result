package com.baypeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.baypeline.backend.upstream.UpstreamException;
import com.baypeline.backend.upstream.UpstreamServices;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Public API 전체 흐름. 내부 모듈은 contracts/fixtures 의 합성 응답을 돌려주는 Mock으로 대체한다.
 * compliance.async=false 로 분석 작업을 요청 스레드에서 실행한다.
 */
@SpringBootTest(properties = {"compliance.async=false",
        "compliance.cases-dir=${java.io.tmpdir}/solana-backend-case-tests-${random.uuid}",
        "compliance.experiments-dir=${java.io.tmpdir}/solana-backend-tests-${random.uuid}"})
@AutoConfigureMockMvc
class BackendApiTest {

    static final String SENDER = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
    static final String RECIPIENT = "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR";

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @MockitoBean
    UpstreamServices upstream;

    /** fixtureId → (snapshot, evaluation). */
    final Map<String, JsonNode[]> fixtures = new HashMap<>();

    @BeforeEach
    void stubUpstream() throws IOException {
        for (String id : new String[] {"sender", "sanctioned", "partial"}) {
            fixtures.put(id, new JsonNode[] {fixture(id + "/snapshot.json"), fixture(id + "/evaluation.json")});
        }
        when(upstream.collect(anyString(), any())).thenAnswer(call -> {
            ObjectNode request = call.getArgument(1);
            ObjectNode snapshot = fixtures.get(request.get("fixtureId").textValue())[0].deepCopy();
            snapshot.put("requestId", request.get("requestId").textValue());
            return snapshot;
        });
        when(upstream.evaluateKyt(anyString(), any())).thenAnswer(call -> {
            ObjectNode request = call.getArgument(1);
            String snapshotId = request.get("snapshot").get("snapshotId").textValue();
            return fixtures.get(snapshotId.replace("-snapshot", ""))[1];
        });
        when(upstream.decidePolicy(anyString(), any())).thenReturn(fixture("sanctioned/decision.json"));
        when(upstream.runGateway(anyString(), any())).thenReturn(fixture("gateway/block-result.json"));
        when(upstream.simulateConstellation(anyString(), any())).thenReturn(fixture("constellation/mock-result.json"));
    }

    // ---------- analyses ----------

    @Test
    void createAnalysisReturns202WithLocationAndCompletes() throws Exception {
        ResultActions created = postJson("/api/v1/analyses", analysisRequest(RECIPIENT, "sanctioned"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.schemaVersion").value("0.1.0"))
                .andExpect(jsonPath("$.status").value("QUEUED"));
        String id = read(created).get("analysisId").textValue();
        created.andExpect(header().string("Location", "/api/v1/analyses/" + id));

        mvc.perform(get("/api/v1/analyses/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.address").value(RECIPIENT))
                .andExpect(jsonPath("$.snapshotId").value("sanctioned-snapshot"))
                .andExpect(jsonPath("$.coverage.status").value("COMPLETE"))
                .andExpect(jsonPath("$.dataProvenance.dataType").value("SYNTHETIC"))
                .andExpect(jsonPath("$.evaluation.riskScore").value(100))
                .andExpect(jsonPath("$.evaluation.riskLevel").value("HIGH"))
                .andExpect(jsonPath("$.error").isEmpty());
    }

    @Test
    void usesXRequestIdAndPassesItToInternalModules() throws Exception {
        String id = read(mvc.perform(post("/api/v1/analyses").header("X-Request-ID", "trace-123")
                        .contentType(MediaType.APPLICATION_JSON).content(analysisRequest(RECIPIENT, "sanctioned")))
                .andExpect(header().string("X-Request-ID", "trace-123"))
                .andExpect(jsonPath("$.requestId").value("trace-123"))).get("analysisId").textValue();

        ArgumentCaptor<ObjectNode> collect = ArgumentCaptor.forClass(ObjectNode.class);
        verify(upstream).collect(org.mockito.ArgumentMatchers.eq("trace-123"), collect.capture());
        assertThat(collect.getValue().get("requestId").textValue()).isEqualTo("trace-123");
        assertThat(collect.getValue().get("fixtureId").textValue()).isEqualTo("sanctioned");

        ArgumentCaptor<ObjectNode> kyt = ArgumentCaptor.forClass(ObjectNode.class);
        verify(upstream).evaluateKyt(org.mockito.ArgumentMatchers.eq("trace-123"), kyt.capture());
        assertThat(kyt.getValue().get("rulesetVersion").textValue()).isEqualTo("1.0.0");
        mvc.perform(get("/api/v1/analyses/" + id)).andExpect(jsonPath("$.requestId").value("trace-123"));
    }

    @Test
    void partialCoverageGivesPartialStatusWithNullScore() throws Exception {
        String id = createAnalysis(RECIPIENT, "partial");
        mvc.perform(get("/api/v1/analyses/" + id))
                .andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.coverage.status").value("PARTIAL"))
                .andExpect(jsonPath("$.evaluation.riskScore").isEmpty())
                .andExpect(jsonPath("$.evaluation.riskLevel").isEmpty());
    }

    @Test
    void collectorFailureMarksAnalysisFailed() throws Exception {
        doThrow(UpstreamException.unavailable("collector")).when(upstream).collect(anyString(), any());
        String id = createAnalysis(RECIPIENT, "sanctioned");

        mvc.perform(get("/api/v1/analyses/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.error.code").value("UPSTREAM_UNAVAILABLE"))
                .andExpect(jsonPath("$.error.retryable").value(true))
                .andExpect(jsonPath("$.snapshotId").isEmpty())
                .andExpect(jsonPath("$.evaluation").isEmpty());
        verify(upstream, never()).evaluateKyt(anyString(), any());
    }

    @Test
    void unsupportedRulesetFromKytIsKeptAsFailureCode() throws Exception {
        doThrow(
                new UpstreamException("kyt-engine", 422, "UNSUPPORTED_VERSION", "Unsupported rulesetVersion", false))
                .when(upstream).evaluateKyt(anyString(), any());
        String id = createAnalysis(RECIPIENT, "sanctioned");
        mvc.perform(get("/api/v1/analyses/" + id))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.error.code").value("UNSUPPORTED_VERSION"))
                .andExpect(jsonPath("$.error.message").value("kyt-engine: Unsupported rulesetVersion"));
    }

    @Test
    void snapshotForAnotherAddressIsRejected() throws Exception {
        String id = createAnalysis(SENDER, "sanctioned");
        mvc.perform(get("/api/v1/analyses/" + id))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.error.code").value("CONTRACT_VALIDATION_FAILED"));
    }

    @Test
    void evaluationScoreInconsistentWithCoverageIsRejected() throws Exception {
        ObjectNode bad = fixtures.get("partial")[1].deepCopy();
        bad.put("riskScore", 0);
        bad.put("riskLevel", "LOW");
        fixtures.get("partial")[1] = bad;
        String id = createAnalysis(RECIPIENT, "partial");
        mvc.perform(get("/api/v1/analyses/" + id))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.error.code").value("CONTRACT_VALIDATION_FAILED"));
    }

    @Test
    void unknownAnalysisIs404() throws Exception {
        mvc.perform(get("/api/v1/analyses/nope"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());
    }

    @Test
    void invalidAnalysisRequestsAre400() throws Exception {
        ObjectNode live = (ObjectNode) mapper.readTree(analysisRequest(RECIPIENT, "sanctioned"));
        live.put("mode", "LIVE");
        postJson("/api/v1/analyses", live.toString()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("CONTRACT_VALIDATION_FAILED"));

        ObjectNode extra = (ObjectNode) mapper.readTree(analysisRequest(RECIPIENT, "sanctioned"));
        extra.put("riskScore", 0);
        postJson("/api/v1/analyses", extra.toString()).andExpect(status().isBadRequest());

        ObjectNode badAddress = (ObjectNode) mapper.readTree(analysisRequest(RECIPIENT, "sanctioned"));
        badAddress.put("address", "0OIl" + RECIPIENT.substring(4));
        postJson("/api/v1/analyses", badAddress.toString()).andExpect(status().isBadRequest());

        ObjectNode reversed = (ObjectNode) mapper.readTree(analysisRequest(RECIPIENT, "sanctioned"));
        ((ObjectNode) reversed.get("scope")).put("toTime", "2026-10-01T00:00:00Z");
        postJson("/api/v1/analyses", reversed.toString()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));

        mvc.perform(post("/api/v1/analyses").contentType(MediaType.TEXT_PLAIN).content("x"))
                .andExpect(status().isUnsupportedMediaType());
        mvc.perform(post("/api/v1/analyses").header("X-Request-ID", "has space")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
    }

    // ---------- transfers ----------

    @Test
    void transfersPageWithCursor() throws Exception {
        ObjectNode snapshot = fixtures.get("sanctioned")[0].deepCopy();
        ArrayNode transfers = (ArrayNode) snapshot.get("transfers");
        JsonNode first = transfers.get(0);
        for (int i = 1; i < 3; i++) {
            ObjectNode copy = first.deepCopy();
            copy.put("id", "transfer-extra-" + i);
            copy.put("transferOrdinal", i);
            transfers.add(copy);
        }
        ((ObjectNode) snapshot.get("coverage")).put("transferCount", 3);
        fixtures.get("sanctioned")[0] = snapshot;
        String id = createAnalysis(RECIPIENT, "sanctioned");

        JsonNode page1 = read(mvc.perform(get("/api/v1/analyses/" + id + "/transfers").param("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.pagination.limit").value(2)));
        String cursor = page1.get("pagination").get("nextCursor").textValue();
        assertThat(cursor).isNotBlank();

        mvc.perform(get("/api/v1/analyses/" + id + "/transfers").param("limit", "2").param("cursor", cursor))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value("transfer-extra-2"))
                .andExpect(jsonPath("$.pagination.nextCursor").isEmpty());

        mvc.perform(get("/api/v1/analyses/" + id + "/transfers"))
                .andExpect(jsonPath("$.pagination.limit").value(100))
                .andExpect(jsonPath("$.items.length()").value(3));
        mvc.perform(get("/api/v1/analyses/" + id + "/transfers").param("limit", "1001"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/analyses/" + id + "/transfers").param("cursor", "garbage"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void transfersOfFailedAnalysisAre409() throws Exception {
        doThrow(UpstreamException.unavailable("collector")).when(upstream).collect(anyString(), any());
        String id = createAnalysis(RECIPIENT, "sanctioned");
        mvc.perform(get("/api/v1/analyses/" + id + "/transfers"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ANALYSIS_NOT_READY"));
    }

    // ---------- compliance ----------

    @Test
    void complianceEvaluationUsesStoredAssessments() throws Exception {
        String sender = createAnalysis(SENDER, "sender");
        String recipient = createAnalysis(RECIPIENT, "sanctioned");

        postJson("/api/v1/compliance/evaluate", complianceRequest(sender, recipient))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schemaVersion").value("0.1.0"))
                .andExpect(jsonPath("$.intent.intentId").value("sanctioned-intent"))
                .andExpect(jsonPath("$.assessments.sender.snapshotId").value("sender-snapshot"))
                .andExpect(jsonPath("$.assessments.recipient.snapshotId").value("sanctioned-snapshot"))
                .andExpect(jsonPath("$.decision.action").value("BLOCK"));

        ArgumentCaptor<ObjectNode> policy = ArgumentCaptor.forClass(ObjectNode.class);
        verify(upstream).decidePolicy(anyString(), policy.capture());
        assertThat(policy.getValue().get("policyVersion").textValue()).isEqualTo("1.0.0");
        assertThat(policy.getValue().get("assessments").get("recipient").get("riskScore").intValue()).isEqualTo(100);
    }

    @Test
    void complianceRejectsMismatchedAnalysis() throws Exception {
        String sender = createAnalysis(SENDER, "sender");
        String recipient = createAnalysis(RECIPIENT, "sanctioned");
        postJson("/api/v1/compliance/evaluate", complianceRequest(recipient, sender))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ASSESSMENT_MISMATCH"));
    }

    @Test
    void complianceRejectsNotReadyAndUnknownAnalysis() throws Exception {
        String sender = createAnalysis(SENDER, "sender");
        doThrow(UpstreamException.unavailable("collector")).when(upstream).collect(anyString(), any());
        String failed = createAnalysis(RECIPIENT, "sanctioned");

        postJson("/api/v1/compliance/evaluate", complianceRequest(sender, failed))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ANALYSIS_NOT_READY"));
        postJson("/api/v1/compliance/evaluate", complianceRequest(sender, "missing"))
                .andExpect(status().isNotFound());
    }

    @Test
    void unsupportedPolicyVersionIs422() throws Exception {
        doThrow(
                new UpstreamException("policy-engine", 422, "UNSUPPORTED_VERSION", "Unsupported policyVersion", false))
                .when(upstream).decidePolicy(anyString(), any());
        String sender = createAnalysis(SENDER, "sender");
        String recipient = createAnalysis(RECIPIENT, "sanctioned");
        postJson("/api/v1/compliance/evaluate", complianceRequest(sender, recipient))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("UNSUPPORTED_VERSION"));
    }

    @Test
    void policyEngineDownIs503() throws Exception {
        doThrow(UpstreamException.unavailable("policy-engine")).when(upstream).decidePolicy(anyString(), any());
        String sender = createAnalysis(SENDER, "sender");
        String recipient = createAnalysis(RECIPIENT, "sanctioned");
        postJson("/api/v1/compliance/evaluate", complianceRequest(sender, recipient))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error.code").value("UPSTREAM_UNAVAILABLE"))
                .andExpect(jsonPath("$.error.retryable").value(true));
    }

    @ParameterizedTest
    @ValueSource(strings = {"range", "enum", "missing", "extra", "dangling", "score-sum"})
    void malformedKytResponsesNeverBecomePublicResults(String mutation) throws Exception {
        ObjectNode bad = fixtures.get("sanctioned")[1].deepCopy();
        switch (mutation) {
            case "range" -> bad.put("riskScore", 999);
            case "enum" -> bad.put("riskLevel", "BROKEN");
            case "missing" -> bad.remove("rulesetVersion");
            case "extra" -> bad.put("secretExtra", "must not be exposed");
            case "dangling" -> ((ObjectNode) bad.get("evidences").get(0)).putArray("transferIds").add("missing-transfer");
            case "score-sum" -> bad.put("riskScore", 90);
            default -> throw new IllegalArgumentException();
        }
        fixtures.get("sanctioned")[1] = bad;
        String id = createAnalysis(RECIPIENT, "sanctioned");
        mvc.perform(get("/api/v1/analyses/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.evaluation").isEmpty())
                .andExpect(jsonPath("$.error.code").value("CONTRACT_VALIDATION_FAILED"));
    }

    @Test
    void duplicateTransferPositionsAreRejectedEvenWithDifferentNumericRepresentations() throws Exception {
        ObjectNode snapshot = (ObjectNode) fixtures.get("sanctioned")[0];
        ArrayNode transfers = (ArrayNode) snapshot.get("transfers");
        ObjectNode duplicate = transfers.get(0).deepCopy();
        duplicate.put("id", "another-transfer-id");
        duplicate.put("transferOrdinal", duplicate.get("transferOrdinal").doubleValue());
        transfers.add(duplicate);
        ((ObjectNode) snapshot.get("coverage")).put("transferCount", 2);
        String id = createAnalysis(RECIPIENT, "sanctioned");
        mvc.perform(get("/api/v1/analyses/" + id)).andExpect(jsonPath("$.status").value("FAILED"));
        verify(upstream, never()).evaluateKyt(anyString(), any());
    }

    @Test
    void errorCorrelationHeaderIsSingleValuedForFrontendProxies() throws Exception {
        var response = mvc.perform(get("/api/v1/analyses/missing").header("X-Request-ID", "trace-single"))
                .andExpect(status().isNotFound()).andReturn().getResponse();
        assertThat(response.getHeaders("X-Request-ID")).containsExactly("trace-single");
    }

    @Test
    void snapshotOutsideRequestedScopeIsRejectedBeforeCallingKyt() throws Exception {
        ((ObjectNode) fixtures.get("sanctioned")[0].get("coverage")).put("transactionCount", 101);
        String id = createAnalysis(RECIPIENT, "sanctioned");
        mvc.perform(get("/api/v1/analyses/" + id)).andExpect(jsonPath("$.status").value("FAILED"));
        verify(upstream, never()).evaluateKyt(anyString(), any());
    }

    @Test
    void policyCannotReferToEvidenceOutsideTheSavedAssessments() throws Exception {
        ObjectNode bad = (ObjectNode) fixture("sanctioned/decision.json");
        bad.putArray("referencedEvidenceIds").add("unknown-evidence");
        when(upstream.decidePolicy(anyString(), any())).thenReturn(bad);
        String sender = createAnalysis(SENDER, "sender");
        String recipient = createAnalysis(RECIPIENT, "sanctioned");
        postJson("/api/v1/compliance/evaluate", complianceRequest(sender, recipient))
                .andExpect(status().isBadGateway()).andExpect(jsonPath("$.error.code").value("CONTRACT_VALIDATION_FAILED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"experimentId", "policyApplied", "invalidReason", "extra", "routeMismatch"})
    void invalidGatewayResultsAreNeitherReturnedNorRecorded(String mutation) throws Exception {
        String decision = evaluateCompliance();
        ObjectNode bad = (ObjectNode) fixture("gateway/block-result.json");
        switch (mutation) {
            case "invalidReason" -> bad.putArray("reasonCodes").add("NOT_IN_CONTRACT");
            case "extra" -> bad.put("extra", true);
            case "routeMismatch" -> bad.put("policyApplied", false);
            default -> bad.remove(mutation);
        }
        when(upstream.runGateway(anyString(), any())).thenReturn(bad);
        int before = read(mvc.perform(get("/api/v1/experiments").param("decisionId", decision))).get("items").size();
        postJson("/api/v1/experiments/gateway", gatewayBody(decision)).andExpect(status().isBadGateway());
        assertThat(read(mvc.perform(get("/api/v1/experiments").param("decisionId", decision))).get("items").size()).isEqualTo(before);
    }

    @ParameterizedTest
    @ValueSource(strings = {"simulationId", "proposerPathAvailable", "leaderExclusionValid", "invalidReason"})
    void incompleteConstellationResultsAreRejected(String mutation) throws Exception {
        String decision = evaluateCompliance();
        ObjectNode bad = (ObjectNode) fixture("constellation/mock-result.json");
        if ("invalidReason".equals(mutation)) bad.putArray("explanationCodes").add("NOT_IN_CONTRACT");
        else bad.remove(mutation);
        when(upstream.simulateConstellation(anyString(), any())).thenReturn(bad);
        postJson("/api/v1/experiments/constellation", constellationBody(decision)).andExpect(status().isBadGateway());
    }

    @Test
    void successfulExperimentsExposePersistentAuditLocationsAndDistinctExecutions() throws Exception {
        String decision = evaluateCompliance();
        ResultActions first = postJson("/api/v1/experiments/gateway", gatewayBody(decision)).andExpect(status().isOk());
        String location = first.andReturn().getResponse().getHeader("Location");
        assertThat(location).startsWith("/api/v1/experiments/record-");
        JsonNode record = read(mvc.perform(get(location)).andExpect(status().isOk())
                .andExpect(header().exists("X-Request-ID"))
                .andExpect(jsonPath("$.type").value("GATEWAY"))
                .andExpect(jsonPath("$.review.decision.decisionId").value(decision)));
        assertThat(record.get("result")).isEqualTo(read(first));
        ResultActions repeated = postJson("/api/v1/experiments/gateway", gatewayBody(decision));
        assertThat(repeated.andReturn().getResponse().getHeader("Location")).isNotEqualTo(location);
        assertThat(read(repeated).get("experimentId")).isEqualTo(read(first).get("experimentId"));
        ResultActions simulation = postJson("/api/v1/experiments/constellation", constellationBody(decision));
        mvc.perform(get(simulation.andReturn().getResponse().getHeader("Location")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.type").value("CONSTELLATION"));
        mvc.perform(get("/api/v1/experiments").param("type", "CONSTELLATION").param("decisionId", decision))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].type").value("CONSTELLATION"));
        mvc.perform(get("/api/v1/experiments/missing")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        mvc.perform(get("/api/v1/experiments").param("limit", "0")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/experiments").param("type", "INVALID")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/experiments").param("cursor", "???")).andExpect(status().isBadRequest());
    }

    private String gatewayBody(String decision) {
        return "{\"intentId\":\"sanctioned-intent\",\"decisionId\":\"" + decision
                + "\",\"route\":{\"routeId\":\"block\",\"policyEnforced\":true,\"warningAcknowledged\":false}}";
    }

    private String constellationBody(String decision) {
        return "{\"intentId\":\"sanctioned-intent\",\"decisionId\":\"" + decision
                + "\",\"protocolModelVersion\":\"0.0.0-research-pending\",\"scenario\":{\"proposerCount\":4,"
                + "\"rejectingProposerCount\":1,\"submittedToAcceptingProposer\":true,\"psliceAvailable\":true,"
                + "\"attestationPercent\":100,\"leaderAttemptsExclusion\":true}}";
    }

    // ---------- experiments ----------

    @Test
    void gatewayExperimentUsesStoredIntentAndDecision() throws Exception {
        String decisionId = evaluateCompliance();
        String body = "{\"intentId\":\"sanctioned-intent\",\"decisionId\":\"" + decisionId
                + "\",\"route\":{\"routeId\":\"block\",\"policyEnforced\":true,\"warningAcknowledged\":false}}";

        postJson("/api/v1/experiments/gateway", body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("SUBMISSION_REJECTED"))
                .andExpect(jsonPath("$.actualBroadcast").value(false));

        ArgumentCaptor<ObjectNode> internal = ArgumentCaptor.forClass(ObjectNode.class);
        verify(upstream).runGateway(anyString(), internal.capture());
        assertThat(internal.getValue().get("decision").get("action").textValue()).isEqualTo("BLOCK");
        assertThat(internal.getValue().get("intent").get("sender").textValue()).isEqualTo(SENDER);
    }

    @Test
    void gatewayRejectsUnknownDecisionAndForeignIntent() throws Exception {
        String decisionId = evaluateCompliance();
        String route = ",\"route\":{\"routeId\":\"block\",\"policyEnforced\":true,\"warningAcknowledged\":false}}";
        postJson("/api/v1/experiments/gateway", "{\"intentId\":\"sanctioned-intent\",\"decisionId\":\"x\"" + route)
                .andExpect(status().isNotFound());
        postJson("/api/v1/experiments/gateway",
                "{\"intentId\":\"other\",\"decisionId\":\"" + decisionId + "\"" + route)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"));
        postJson("/api/v1/experiments/gateway",
                "{\"intentId\":\"sanctioned-intent\",\"decisionId\":\"" + decisionId + "\",\"action\":\"ALLOW\""
                        + route)
                .andExpect(status().isBadRequest());
    }

    @Test
    void constellationExperimentAndVersionPropagation() throws Exception {
        String decisionId = evaluateCompliance();
        String body = "{\"intentId\":\"sanctioned-intent\",\"decisionId\":\"" + decisionId
                + "\",\"protocolModelVersion\":\"0.0.0-research-pending\",\"scenario\":{\"proposerCount\":4,"
                + "\"rejectingProposerCount\":1,\"submittedToAcceptingProposer\":true,\"psliceAvailable\":true,"
                + "\"attestationPercent\":100,\"leaderAttemptsExclusion\":true}}";

        postJson("/api/v1/experiments/constellation", body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.simulationOnly").value(true))
                .andExpect(jsonPath("$.explanationCodes[0]").value("MOCK_RESULT_NOT_PROTOCOL_VALIDATED"));

        doThrow(new UpstreamException(
                "constellation-simulator", 422, "UNSUPPORTED_VERSION", "not approved", false))
                .when(upstream).simulateConstellation(anyString(), any());
        postJson("/api/v1/experiments/constellation", body)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("UNSUPPORTED_VERSION"));

        postJson("/api/v1/experiments/constellation", body.replace("\"attestationPercent\":100",
                "\"attestationPercent\":-1"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void healthAndUnknownPath() throws Exception {
        mvc.perform(get("/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("OK"));
        mvc.perform(get("/api/v1/nope")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void researchBlockSkipIsValidatedSavedAndReloadedWithOriginalParameters() throws Exception {
        String decision = evaluateCompliance();
        ObjectNode request = (ObjectNode) fixture("constellation/research-below-participation-public-request.json");
        request.put("decisionId", decision);
        when(upstream.simulateConstellation(anyString(), any())).thenReturn(fixture("constellation/research-below-participation-result.json"));
        ResultActions execution = postJson("/api/v1/experiments/constellation", request.toString())
                .andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value("BLOCK_SKIPPED"))
                .andExpect(jsonPath("$.modelParameters.blockParticipationThresholdPercent").value(60));
        mvc.perform(get(execution.andReturn().getResponse().getHeader("Location")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.request.scenario.attesterParticipationPercent").value(59.99))
                .andExpect(jsonPath("$.result.blockStatus").value("SKIPPED"));
        ((ObjectNode) request.get("scenario")).remove("attesterParticipationPercent");
        postJson("/api/v1/experiments/constellation", request.toString()).andExpect(status().isBadRequest());
    }

    @Test
    void researchResponseWithoutPinnedParametersIsRejected() throws Exception {
        String decision = evaluateCompliance();
        ObjectNode request = (ObjectNode) fixture("constellation/research-boundary-public-request.json");
        request.put("decisionId", decision);
        ObjectNode response = (ObjectNode) fixture("constellation/research-boundary-result.json");
        response.remove("modelParameters");
        when(upstream.simulateConstellation(anyString(), any())).thenReturn(response);
        postJson("/api/v1/experiments/constellation", request.toString()).andExpect(status().isBadGateway());
    }

    // ---------- helpers ----------

    private String evaluateCompliance() throws Exception {
        String sender = createAnalysis(SENDER, "sender");
        String recipient = createAnalysis(RECIPIENT, "sanctioned");
        return read(postJson("/api/v1/compliance/evaluate", complianceRequest(sender, recipient))
                .andExpect(status().isOk())).get("decision").get("decisionId").textValue();
    }

    private String createAnalysis(String address, String fixtureId) throws Exception {
        return read(postJson("/api/v1/analyses", analysisRequest(address, fixtureId))
                .andExpect(status().isAccepted())).get("analysisId").textValue();
    }

    private static String analysisRequest(String address, String fixtureId) {
        return "{\"address\":\"" + address + "\",\"network\":\"mainnet-beta\",\"mode\":\"FIXTURE\",\"fixtureId\":\""
                + fixtureId + "\",\"scope\":{\"fromTime\":\"2026-11-01T00:00:00Z\","
                + "\"toTime\":\"2026-11-02T00:00:00Z\",\"maxTransactions\":100}}";
    }

    private static String complianceRequest(String senderAnalysisId, String recipientAnalysisId) {
        return "{\"intent\":{\"intentId\":\"sanctioned-intent\",\"network\":\"mainnet-beta\",\"sender\":\"" + SENDER
                + "\",\"recipient\":\"" + RECIPIENT + "\",\"asset\":{\"type\":\"SOL\",\"mint\":null,\"decimals\":9},"
                + "\"amountRaw\":\"1000000000\",\"requestedAt\":\"2026-11-02T00:00:00Z\"},"
                + "\"senderAnalysisId\":\"" + senderAnalysisId + "\",\"recipientAnalysisId\":\"" + recipientAnalysisId
                + "\",\"policyVersion\":\"1.0.0\"}";
    }

    private ResultActions postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode read(ResultActions actions) throws Exception {
        return mapper.readTree(actions.andReturn().getResponse().getContentAsString());
    }

    private JsonNode fixture(String name) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/fixtures/" + name)) {
            return mapper.readTree(in);
        }
    }
}
