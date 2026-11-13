package com.baypeline.backend.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SpecVersion.VersionFlag;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;

/** Validates against the shared draft 2020-12 schemas packaged from contracts/schemas. */
public final class JsonContracts {
    private static final String BASE = "https://baypeline.github.io/solana-compliance-lab/contracts/schemas/";
    private static final JsonSchemaFactory FACTORY = JsonSchemaFactory.getInstance(VersionFlag.V202012,
            builder -> builder.schemaMappers(mappers -> mappers.mapPrefix(BASE, "classpath:contracts/schemas/")));
    private static final Map<String, JsonSchema> SCHEMAS = new ConcurrentHashMap<>();

    private JsonContracts() {}

    public static void validate(String file, String definition, JsonNode value) {
        if (value == null) throw ApiException.contract("Missing contract value");
        String key = file + ".schema.json#/$defs/" + definition;
        JsonSchema schema = SCHEMAS.computeIfAbsent(key, location -> {
            JsonSchema loaded = FACTORY.getSchema(SchemaLocation.of(BASE + location));
            loaded.initializeValidators();
            return loaded;
        });
        if (!schema.validate(value, context -> context.getExecutionConfig().setFormatAssertionsEnabled(true)).isEmpty()) {
            // Do not return validator messages: they may contain upstream data or credentials.
            throw ApiException.contract("Response does not satisfy " + file + "/" + definition);
        }
        ContractSemantics.primitives(value, 0);
    }

    public static void request(String file, String definition, JsonNode value) {
        versionFirst(value);
        try { validate(file, definition, value); }
        catch (ApiException e) {
            if (e.status() == HttpStatus.BAD_GATEWAY) throw ApiException.contract("Request has inconsistent contract references");
            throw e;
        }
    }

    public static void upstream(String service, String file, String definition, JsonNode value) {
        try {
            validate(file, definition, value);
        } catch (ApiException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "CONTRACT_VALIDATION_FAILED",
                    service + " returned a response outside the shared contract", false);
        }
    }

    private static void versionFirst(JsonNode value) {
        if (value == null) return;
        if (value.isObject() && value.has("schemaVersion")
                && !Contract.SCHEMA_VERSION.equals(value.get("schemaVersion").asText())) {
            throw ApiException.unsupportedVersion("Unsupported schemaVersion");
        }
        if (value.isContainerNode()) value.forEach(JsonContracts::versionFirst);
    }
}
