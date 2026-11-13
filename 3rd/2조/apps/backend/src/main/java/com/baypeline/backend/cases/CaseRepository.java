package com.baypeline.backend.cases;

import com.baypeline.backend.support.ApiException;
import com.baypeline.backend.support.Contract;
import com.baypeline.backend.support.JsonContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;

/** Mutable dashboard snapshots, separate from immutable server experiment audit records.
 * Single Backend process: synchronized revision checks prevent competing browsers losing updates.
 */
@Repository
public class CaseRepository {
    private static final Pattern ID = Pattern.compile("CL-[0-9]{1,40}");
    private final ObjectMapper mapper;
    private final Path directory;

    public CaseRepository(ObjectMapper mapper, @Value("${compliance.cases-dir:.local-data/cases}") String directory) {
        this.mapper = mapper;
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        try { Files.createDirectories(this.directory); }
        catch (IOException e) { throw new IllegalStateException("Cannot initialize case storage", e); }
    }

    public synchronized ObjectNode get(String id) {
        Path file = file(id);
        if (!Files.exists(file)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Case not found", false);
        return read(file);
    }

    public synchronized ObjectNode list(String cursor) {
        if (cursor != null) file(cursor);
        try (var stream = Files.list(directory)) {
            List<Path> paths = stream.filter(p -> p.getFileName().toString().endsWith(".json"))
                    .filter(p -> cursor == null || p.getFileName().toString().compareTo(cursor + ".json") > 0)
                    .sorted(Comparator.comparing(p -> p.getFileName().toString())).limit(101).toList();
            ObjectNode result = mapper.createObjectNode().put("schemaVersion", Contract.SCHEMA_VERSION);
            var items = result.putArray("items");
            paths.stream().limit(100).forEach(p -> items.add(read(p)));
            if (paths.size() > 100) result.put("nextCursor", items.get(99).get("case").get("id").asText());
            else result.putNull("nextCursor");
            return result;
        } catch (IOException e) { throw unavailable(); }
    }

    public synchronized ObjectNode put(String id, JsonNode request) {
        JsonContracts.request("api", "CaseWrite", request);
        Path target = file(id);
        if (!id.equals(request.path("case").path("id").asText())) throw ApiException.invalid("Case ID differs from path");
        long current = Files.exists(target) ? read(target).get("revision").asLong() : 0;
        if (request.get("expectedRevision").asLong() != current) throw conflict();
        if (current >= 9007199254740991L) throw conflict();
        ObjectNode document = mapper.createObjectNode().put("schemaVersion", Contract.SCHEMA_VERSION).put("revision", current + 1);
        document.set("case", request.get("case").deepCopy());
        Path temp = null;
        try {
            temp = Files.createTempFile(directory, ".case-", ".tmp");
            mapper.writeValue(temp.toFile(), document);
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            return document;
        } catch (IOException e) { throw unavailable(); }
        finally { if (temp != null) try { Files.deleteIfExists(temp); } catch (IOException ignored) { } }
    }

    public synchronized ObjectNode delete(String id, long revision) {
        ObjectNode current = get(id);
        if (revision != current.get("revision").asLong()) throw conflict();
        try { Files.delete(file(id)); }
        catch (IOException e) { throw unavailable(); }
        return mapper.createObjectNode().put("schemaVersion", Contract.SCHEMA_VERSION).put("caseId", id).put("deleted", true);
    }

    private Path file(String id) {
        if (id == null || !ID.matcher(id).matches()) throw ApiException.invalid("Invalid case ID");
        return directory.resolve(id + ".json");
    }

    private ObjectNode read(Path file) {
        try {
            JsonNode value = mapper.readTree(file.toFile());
            JsonContracts.validate("api", "CaseDocument", value);
            if (!file.getFileName().toString().equals(value.get("case").get("id").asText() + ".json")) throw unavailable();
            return (ObjectNode) value;
        } catch (IOException | ApiException e) { throw unavailable(); }
    }

    private static ApiException conflict() {
        return new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Case changed on the server; reload before saving", false);
    }
    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "UPSTREAM_UNAVAILABLE", "Case storage is unavailable", true);
    }
}
