package com.creatorrevenuebridge.backend.offering;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Mirrors IRevenueBridge.OfferingStatus (contracts/src/interfaces/IRevenueBridge.sol) and the
 * six-value status list published in contracts/client/RevenueBridge.client.json.
 */
public enum OfferingStatus {
    NONE(0, "None", "존재하지 않음"),
    FUNDING(1, "Funding", "모집 중"),
    ACTIVE(2, "Active", "모집 완료"),
    FAILED(3, "Failed", "모집 실패"),
    SETTLING(4, "Settling", "정산 중"),
    CLOSED(5, "Closed", "종료");

    private final int value;
    private final String contractName;
    private final String label;

    OfferingStatus(int value, String contractName, String label) {
        this.value = value;
        this.contractName = contractName;
        this.label = label;
    }

    public int getValue() {
        return value;
    }

    @JsonValue
    public String getContractName() {
        return contractName;
    }

    public String getLabel() {
        return label;
    }

    @JsonCreator
    public static OfferingStatus fromContractName(String contractName) {
        for (OfferingStatus status : values()) {
            if (status.contractName.equalsIgnoreCase(contractName)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown offering status: " + contractName);
    }
}
