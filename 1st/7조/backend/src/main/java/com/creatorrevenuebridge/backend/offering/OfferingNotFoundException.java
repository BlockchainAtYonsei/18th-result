package com.creatorrevenuebridge.backend.offering;

import com.creatorrevenuebridge.backend.common.error.ApiException;
import org.springframework.http.HttpStatus;

public class OfferingNotFoundException extends ApiException {

    public OfferingNotFoundException(long offeringId) {
        super(HttpStatus.NOT_FOUND, "OFFERING_NOT_FOUND", "상품을 찾을 수 없습니다. offeringId=" + offeringId);
    }

    public OfferingNotFoundException(long offeringId, Throwable cause) {
        super(HttpStatus.NOT_FOUND, "OFFERING_NOT_FOUND", "상품을 찾을 수 없습니다. offeringId=" + offeringId, cause);
    }
}
