package com.creatorrevenuebridge.backend.common.error;

import java.time.Instant;

public record ApiErrorResponse(String code, String message, int status, String path, Instant timestamp) {
}
