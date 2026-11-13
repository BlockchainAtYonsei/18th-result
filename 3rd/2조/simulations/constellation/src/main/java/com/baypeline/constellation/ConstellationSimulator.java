package com.baypeline.constellation;

import com.baypeline.constellation.model.Judgement;
import com.baypeline.constellation.model.MockDisplayModel;
import com.baypeline.constellation.model.ProtocolModel;
import com.baypeline.constellation.support.ApiException;
import com.baypeline.constellation.support.Contract;
import com.baypeline.constellation.support.StableIds;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * ConstellationSimulationRequest → ConstellationSimulationResult.
 *
 * <p>처리 순서
 * <ol>
 *   <li>구조 검증 (attestationPercent 0~100, 음수·타입 오류 → 400)</li>
 *   <li>protocolModelVersion 확인: 등록되지 않은 버전 → 422 UNSUPPORTED_VERSION</li>
 *   <li>구조상 유효하지만 모순된 시나리오 → INVALID_SCENARIO (모델과 무관한 정의상 모순만 검출)</li>
 *   <li>등록된 {@link ProtocolModel}에 판정 위임</li>
 * </ol>
 *
 * <p>attestationPercent 임계값, pslice 가용성과 포함 강제의 관계, 리더 제외 유효성,
 * 단일 리더 비교 규칙은 버전별 모델에 위임한다. 새 연구 버전은 출처와 고정 기준도 반환한다.
 */
@Component
public class ConstellationSimulator {

    private static final JsonNodeFactory JSON = JsonNodeFactory.instance;
    static final Set<String> EXPLANATIONS = Set.of("NO_ACCEPTING_PROPOSER", "NOT_SUBMITTED_TO_ACCEPTING_PROPOSER",
            "PSLICE_UNAVAILABLE", "ATTESTATION_CONDITION_NOT_MET", "ATTESTATION_CONDITION_MET",
            "LEADER_EXCLUSION_VALID", "LEADER_EXCLUSION_INVALID", "NO_EXCLUSION_ATTEMPT",
            "REJECTING_COUNT_EXCEEDS_TOTAL", "CONTRADICTORY_SUBMISSION_PATH", MockDisplayModel.EXPLANATION, "BLOCK_PARTICIPATION_BELOW_THRESHOLD", "BLOCK_PARTICIPATION_THRESHOLD_MET",
            "PSLICE_ATTESTATION_EXCEEDS_PARTICIPATION", "REQUIRED_PSLICE_UNAVAILABLE");

    private final Map<String, ProtocolModel> models;

    public ConstellationSimulator(ObjectProvider<ProtocolModel> approvedModels,
            @Value("${constellation.mock.enabled:false}") boolean mockEnabled,
            @Value("${constellation.mock.version:0.0.0-research-pending}") String mockVersion) {
        Map<String, ProtocolModel> registry = new LinkedHashMap<>();
        for (ProtocolModel model : approvedModels.orderedStream().toList()) {
            if (registry.put(model.version(), model) != null) {
                throw new IllegalStateException("Duplicate protocol model version " + model.version());
            }
        }
        if (mockEnabled) {
            registry.putIfAbsent(mockVersion, new MockDisplayModel(mockVersion));
        }
        this.models = Collections.unmodifiableMap(registry);
    }

    public List<String> supportedVersions() {
        return new ArrayList<>(models.keySet());
    }

    public ObjectNode simulate(JsonNode request) {
        Contract.object(request, "request",
                List.of("requestId", "intentId", "decisionId", "protocolModelVersion", "scenario"), List.of());
        Contract.id(request.get("requestId"), "request.requestId");
        String intentId = Contract.id(request.get("intentId"), "request.intentId");
        String decisionId = Contract.id(request.get("decisionId"), "request.decisionId");
        String version = Contract.version(request.get("protocolModelVersion"), "request.protocolModelVersion");
        Scenario scenario = Scenario.parse(request.get("scenario"), "request.scenario");

        ProtocolModel model = models.get(version);
        if (model == null) {
            throw ApiException.unsupportedVersion("protocolModelVersion " + version + " is not registered");
        }

        boolean research = version.startsWith("0.2.0-");
        if (research && scenario.attesterParticipationPercent() == null) {
            throw ApiException.contract("scenario.attesterParticipationPercent is required for this model");
        }
        Judgement judgement = contradiction(scenario);
        if (judgement == null && research && scenario.attestationPercent().compareTo(scenario.attesterParticipationPercent()) > 0) {
            judgement = new Judgement(false, false, null, "INVALID_SCENARIO", List.of("PSLICE_ATTESTATION_EXCEEDS_PARTICIPATION"));
        }
        if (judgement == null) {
            judgement = model.judge(scenario);
        }
        for (String code : judgement.explanationCodes()) {
            if (!EXPLANATIONS.contains(code)) {
                throw new IllegalStateException("Model returned unknown explanation code " + code);
            }
        }

        ObjectNode identity = JSON.objectNode();
        identity.put("intentId", intentId);
        identity.put("decisionId", decisionId);
        identity.put("protocolModelVersion", version);
        identity.set("scenario", request.get("scenario").deepCopy());

        ObjectNode result = JSON.objectNode();
        result.put("schemaVersion", Contract.SCHEMA_VERSION);
        result.put("simulationId", StableIds.of("simulation", identity));
        result.put("intentId", intentId);
        result.put("protocolModelVersion", version);
        result.put("proposerPathAvailable", judgement.proposerPathAvailable());
        result.put("psliceInclusionEnforced", judgement.psliceInclusionEnforced());
        if (judgement.leaderExclusionValid() == null) {
            result.putNull("leaderExclusionValid");
        } else {
            result.put("leaderExclusionValid", judgement.leaderExclusionValid());
        }
        result.put("outcome", judgement.outcome());
        ArrayNode codes = result.putArray("explanationCodes");
        judgement.explanationCodes().forEach(codes::add);
        if (research) {
            String blockStatus = "INVALID_SCENARIO".equals(judgement.outcome()) || version.endsWith("single-leader")
                    ? "NOT_EVALUATED" : "BLOCK_SKIPPED".equals(judgement.outcome()) ? "SKIPPED"
                    : Boolean.FALSE.equals(judgement.leaderExclusionValid()) ? "INVALID_LEADER_EXCLUSION" : "VALID";
            result.put("blockStatus", blockStatus);
            if ("0.2.0-research".equals(version)) result.putObject("modelParameters")
                    .put("sourceId", "team-research-40-60-v1").put("psliceInclusionThresholdPercent", 40)
                    .put("blockParticipationThresholdPercent", 60);
        }
        result.put("simulationOnly", true);
        return result;
    }

    /**
     * 프로토콜 규칙과 무관하게 시나리오 자체가 성립하지 않는 경우.
     * 거절 제안자가 전체보다 많거나, 수락 제안자가 없는데 수락 제안자에게 제출했다고 하는 경우.
     */
    static Judgement contradiction(Scenario scenario) {
        if (scenario.rejectingProposerCount() > scenario.proposerCount()) {
            return new Judgement(false, false, null, "INVALID_SCENARIO", List.of("REJECTING_COUNT_EXCEEDS_TOTAL"));
        }
        if (scenario.submittedToAcceptingProposer() && scenario.acceptingProposerCount() == 0) {
            return new Judgement(false, false, null, "INVALID_SCENARIO", List.of("CONTRADICTORY_SUBMISSION_PATH"));
        }
        return null;
    }
}
