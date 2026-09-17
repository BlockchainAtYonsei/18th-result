package com.creatorrevenuebridge.backend.settlement.dto;

import java.time.Instant;

public record SettlementPeriodView(int periodIndex, Instant periodStart, Instant periodEnd, String status) {
}
