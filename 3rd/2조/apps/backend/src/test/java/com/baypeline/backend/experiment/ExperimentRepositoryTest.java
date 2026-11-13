package com.baypeline.backend.experiment;

import static org.assertj.core.api.Assertions.*;

import com.baypeline.backend.support.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ExperimentRepositoryTest {
    @TempDir Path directory;
    final ObjectMapper mapper = new ObjectMapper();

    private ObjectNode record() throws Exception {
        ObjectNode review = mapper.createObjectNode().put("schemaVersion", "0.1.0").put("requestId", "review-request");
        ObjectNode intent = review.putObject("intent");
        intent.put("intentId", "sanctioned-intent").put("network", "mainnet-beta")
                .put("sender", "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi")
                .put("recipient", "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR")
                .put("amountRaw", "1000000000").put("requestedAt", "2026-11-02T00:00:00Z");
        intent.putObject("asset").put("type", "SOL").putNull("mint").put("decimals", 9);
        ObjectNode assessments = review.putObject("assessments");
        for (String role : new String[]{"sender", "recipient"}) {
            String path = "sender".equals(role) ? "sender/evaluation.json" : "sanctioned/evaluation.json";
            assessments.set(role, fixture(path));
        }
        review.set("decision", fixture("sanctioned/decision.json"));
        ObjectNode record = mapper.createObjectNode().put("schemaVersion", "0.1.0")
                .put("recordId", "record-" + UUID.randomUUID()).put("type", "GATEWAY")
                .put("requestId", "experiment-request").put("createdAt", "2026-11-02T00:00:00.000Z")
                .put("intentId", "sanctioned-intent").put("decisionId", review.get("decision").get("decisionId").asText());
        record.set("review", review);
        ObjectNode request = record.putObject("request");
        request.put("intentId", "sanctioned-intent").put("decisionId", record.get("decisionId").asText());
        request.putObject("route").put("routeId", "block").put("policyEnforced", true).put("warningAcknowledged", false);
        record.set("result", fixture("gateway/block-result.json"));
        return record;
    }

    private JsonNode fixture(String path) throws Exception {
        try (var stream = getClass().getResourceAsStream("/fixtures/" + path)) { return mapper.readTree(stream); }
    }

    @Test
    void survivesRepositoryRestartAndReturnsIndependentCopies() throws Exception {
        ExperimentRepository repository = new ExperimentRepository(mapper, directory.toString());
        ObjectNode expected = record();
        repository.save(expected);
        String id = expected.get("recordId").asText();
        ((ObjectNode) expected.get("result")).put("outcome", "CHANGED");
        ExperimentRepository restarted = new ExperimentRepository(mapper, directory.toString());
        ObjectNode loaded = restarted.find(id);
        assertThat(loaded.get("result").get("outcome").asText()).isEqualTo("SUBMISSION_REJECTED");
        loaded.put("intentId", "modified");
        assertThat(restarted.find(id).get("intentId").asText()).isEqualTo("sanctioned-intent");
    }

    @Test
    void concurrentExecutionsRemainDistinctAndPaginationHasNoDuplicates() throws Exception {
        ExperimentRepository repository = new ExperimentRepository(mapper, directory.toString());
        List<Callable<String>> writes = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            ObjectNode record = record();
            writes.add(() -> { repository.save(record); return record.get("recordId").asText(); });
        }
        var executor = Executors.newFixedThreadPool(4);
        try {
            var futures = executor.invokeAll(writes);
            for (var future : futures) assertThat(future.get()).startsWith("record-");
        } finally { executor.shutdownNow(); }
        var ids = new HashSet<String>();
        String cursor = null;
        do {
            JsonNode page = repository.list("GATEWAY", "sanctioned-intent", null, "3", cursor);
            for (JsonNode record : page.get("items")) assertThat(ids.add(record.get("recordId").asText())).isTrue();
            cursor = page.get("pagination").get("nextCursor").isNull() ? null : page.get("pagination").get("nextCursor").asText();
        } while (cursor != null);
        assertThat(ids).hasSize(12);
        String first = repository.list("GATEWAY", null, null, "1", null).get("pagination").get("nextCursor").asText();
        assertThatThrownBy(() -> repository.list(null, null, null, "1", first)).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).status().value()).isEqualTo(400));
    }

    @Test
    void failedWritesAreReportedAndDoNotPublishSuccessfulRecords() throws Exception {
        ExperimentRepository repository = new ExperimentRepository(mapper, directory.toString());
        Files.delete(directory);
        Files.writeString(directory, "not-a-directory");
        ObjectNode candidate = record();
        assertThatThrownBy(() -> repository.save(candidate)).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).status().value()).isEqualTo(503));
        assertThat(Files.readString(directory)).isEqualTo("not-a-directory");
    }

    @Test
    void corruptedFilesFailClosedAndMalformedIdsCannotReadOtherFiles() throws Exception {
        ExperimentRepository repository = new ExperimentRepository(mapper, directory.toString());
        ObjectNode record = record();
        repository.save(record);
        String id = record.get("recordId").asText();
        Files.writeString(directory.resolve(id + ".json"), "{secret-internal-data");
        assertThatThrownBy(() -> repository.find(id)).isInstanceOf(ApiException.class)
                .hasMessage("Experiment storage is unavailable");
        assertThatThrownBy(() -> repository.list(null, null, null, null, null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> repository.find("../outside")).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).status().value()).isEqualTo(404));
        assertThatThrownBy(() -> repository.list(null, null, null, "1001", null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> repository.list(null, null, null, "10", "")).isInstanceOf(ApiException.class);
    }
    @Test
    void researchParametersAndScenarioRemainReadableAfterRestart() throws Exception {
        ObjectNode record = record();
        record.set("request", fixture("constellation/research-below-participation-public-request.json"));
        ((ObjectNode)record.get("request")).put("decisionId", record.get("decisionId").asText());
        record.set("result", fixture("constellation/research-below-participation-result.json"));
        record.put("type", "CONSTELLATION");
        new ExperimentRepository(mapper, directory.toString()).save(record);
        var restored = new ExperimentRepository(mapper, directory.toString()).find(record.get("recordId").asText());
        assertThat(restored.get("result").get("blockStatus").asText()).isEqualTo("SKIPPED");
        assertThat(restored.get("request").get("scenario").get("attesterParticipationPercent").asDouble()).isEqualTo(59.99);
        assertThat(restored.get("result").get("modelParameters").get("psliceInclusionThresholdPercent").asInt()).isEqualTo(40);
    }

}
