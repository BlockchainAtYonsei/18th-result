package com.baypeline.backend.cases;

import static org.assertj.core.api.Assertions.*;
import com.baypeline.backend.support.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CaseRepositoryTest {
    @TempDir Path directory;
    final ObjectMapper mapper = new ObjectMapper();
    ObjectNode request(String id, long revision) throws Exception {
        try (var in = getClass().getResourceAsStream("/fixtures/api/case-write.json")) {
            ObjectNode body = (ObjectNode) mapper.readTree(in);
            body.put("expectedRevision", revision);
            ((ObjectNode) body.get("case")).put("id", id);
            return body;
        }
    }
    @Test void recoversFullCaseAfterRestartAndDeletesWithRevision() throws Exception {
        var repository = new CaseRepository(mapper, directory.toString());
        var saved = repository.put("CL-0001", request("CL-0001", 0));
        var restarted = new CaseRepository(mapper, directory.toString());
        assertThat(restarted.get("CL-0001")).isEqualTo(mapper.readTree(saved.toString()));
        var next = restarted.put("CL-0001", request("CL-0001", 1));
        assertThat(next.get("revision").asLong()).isEqualTo(2);
        assertThatThrownBy(() -> restarted.delete("CL-0001", 1)).isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException)e).status().value()).isEqualTo(409);
        restarted.delete("CL-0001", 2);
        assertThat(restarted.list(null).get("items")).isEmpty();
        assertThatThrownBy(() -> restarted.get("CL-0001")).isInstanceOf(ApiException.class);
    }
    @Test void concurrentBrowsersCannotOverwriteOneAnother() throws Exception {
        var repository = new CaseRepository(mapper, directory.toString());
        repository.put("CL-0001", request("CL-0001", 0));
        Callable<Integer> update = () -> {
            try { repository.put("CL-0001", request("CL-0001", 1)); return 200; }
            catch (ApiException e) { return e.status().value(); }
        };
        var executor = Executors.newFixedThreadPool(2);
        try {
            var results = executor.invokeAll(List.of(update, update));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(200, 409);
        } finally { executor.shutdownNow(); }
        assertThat(repository.get("CL-0001").get("revision").asLong()).isEqualTo(2);
    }
    @Test void validatesNestedContractsAndProtectsFilePaths() throws Exception {
        var repository = new CaseRepository(mapper, directory.toString());
        var invalid = request("CL-0001", 0);
        ((ObjectNode)invalid.get("case").get("runs").get(0).get("recipient").get("result").get("evaluation")).put("riskScore", 999);
        assertThatThrownBy(() -> repository.put("CL-0001", invalid)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> repository.put("CL-0002", request("CL-0001", 0))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> repository.get("../../secret")).isInstanceOf(ApiException.class);
        assertThat(repository.list(null).get("items")).isEmpty();
        repository.put("CL-0001", request("CL-0001", 0));
        Files.writeString(directory.resolve("CL-0001.json"), "{}");
        assertThatThrownBy(() -> repository.get("CL-0001")).isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException)e).status().value()).isEqualTo(503);
        assertThatThrownBy(() -> repository.list(null)).isInstanceOf(ApiException.class);
    }
    @Test void pagesEveryCaseWithoutDuplicates() throws Exception {
        var repository = new CaseRepository(mapper, directory.toString());
        for (int i=0; i<102; i++) { String id = "CL-" + String.format("%04d", i); repository.put(id, request(id, 0)); }
        var page = repository.list(null);
        assertThat(page.get("items").size()).isEqualTo(100);
        var next = repository.list(page.get("nextCursor").asText());
        assertThat(next.get("items").size()).isEqualTo(2);
        assertThat(next.get("nextCursor").isNull()).isTrue();
    }
}
