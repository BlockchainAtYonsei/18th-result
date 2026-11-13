package com.baypeline.constellation;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "constellation.models.draft.attestation-threshold-percent=99")
@AutoConfigureMockMvc
class ResearchRulesApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    ObjectNode request() throws Exception {
        var r = (ObjectNode) Fixtures.fixture(mapper, "mock-request.json");
        r.put("protocolModelVersion", "0.2.0-research");
        ((ObjectNode)r.get("scenario")).put("attestationPercent",40).put("attesterParticipationPercent",60);
        return r;
    }
    @ParameterizedTest @CsvSource({"39.99,60,INCLUSION_NOT_ENFORCED,VALID", "40,60,INCLUSION_ENFORCED,INVALID_LEADER_EXCLUSION", "40,59.99,BLOCK_SKIPPED,SKIPPED", "50,60,INCLUSION_ENFORCED,INVALID_LEADER_EXCLUSION", "70,60,INVALID_SCENARIO,NOT_EVALUATED"})
    void publicShapeSeparatesBothRules(double pslice, double participation, String outcome, String block) throws Exception {
        var r=request();((ObjectNode)r.get("scenario")).put("attestationPercent",pslice).put("attesterParticipationPercent",participation);
        mvc.perform(post(Fixtures.PATH).contentType(MediaType.APPLICATION_JSON).content(r.toString()))
          .andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value(outcome)).andExpect(jsonPath("$.blockStatus").value(block))
          .andExpect(jsonPath("$.modelParameters.psliceInclusionThresholdPercent").value(40))
          .andExpect(jsonPath("$.modelParameters.blockParticipationThresholdPercent").value(60));
    }
    @ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings={"boundary","below-inclusion","below-participation","fifty-percent","inconsistent"})
    void matchesSharedResearchFixtures(String name) throws Exception {
        var r=Fixtures.fixture(mapper,"research-"+name+"-request.json");
        var response=mvc.perform(post(Fixtures.PATH).contentType(MediaType.APPLICATION_JSON).content(r.toString()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var actual=(ObjectNode)mapper.readTree(response);
        var expected=(ObjectNode)Fixtures.fixture(mapper,"research-"+name+"-result.json");
        actual.remove("simulationId"); expected.remove("simulationId");
        assertThat(actual).isEqualTo(expected);
    }
    @ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings={"-1","101","null","\"60\""})
    void rejectsInvalidParticipationTypesAndBounds(String value) throws Exception {
        String body=request().toString().replace("\"attesterParticipationPercent\":60", "\"attesterParticipationPercent\":"+value);
        mvc.perform(post(Fixtures.PATH).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
    }
    @Test void newModelDoesNotInferMissingParticipationAndRetiredModelDoesNotRun() throws Exception {
        var r=request(); ((ObjectNode)r.get("scenario")).remove("attesterParticipationPercent");
        mvc.perform(post(Fixtures.PATH).contentType(MediaType.APPLICATION_JSON).content(r.toString())).andExpect(status().isBadRequest());
        r.put("protocolModelVersion","0.1.0-draft");
        mvc.perform(post(Fixtures.PATH).contentType(MediaType.APPLICATION_JSON).content(r.toString())).andExpect(status().isUnprocessableEntity());
    }
    @Test void unavailableRequiredPsliceDoesNotBecomePermissionToExclude() throws Exception {
        var r=request(); ((ObjectNode)r.get("scenario")).put("psliceAvailable",false);
        mvc.perform(post(Fixtures.PATH).contentType(MediaType.APPLICATION_JSON).content(r.toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value("BLOCK_SKIPPED"))
            .andExpect(jsonPath("$.psliceInclusionEnforced").value(true)).andExpect(jsonPath("$.leaderExclusionValid").isEmpty());
    }
}
