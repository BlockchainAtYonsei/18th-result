package com.baypeline.backend.cases;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/v1/cases", produces = MediaType.APPLICATION_JSON_VALUE)
public class CaseController {
    private final CaseRepository repository;
    public CaseController(CaseRepository repository) { this.repository = repository; }
    @GetMapping public ObjectNode list(@RequestParam(required = false) String cursor) { return repository.list(cursor); }
    @GetMapping("/{caseId}") public ObjectNode get(@PathVariable String caseId) { return repository.get(caseId); }
    @PutMapping(path = "/{caseId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ObjectNode put(@PathVariable String caseId, @RequestBody JsonNode body) { return repository.put(caseId, body); }
    @DeleteMapping("/{caseId}")
    public ObjectNode delete(@PathVariable String caseId, @RequestParam long revision) { return repository.delete(caseId, revision); }
}
