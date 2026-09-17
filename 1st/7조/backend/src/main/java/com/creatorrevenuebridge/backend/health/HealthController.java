package com.creatorrevenuebridge.backend.health;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final String revision;

    public HealthController(@Value("${app.revision:development}") String revision) {
        this.revision = revision;
    }

    @GetMapping
    public Map<String, String> getHealth() {
        return Map.of(
                "status", "ok",
                "service", "backend",
                "revision", revision
        );
    }
}
