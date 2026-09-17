package com.creatorrevenuebridge.backend.valuation;

import com.creatorrevenuebridge.backend.common.error.ApiException;
import org.springframework.http.HttpStatus;

public class ValuationNotConfiguredException extends ApiException {

    public ValuationNotConfiguredException(long offeringId) {
        super(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "VALUATION_NOT_CONFIGURED",
                "상품의 가치평가 파라미터가 설정되지 않았습니다. offeringId=" + offeringId
        );
    }
}
