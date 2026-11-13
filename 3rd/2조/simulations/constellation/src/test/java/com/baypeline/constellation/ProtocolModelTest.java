package com.baypeline.constellation;

import static org.assertj.core.api.Assertions.assertThat;
import com.baypeline.constellation.model.ConstellationDraftModel;
import com.baypeline.constellation.model.Judgement;
import com.baypeline.constellation.model.SingleLeaderBaselineModel;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ProtocolModelTest {
    final ConstellationDraftModel research = new ConstellationDraftModel();
    final SingleLeaderBaselineModel baseline = new SingleLeaderBaselineModel("0.2.0-single-leader");
    static Scenario scenario(int p, int r, boolean submitted, boolean pslice, String attestation, String participation, boolean exclusion) {
        return new Scenario(p, r, submitted, pslice, new BigDecimal(attestation), exclusion, new BigDecimal(participation));
    }
    @ParameterizedTest
    @CsvSource({
        "39.99,59.99,BLOCK_SKIPPED,false", "40,59.99,BLOCK_SKIPPED,false", "50,59.99,BLOCK_SKIPPED,false",
        "39.99,60,INCLUSION_NOT_ENFORCED,false", "40,60,INCLUSION_ENFORCED,true", "40.01,60,INCLUSION_ENFORCED,true",
        "50,60,INCLUSION_ENFORCED,true", "39.99,60.01,INCLUSION_NOT_ENFORCED,false", "40,60.01,INCLUSION_ENFORCED,true",
        "100,100,INCLUSION_ENFORCED,true", "0,0,BLOCK_SKIPPED,false", "0,100,INCLUSION_NOT_ENFORCED,false"
    })
    void separatesBothThresholdsAtTheirBoundaries(String attestation, String participation, String outcome, boolean enforced) {
        Judgement j = research.judge(scenario(16, 15, true, true, attestation, participation, true));
        assertThat(j.outcome()).isEqualTo(outcome);
        assertThat(j.proposerPathAvailable()).isTrue();
        assertThat(j.psliceInclusionEnforced()).isEqualTo(enforced);
        assertThat(j.leaderExclusionValid()).isEqualTo(outcome.equals("BLOCK_SKIPPED") ? null : !enforced);
    }
    @Test void pathAndAvailabilityAreSeparateFromBlockParticipation() {
        assertThat(research.judge(scenario(16,16,false,true,"40","60",true)).outcome()).isEqualTo("NO_SUBMISSION_PATH");
        assertThat(research.judge(scenario(16,15,false,true,"40","60",true)).outcome()).isEqualTo("NO_SUBMISSION_PATH");
        var skipped = research.judge(scenario(16,16,false,true,"40","59.99",true));
        assertThat(skipped.outcome()).isEqualTo("BLOCK_SKIPPED");
        assertThat(skipped.proposerPathAvailable()).isFalse();
        var unavailable = research.judge(scenario(16,15,true,false,"40","60",true));
        assertThat(unavailable.outcome()).isEqualTo("BLOCK_SKIPPED");
        assertThat(unavailable.psliceInclusionEnforced()).isTrue();
        assertThat(unavailable.leaderExclusionValid()).isNull();
        assertThat(unavailable.explanationCodes()).contains("REQUIRED_PSLICE_UNAVAILABLE");
        assertThat(research.judge(scenario(16,15,true,false,"39.99","60",true)).outcome()).isEqualTo("INCLUSION_NOT_ENFORCED");
    }
    @Test void noExclusionAttemptIsNotAnInvalidExclusion() {
        assertThat(research.judge(scenario(16,15,true,true,"40","60",false)).leaderExclusionValid()).isNull();
    }
    @Test void baselineDoesNotApplyConstellationAttestationRules() {
        var s = scenario(16,15,true,true,"40","59.99",true);
        assertThat(baseline.judge(s).outcome()).isEqualTo("INCLUSION_NOT_ENFORCED");
        assertThat(baseline.judge(s).leaderExclusionValid()).isTrue();
        assertThat(research.judge(s).outcome()).isEqualTo("BLOCK_SKIPPED");
    }
}
