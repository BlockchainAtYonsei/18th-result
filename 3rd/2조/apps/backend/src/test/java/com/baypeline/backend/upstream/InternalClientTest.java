package com.baypeline.backend.upstream;

import static org.assertj.core.api.Assertions.*;

import com.baypeline.backend.config.BackendProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.client.RestClient;

class InternalClientTest {
    @ParameterizedTest
    @ValueSource(strings = {"missingHeader", "wrongHeader", "duplicateHeader", "wrongBodyId", "invalidError", "missingContentType", "validError"})
    void validatesErrorSchemaAndCorrelationWithoutDisclosingUpstreamMessages(String variant) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/error", exchange -> {
            exchange.getRequestBody().readAllBytes();
            var body = mapper.createObjectNode().put("requestId", "wrongBodyId".equals(variant) ? "other" : "trace");
            body.putObject("error").put("code", "UNSUPPORTED_VERSION").put("message", "secret-token=do-not-expose").put("retryable", false);
            if ("invalidError".equals(variant)) body.put("extra", "unexpected");
            if (!"missingHeader".equals(variant)) exchange.getResponseHeaders().set("X-Request-ID", "wrongHeader".equals(variant) ? "other" : "trace");
            if ("duplicateHeader".equals(variant)) exchange.getResponseHeaders().add("X-Request-ID", "other");
            if (!"missingContentType".equals(variant)) exchange.getResponseHeaders().set("Content-Type", "application/json");
            byte[] raw = body.toString().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(422, raw.length);
            exchange.getResponseBody().write(raw);
            exchange.close();
        });
        server.start();
        try {
            var urls = new BackendProperties.Upstream("", "", "", "", "", Duration.ofSeconds(2), Duration.ofSeconds(2));
            var properties = new BackendProperties("1.0.0", false, 1, 10, List.of(), urls, new BackendProperties.LocalCollector(false, ""));
            var client = new InternalClient(RestClient.builder(), properties, mapper);
            assertThatThrownBy(() -> client.post("test-service", "http://127.0.0.1:" + server.getAddress().getPort(),
                    "/error", "trace", mapper.createObjectNode().put("requestId", "trace")))
                    .isInstanceOf(UpstreamException.class)
                    .satisfies(error -> {
                        UpstreamException upstream = (UpstreamException) error;
                        assertThat(upstream.status()).isEqualTo("validError".equals(variant) ? 422 : 502);
                        assertThat(upstream.publicMessage()).doesNotContain("secret-token", "do-not-expose");
                    });
        } finally { server.stop(0); }
    }
}
