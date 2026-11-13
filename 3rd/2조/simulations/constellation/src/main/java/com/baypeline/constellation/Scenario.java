package com.baypeline.constellation;

import com.baypeline.constellation.support.Contract;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.List;

/** Legacy archives omit participation; executable research versions require it explicitly. */
public record Scenario(int proposerCount, int rejectingProposerCount, boolean submittedToAcceptingProposer,
        boolean psliceAvailable, BigDecimal attestationPercent, boolean leaderAttemptsExclusion,
        BigDecimal attesterParticipationPercent) {
    public static Scenario parse(JsonNode node, String path) {
        Contract.object(node, path, List.of("proposerCount", "rejectingProposerCount", "submittedToAcceptingProposer",
                "psliceAvailable", "attestationPercent", "leaderAttemptsExclusion"), List.of("attesterParticipationPercent"));
        return new Scenario((int) Contract.integer(node.get("proposerCount"), path + ".proposerCount", 1, Integer.MAX_VALUE),
                (int) Contract.integer(node.get("rejectingProposerCount"), path + ".rejectingProposerCount", 0, Integer.MAX_VALUE),
                Contract.bool(node.get("submittedToAcceptingProposer"), path + ".submittedToAcceptingProposer"),
                Contract.bool(node.get("psliceAvailable"), path + ".psliceAvailable"),
                percent(node.get("attestationPercent"), path + ".attestationPercent"),
                Contract.bool(node.get("leaderAttemptsExclusion"), path + ".leaderAttemptsExclusion"),
                node.has("attesterParticipationPercent") ? percent(node.get("attesterParticipationPercent"), path + ".attesterParticipationPercent") : null);
    }
    private static BigDecimal percent(JsonNode node, String path) {
        Contract.number(node, path, 0, 100);
        return node.decimalValue();
    }
    public int acceptingProposerCount() { return proposerCount - rejectingProposerCount; }
}
