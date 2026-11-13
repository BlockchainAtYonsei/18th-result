package com.baypeline.backend.cases;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"compliance.cases-dir=${java.io.tmpdir}/solana-cases-api-${random.uuid}",
        "compliance.experiments-dir=${java.io.tmpdir}/solana-cases-audit-${random.uuid}"})
@AutoConfigureMockMvc
class CaseApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    ObjectNode request() throws Exception {
        try (var in = getClass().getResourceAsStream("/fixtures/api/case-write.json")) { return (ObjectNode)mapper.readTree(in); }
    }
    @Test void exposesPersistentCrudAndRevisionConflictAsContractResponses() throws Exception {
        String body = request().toString();
        mvc.perform(put("/api/v1/cases/CL-0001").header("X-Request-ID", "case-create").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(header().string("X-Request-ID", "case-create"))
                .andExpect(jsonPath("$.revision").value(1)).andExpect(jsonPath("$.case.runs[0].compliance.decision.action").value("BLOCK"));
        mvc.perform(get("/api/v1/cases/CL-0001")).andExpect(status().isOk()).andExpect(jsonPath("$.case.id").value("CL-0001"));
        mvc.perform(get("/api/v1/cases")).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].revision").value(1));
        mvc.perform(put("/api/v1/cases/CL-0001").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("CONFLICT"));
        mvc.perform(delete("/api/v1/cases/CL-0001").param("revision", "1")).andExpect(status().isOk()).andExpect(jsonPath("$.deleted").value(true));
        mvc.perform(get("/api/v1/cases/CL-0001")).andExpect(status().isNotFound());
    }
    @Test void allowsConfiguredBrowserOriginsToSaveAndDelete() throws Exception {
        for (String method : new String[]{"PUT", "DELETE"}) {
            mvc.perform(options("/api/v1/cases/CL-0001").header("Origin", "http://localhost:5173")
                    .header("Access-Control-Request-Method", method)
                    .header("Access-Control-Request-Headers", "content-type,x-request-id"))
                    .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
        }
    }
    @Test void rejectsMalformedRequestsBeforePublication() throws Exception {
        var body = request(); ((ObjectNode)body.get("case")).put("extra", true);
        mvc.perform(put("/api/v1/cases/CL-0002").contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/v1/cases/CL-0002")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
        mvc.perform(get("/api/v1/cases/CL-0002")).andExpect(status().isNotFound());
    }
}
