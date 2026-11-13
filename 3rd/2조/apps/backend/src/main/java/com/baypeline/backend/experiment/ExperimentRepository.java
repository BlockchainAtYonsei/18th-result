package com.baypeline.backend.experiment;

import com.baypeline.backend.support.ApiException;
import com.baypeline.backend.support.Contract;
import com.baypeline.backend.support.ContractSemantics;
import com.baypeline.backend.support.JsonContracts;
import com.baypeline.backend.support.StableIds;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.time.Instant;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;

/** One immutable JSON audit record per execution. Atomic publication prevents partial reads. */
@Repository
public class ExperimentRepository {
    private static final Pattern ID = Pattern.compile("record-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final Comparator<JsonNode> ORDER = Comparator
            .comparing((JsonNode n) -> Instant.parse(n.get("createdAt").asText()))
            .thenComparing(n -> n.get("recordId").asText()).reversed();
    private final Path directory;
    private final ObjectMapper mapper;

    public ExperimentRepository(ObjectMapper mapper,
            @Value("${compliance.experiments-dir:.local-data/experiments}") String directory) {
        this.mapper = mapper;
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        try { Files.createDirectories(this.directory); }
        catch (IOException e) { throw new IllegalStateException("Cannot initialize experiment storage", e); }
    }

    public void save(ObjectNode record) {
        JsonContracts.validate("api", "ExperimentRecord", record);
        ContractSemantics.experiment(record);
        String id = record.get("recordId").asText();
        if (!ID.matcher(id).matches()) throw new IllegalArgumentException("Invalid internal record ID");
        Path temp = null;
        try {
            temp = Files.createTempFile(directory, ".record-", ".tmp");
            mapper.writeValue(temp.toFile(), record);
            // A record becomes queryable only after the complete write has succeeded.
            Files.move(temp, directory.resolve(id + ".json"), StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            throw storageFailure();
        } catch (IOException e) {
            throw storageFailure();
        } finally {
            if (temp != null) try { Files.deleteIfExists(temp); } catch (IOException ignored) { /* unpublished file */ }
        }
    }

    public ObjectNode find(String id) {
        if (!ID.matcher(id).matches() || !Files.isRegularFile(directory.resolve(id + ".json"))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Experiment record not found", false);
        }
        return read(directory.resolve(id + ".json"));
    }

    public ObjectNode list(String type, String intentId, String decisionId, String limitParam, String cursor) {
        if (type != null && !Set.of("GATEWAY", "CONSTELLATION").contains(type)) throw ApiException.invalid("Invalid experiment type");
        if (intentId != null && intentId.isEmpty() || decisionId != null && decisionId.isEmpty()) throw ApiException.invalid("Empty experiment filter");
        int limit = 100;
        if (limitParam != null) {
            if (!limitParam.matches("[1-9][0-9]{0,3}")) throw ApiException.invalid("limit must be between 1 and 1000");
            limit = Integer.parseInt(limitParam);
            if (limit > 1000) throw ApiException.invalid("limit must be between 1 and 1000");
        }
        ObjectNode filters = mapper.createObjectNode();
        filters.put("type", type); filters.put("intentId", intentId); filters.put("decisionId", decisionId);
        String scope = StableIds.of("filter", filters);
        JsonNode after = cursor == null ? null : decode(cursor, scope);
        List<JsonNode> records = new ArrayList<>();
        try (var files = Files.list(directory)) {
            files.filter(p -> p.getFileName().toString().endsWith(".json")).forEach(file -> {
                ObjectNode record = read(file);
                if ((type == null || type.equals(record.get("type").asText()))
                        && (intentId == null || intentId.equals(record.get("intentId").asText()))
                        && (decisionId == null || decisionId.equals(record.get("decisionId").asText()))
                        && (after == null || ORDER.compare(record, after) > 0)) records.add(record);
            });
        } catch (IOException e) { throw storageFailure(); }
        records.sort(ORDER);
        ObjectNode page = mapper.createObjectNode().put("schemaVersion", Contract.SCHEMA_VERSION);
        var items = page.putArray("items");
        records.stream().limit(limit).forEach(items::add);
        ObjectNode pagination = page.putObject("pagination").put("limit", limit);
        if (records.size() <= limit) pagination.putNull("nextCursor");
        else {
            JsonNode last = items.get(items.size() - 1);
            ObjectNode key = mapper.createObjectNode().put("version", 1).put("scope", scope)
                    .put("createdAt", last.get("createdAt").asText()).put("recordId", last.get("recordId").asText());
            pagination.put("nextCursor", Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(key.toString().getBytes(StandardCharsets.UTF_8)));
        }
        return page;
    }

    private JsonNode decode(String cursor, String scope) {
        try {
            if (cursor.length() > 1024) throw new IllegalArgumentException();
            JsonNode key = mapper.readTree(Base64.getUrlDecoder().decode(cursor));
            if (key == null || !key.isObject() || key.size() != 4 || !key.path("version").isInt() || key.path("version").asInt() != 1
                    || !scope.equals(key.path("scope").asText()) || !ID.matcher(key.path("recordId").asText()).matches()) {
                throw new IllegalArgumentException();
            }
            Contract.timestamp(key.get("createdAt"), "cursor.createdAt");
            return key;
        } catch (IOException | IllegalArgumentException | ApiException e) { throw ApiException.invalid("Invalid experiment cursor"); }
    }

    private ObjectNode read(Path file) {
        try {
            JsonNode record = mapper.readTree(file.toFile());
            JsonContracts.validate("api", "ExperimentRecord", record);
            ContractSemantics.experiment(record);
            if (!file.getFileName().toString().equals(record.get("recordId").asText() + ".json")) throw storageFailure();
            return (ObjectNode) record;
        } catch (IOException | ApiException e) { throw storageFailure(); }
    }

    private static ApiException storageFailure() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "UPSTREAM_UNAVAILABLE", "Experiment storage is unavailable", true);
    }
}
