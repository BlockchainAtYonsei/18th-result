package com.baypeline.backend.support;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigInteger;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

/** Cross-object checks that JSON Schema cannot express; no risk rules or policy actions are calculated here. */
public final class ContractSemantics {
    private ContractSemantics() {}

    private static void require(boolean valid) {
        if (!valid) throw new ApiException(HttpStatus.BAD_GATEWAY, "CONTRACT_VALIDATION_FAILED",
                "Internal response has inconsistent contract references", false);
    }

    private static Set<String> strings(JsonNode values) {
        Set<String> result = new HashSet<>();
        values.forEach(value -> result.add(value.asText()));
        return result;
    }

    public static void primitives(JsonNode value, int depth) {
        require(depth <= 64);
        if (value.isObject()) {
            if (value.has("subjectAddress") && value.has("detectedRules") && value.has("evidences")) evaluationSelf(value);
            if (value.has("snapshotId") && value.has("transfers") && value.has("labels") && value.has("coverage")) snapshot(value);
            if (value.has("fromTime") && value.has("toTime")
                    && !Instant.parse(value.get("fromTime").asText()).isBefore(Instant.parse(value.get("toTime").asText()))) {
                throw ApiException.invalid("fromTime must be before toTime");
            }
            if (value.has("intent") && value.has("assessments")) {
                JsonNode intent = value.get("intent"), assessments = value.get("assessments");
                for (String role : new String[]{"sender", "recipient"}) require(assessments.get(role).get("subjectAddress").equals(intent.get(role)));
                if (intent.get("sender").equals(intent.get("recipient"))) require(assessments.get("sender").equals(assessments.get("recipient")));
                if (value.has("decision")) {
                    require(value.get("decision").get("intentId").equals(intent.get("intentId")));
                    decision(value.get("decision"), intent, assessments);
                }
            }
            if (value.has("analysisId") && value.has("evaluation") && !value.get("evaluation").isNull()) {
                JsonNode evaluation = value.get("evaluation");
                require(value.get("address").equals(evaluation.get("subjectAddress")) && value.get("snapshotId").equals(evaluation.get("snapshotId")));
                require(evaluation.get("riskScore").isNull() == "PARTIAL".equals(value.get("coverage").get("status").asText()));
            }
            value.fields().forEachRemaining(field -> {
                String name = field.getKey();
                JsonNode node = field.getValue();
                if (Set.of("address", "subjectAddress", "sender", "recipient", "fromAddress", "toAddress",
                        "sourceAccount", "destinationAccount", "mint").contains(name) && node.isTextual()) {
                    Contract.address(node, name);
                }
                if ("signature".equals(name) && node.isTextual()) require(Contract.base58Size(node.asText()) == 64);
                if ("relatedAddresses".equals(name)) node.forEach(address -> Contract.address(address, name));
                if ("transactionSignatures".equals(name)) node.forEach(signature -> require(Contract.base58Size(signature.asText()) == 64));
            });
        }
        if (value.isContainerNode()) value.forEach(child -> primitives(child, depth + 1));
    }

    public static void experiment(JsonNode record) {
        JsonNode request = record.get("request"), result = record.get("result"), review = record.get("review");
        require(record.get("intentId").equals(request.get("intentId"))
                && record.get("intentId").equals(result.get("intentId"))
                && record.get("intentId").equals(review.get("intent").get("intentId"))
                && record.get("decisionId").equals(request.get("decisionId"))
                && record.get("decisionId").equals(review.get("decision").get("decisionId"))
                && record.get("intentId").equals(review.get("decision").get("intentId")));
        if ("GATEWAY".equals(record.get("type").asText())) {
            require(result.get("routeId").equals(request.get("route").get("routeId"))
                    && result.get("policyApplied").equals(request.get("route").get("policyEnforced")));
        } else {
            require(result.get("protocolModelVersion").equals(request.get("protocolModelVersion")));
        }
        decision(review.get("decision"), review.get("intent"), review.get("assessments"));
    }

    public static void snapshot(JsonNode snapshot) {
        JsonNode coverage = snapshot.get("coverage");
        Instant from = Instant.parse(coverage.get("fromTime").asText());
        Instant to = Instant.parse(coverage.get("toTime").asText());
        require(from.isBefore(to));
        Set<String> ids = new HashSet<>(), positions = new HashSet<>(), labels = new HashSet<>();
        Map<String, String> metadata = new HashMap<>(), decimals = new HashMap<>();
        for (JsonNode transfer : snapshot.get("transfers")) {
            require(ids.add(transfer.get("id").asText()));
            String signature = transfer.get("signature").asText();
            require(positions.add(signature + ":" + transfer.get("instructionIndex").bigIntegerValue() + ":"
                    + (transfer.get("innerInstructionIndex").isNull() ? "null" : transfer.get("innerInstructionIndex").bigIntegerValue()) + ":" + transfer.get("transferOrdinal").bigIntegerValue()));
            boolean resolved = !transfer.get("fromAddress").isNull() && !transfer.get("toAddress").isNull();
            require(transfer.get("ownerResolved").asBoolean() == resolved);
            Set<String> reasons = strings(coverage.get("reasons"));
            if (!resolved) require(reasons.contains("OWNER_UNRESOLVED"));
            if (transfer.get("timestamp").isNull()) require(reasons.contains("TIMESTAMP_UNAVAILABLE"));
            else {
                Instant timestamp = Instant.parse(transfer.get("timestamp").asText());
                require(!timestamp.isBefore(from) && timestamp.isBefore(to));
            }
            if (!coverage.get("snapshotSlot").isNull()) require(transfer.get("slot").bigIntegerValue()
                    .compareTo(coverage.get("snapshotSlot").bigIntegerValue()) <= 0);
            String txMeta = transfer.get("slot").bigIntegerValue() + ":" + transfer.get("timestamp");
            require(!metadata.containsKey(signature) || metadata.get(signature).equals(txMeta));
            metadata.put(signature, txMeta);
            JsonNode asset = transfer.get("asset");
            String key = asset.get("type") + ":" + asset.get("mint");
            String value = asset.get("decimals").bigIntegerValue().toString();
            require(!decimals.containsKey(key) || decimals.get(key).equals(value));
            decimals.put(key, value);
            if ("SOL".equals(asset.get("type").asText())) {
                require(transfer.get("sourceAccount").equals(transfer.get("fromAddress"))
                        && transfer.get("destinationAccount").equals(transfer.get("toAddress")));
            }
        }
        require(coverage.get("transferCount").bigIntegerValue().equals(BigInteger.valueOf(ids.size())));
        require(coverage.get("transactionCount").bigIntegerValue().compareTo(BigInteger.valueOf(metadata.size())) >= 0);
        for (JsonNode label : snapshot.get("labels")) {
            require(labels.add(label.get("address") + ":" + label.get("source") + ":" + label.get("referenceId")));
            require(label.get("network").equals(snapshot.get("network"))
                    && label.get("source").equals(snapshot.get("labelDataset").get("source")));
        }
    }

    public static void evaluation(JsonNode snapshot, JsonNode evaluation) {
        Map<String, JsonNode> transfers = new HashMap<>(), evidences = new HashMap<>();
        snapshot.get("transfers").forEach(t -> transfers.put(t.get("id").asText(), t));
        Set<String> labels = new HashSet<>();
        snapshot.get("labels").forEach(l -> labels.add(l.get("referenceId").asText()));
        for (JsonNode evidence : evaluation.get("evidences")) {
            require(evidences.put(evidence.get("evidenceId").asText(), evidence) == null);
            require(strings(evidence.get("relatedAddresses")).contains(evaluation.get("subjectAddress").asText()));
            JsonNode source = evidence.get("source");
            for (String field : new String[]{"snapshotId", "network", "mode", "dataProvenance", "labelDataset"}) {
                require(source.get(field).equals(snapshot.get(field)));
            }
            require(labels.containsAll(strings(evidence.get("labelReferenceIds"))));
            Set<String> signatures = new HashSet<>();
            for (String id : strings(evidence.get("transferIds"))) {
                require(transfers.containsKey(id));
                signatures.add(transfers.get(id).get("signature").asText());
            }
            require(signatures.equals(strings(evidence.get("transactionSignatures"))));
        }
        evaluationSelf(evaluation);
    }

    private static void evaluationSelf(JsonNode evaluation) {
        Map<String, JsonNode> evidences = new HashMap<>();
        Set<String> used = new HashSet<>(), rules = new HashSet<>();
        for (JsonNode evidence : evaluation.get("evidences")) {
            require(evidences.put(evidence.get("evidenceId").asText(), evidence) == null);
            require(evidence.get("source").get("snapshotId").equals(evaluation.get("snapshotId")));
            require(strings(evidence.get("relatedAddresses")).contains(evaluation.get("subjectAddress").asText()));
        }
        int sum = 0;
        for (JsonNode rule : evaluation.get("detectedRules")) {
            require(rules.add(rule.get("ruleId").asText()));
            sum += rule.get("scoreContribution").asInt();
            for (String id : strings(rule.get("evidenceIds"))) {
                require(evidences.containsKey(id));
                used.add(id);
                JsonNode evidence = evidences.get(id);
                String kind = evidence.get("type").asText();
                switch (rule.get("ruleId").asText()) {
                    case "SANCTION_EXACT" -> require("ADDRESS_LABEL".equals(kind) && !evidence.get("labelReferenceIds").isEmpty());
                    case "SANCTION_DIRECT_FLOW" -> require("DIRECT_FLOW".equals(kind) && !evidence.get("labelReferenceIds").isEmpty()
                            && !evidence.get("transferIds").isEmpty() && !evidence.get("transactionSignatures").isEmpty());
                    default -> {
                        require("TEMPORAL_PATTERN".equals(kind) && evidence.get("transferIds").size() >= 2);
                        if ("RAPID_REPEAT".equals(rule.get("ruleId").asText())) require(evidence.get("transactionSignatures").size() >= 2);
                    }
                }
            }
        }
        require(used.equals(evidences.keySet()));
        if (!evaluation.get("riskScore").isNull()) require(evaluation.get("riskScore").asInt() == Math.min(100, sum));
    }

    public static void decision(JsonNode decision, JsonNode intent, JsonNode assessments) {
        Set<String> known = new HashSet<>();
        Map<String, JsonNode> evidenceById = new HashMap<>();
        assessments.forEach(assessment -> assessment.get("evidences").forEach(evidence -> {
            String id = evidence.get("evidenceId").asText();
            JsonNode previous = evidenceById.put(id, evidence);
            require(previous == null || previous.equals(evidence));
            known.add(id);
        }));
        require(known.containsAll(strings(decision.get("referencedEvidenceIds"))));
        require(Instant.parse(decision.get("evaluatedAt").asText()).equals(Instant.parse(intent.get("requestedAt").asText())));
        boolean partial = assessments.get("sender").get("riskScore").isNull() || assessments.get("recipient").get("riskScore").isNull();
        require(decision.get("riskScore").isNull() == partial && decision.get("riskLevel").isNull() == partial);
        if (!partial) {
            int score = Math.max(assessments.get("sender").get("riskScore").asInt(), assessments.get("recipient").get("riskScore").asInt());
            require(decision.get("riskScore").asInt() == score);
            Map<String, Integer> levels = Map.of("LOW", 0, "MEDIUM", 1, "HIGH", 2);
            int expected = Math.max(levels.get(assessments.get("sender").get("riskLevel").asText()), levels.get(assessments.get("recipient").get("riskLevel").asText()));
            require(levels.get(decision.get("riskLevel").asText()) == expected);
        }
    }
}
