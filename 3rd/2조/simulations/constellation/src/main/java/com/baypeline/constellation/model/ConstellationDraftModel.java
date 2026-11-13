package com.baypeline.constellation.model;

import com.baypeline.constellation.Scenario;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/** Team research v1: aggregate participation >=60%, target pslice attestation >=40%.
 * Constants are pinned to a new model version; environment variables cannot change its meaning.
 */
public final class ConstellationDraftModel implements ProtocolModel {
    public static final String VERSION = "0.2.0-research";
    public static final BigDecimal INCLUSION = new BigDecimal("40");
    public static final BigDecimal PARTICIPATION = new BigDecimal("60");
    @Override public String version() { return VERSION; }

    @Override public Judgement judge(Scenario s) {
        Judgement noPath = ProposerPath.check(s);
        boolean path = noPath == null;
        if (s.attesterParticipationPercent().compareTo(PARTICIPATION) < 0) {
            return new Judgement(path, false, null, "BLOCK_SKIPPED", List.of("BLOCK_PARTICIPATION_BELOW_THRESHOLD"));
        }
        if (!path) return noPath;
        List<String> codes = new ArrayList<>();
        codes.add("BLOCK_PARTICIPATION_THRESHOLD_MET");
        boolean attested = s.attestationPercent().compareTo(INCLUSION) >= 0;
        codes.add(attested ? "ATTESTATION_CONDITION_MET" : "ATTESTATION_CONDITION_NOT_MET");
        if (attested && !s.psliceAvailable()) {
            codes.add("REQUIRED_PSLICE_UNAVAILABLE");
            return new Judgement(true, true, null, "BLOCK_SKIPPED", codes);
        }
        Boolean exclusion = null;
        if (!s.leaderAttemptsExclusion()) codes.add("NO_EXCLUSION_ATTEMPT");
        else {
            exclusion = !attested;
            codes.add(attested ? "LEADER_EXCLUSION_INVALID" : "LEADER_EXCLUSION_VALID");
        }
        return new Judgement(true, attested, exclusion, attested ? "INCLUSION_ENFORCED" : "INCLUSION_NOT_ENFORCED", codes);
    }
}
