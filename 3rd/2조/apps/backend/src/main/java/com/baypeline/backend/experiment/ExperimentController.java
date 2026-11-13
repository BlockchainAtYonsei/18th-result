package com.baypeline.backend.experiment;

import com.baypeline.backend.support.RequestIds;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1/experiments", produces = MediaType.APPLICATION_JSON_VALUE)
public class ExperimentController {
    private final ExperimentService service;

    public ExperimentController(ExperimentService service) { this.service = service; }

    @PostMapping(path = "/gateway", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> gateway(@RequestBody JsonNode body, HttpServletRequest request) {
        return saved(service.gateway(body, RequestIds.current(request)));
    }

    @PostMapping(path = "/constellation", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> constellation(@RequestBody JsonNode body, HttpServletRequest request) {
        return saved(service.constellation(body, RequestIds.current(request)));
    }

    @GetMapping("/{recordId}")
    public ObjectNode get(@PathVariable String recordId) { return service.get(recordId); }

    @GetMapping
    public ObjectNode list(@RequestParam(required = false) String type,
            @RequestParam(required = false) String intentId, @RequestParam(required = false) String decisionId,
            @RequestParam(required = false) String limit, @RequestParam(required = false) String cursor) {
        return service.list(type, intentId, decisionId, limit, cursor);
    }

    private static ResponseEntity<JsonNode> saved(ObjectNode record) {
        return ResponseEntity.ok().location(URI.create("/api/v1/experiments/" + record.get("recordId").asText()))
                .body(record.get("result"));
    }
}
