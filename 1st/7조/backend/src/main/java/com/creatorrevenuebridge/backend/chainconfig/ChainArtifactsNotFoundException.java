package com.creatorrevenuebridge.backend.chainconfig;

import com.creatorrevenuebridge.backend.common.error.ApiException;
import org.springframework.http.HttpStatus;

public class ChainArtifactsNotFoundException extends ApiException {

    public ChainArtifactsNotFoundException(String location) {
        super(HttpStatus.SERVICE_UNAVAILABLE, "CHAIN_ARTIFACTS_NOT_FOUND", buildMessage(location));
    }

    public ChainArtifactsNotFoundException(String location, Throwable cause) {
        super(HttpStatus.SERVICE_UNAVAILABLE, "CHAIN_ARTIFACTS_NOT_FOUND", buildMessage(location), cause);
    }

    private static String buildMessage(String location) {
        return "컨트랙트 배포 산출물을 찾을 수 없습니다 (" + location + "). "
                + "저장소 루트에서 ./scripts/deploy-local.sh 를 실행한 뒤 backend를 다시 시작하세요.";
    }
}
