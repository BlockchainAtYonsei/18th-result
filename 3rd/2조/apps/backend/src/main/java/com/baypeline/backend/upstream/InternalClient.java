package com.baypeline.backend.upstream;

import com.baypeline.backend.config.BackendProperties;
import com.baypeline.backend.support.RequestIds;
import com.baypeline.backend.support.JsonContracts;
import com.baypeline.backend.support.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * Internal API 호출용 JSON 클라이언트. 본문 requestId와 X-Request-ID 헤더를 같은 값으로 보낸다.
 * 엔진 HTTP 서버는 chunked 전송을 거부하므로 Content-Length를 명시한다.
 */
@Component
public class InternalClient {

    private final RestClient rest;
    private final ObjectMapper mapper;

    public InternalClient(RestClient.Builder builder, BackendProperties properties, ObjectMapper mapper) {
        HttpClient http = HttpClient.newBuilder()
                .connectTimeout(properties.upstream().connectTimeout())
                .version(HttpClient.Version.HTTP_1_1)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(properties.upstream().readTimeout());
        this.rest = builder.requestFactory(factory).build();
        this.mapper = mapper;
    }

    public JsonNode post(String service, String baseUrl, String path, String requestId, JsonNode body) {
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        try {
            return rest.post()
                    .uri(stripSlash(baseUrl) + path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .contentLength(payload.length)
                    .header(RequestIds.HEADER, requestId)
                    .body(payload)
                    .exchange((request, response) -> {
                        int status = response.getStatusCode().value();
                        byte[] raw = response.getBody().readAllBytes();
                        JsonNode node;
                        try {
                            node = mapper.readTree(raw);
                        } catch (IOException e) {
                            throw UpstreamException.invalidResponse(service, "body is not JSON");
                        }
                        if (response.getHeaders().getOrEmpty(RequestIds.HEADER).size() != 1
                                || !requestId.equals(response.getHeaders().getFirst(RequestIds.HEADER))) {
                            throw UpstreamException.invalidResponse(service, "invalid response correlation ID");
                        }
                        MediaType contentType = response.getHeaders().getContentType();
                        if (contentType == null || !MediaType.APPLICATION_JSON.isCompatibleWith(contentType)) {
                            throw UpstreamException.invalidResponse(service, "response Content-Type is not JSON");
                        }
                        if (status == 200) {
                            if (node == null || !node.isObject()) {
                                throw UpstreamException.invalidResponse(service, "body is not a JSON object");
                            }
                            return node;
                        }
                        try { JsonContracts.validate("common", "ErrorResponse", node); }
                        catch (ApiException e) { throw UpstreamException.invalidResponse(service, "invalid error response"); }
                        if (!requestId.equals(node.get("requestId").asText())) {
                            throw UpstreamException.invalidResponse(service, "error requestId mismatch");
                        }
                        JsonNode error = node.get("error");
                        String code = error.get("code").asText();
                        // Messages from upstream services are not trusted for public disclosure.
                        throw new UpstreamException(service, status, code, "Request failed (" + code + ")",
                                error.get("retryable").asBoolean());
                    });
        } catch (ResourceAccessException e) {
            throw UpstreamException.unavailable(service);
        }
    }

    private static String stripSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
