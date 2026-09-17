package com.creatorrevenuebridge.backend.common.error;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApiException(ApiException ex, HttpServletRequest request) {
        return ResponseEntity.status(ex.getStatus()).body(toBody(ex.getCode(), ex.getMessage(), ex.getStatus(), request));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception ex, HttpServletRequest request) {
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        log.error("Unhandled API error for {}", request.getRequestURI(), ex);
        return ResponseEntity.status(status).body(toBody("INTERNAL_ERROR", "예상하지 못한 오류가 발생했습니다.", status, request));
    }

    private ApiErrorResponse toBody(String code, String message, HttpStatus status, HttpServletRequest request) {
        return new ApiErrorResponse(code, message, status.value(), request.getRequestURI(), Instant.now());
    }
}
