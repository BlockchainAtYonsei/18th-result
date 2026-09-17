package com.creatorrevenuebridge.backend.common;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

/**
 * Monetary value expressed three ways so API consumers never have to guess a scale:
 * the exact base-unit integer, the decimals it was scaled with, and a human-readable display string.
 */
public record Amount(String raw, int decimals, String display) {

    public static Amount fromRaw(BigInteger rawValue, int decimals) {
        BigDecimal display = new BigDecimal(rawValue).movePointLeft(decimals);
        return new Amount(rawValue.toString(), decimals, display.toPlainString());
    }

    public static Amount fromDisplay(BigDecimal displayValue, int decimals) {
        BigDecimal scaled = displayValue.setScale(decimals, RoundingMode.DOWN);
        BigInteger raw = scaled.movePointRight(decimals).toBigIntegerExact();
        return new Amount(raw.toString(), decimals, scaled.toPlainString());
    }
}
