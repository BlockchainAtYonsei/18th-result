FROM eclipse-temurin:21-jdk-jammy AS base
WORKDIR /app

COPY --chmod=755 gradlew ./gradlew
COPY gradle ./gradle
COPY build.gradle settings.gradle ./

FROM base AS development
COPY src ./src
EXPOSE 8080
CMD ["./gradlew", "bootRun", "--no-daemon"]

FROM base AS builder
COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-jammy AS production
WORKDIR /app
ARG VCS_REF=unknown

LABEL org.opencontainers.image.source="https://github.com/baypeline/creator-revenue-bridge" \
      org.opencontainers.image.revision=$VCS_REF

RUN groupadd --system spring \
    && useradd --system --gid spring spring \
    && apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=spring:spring /app/build/libs/*.jar ./app.jar

USER spring
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
