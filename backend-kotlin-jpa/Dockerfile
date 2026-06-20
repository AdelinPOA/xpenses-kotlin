# ── Stage 1: Build & Compile using JDK 21 ──
FROM eclipse-temurin:21-jdk-alpine@sha256:4fb80de7aeb277ad949cfbe89b4f504e50bb34c57fd908c5825236473d71e986 AS builder

WORKDIR /workspace/app

# Copy gradle wrapper and configurations
COPY gradle gradle
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./

# Cache dependencies (BuildKit cache mount persists ~/.gradle across builds)
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew dependencies --no-daemon || true

# Copy source code
COPY src src

# Compile standard Spring Boot executable JAR (incremental thanks to cached ~/.gradle)
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew bootJar --no-daemon && \
    mkdir -p /workspace/app/unpacked && \
    cd /workspace/app/unpacked && \
    jar -xf ../build/libs/*.jar

# ── Stage 2: Minimal JRE 21 Runtime ──
FROM eclipse-temurin:21-jre-alpine@sha256:704db3c40204a44f471191446ddd9cda5d60dab40f0e15c6507b815ed897238b AS release
WORKDIR /app

# Install curl for healthchecks + su-exec for privilege dropping
RUN apk add --no-cache curl su-exec

# Hardened security: Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create data directory with correct ownership (for named volume init)
RUN mkdir -p /app/data/receipts /app/data/signatures && chown -R appuser:appgroup /app/data

COPY --from=builder --chown=appuser:appgroup /workspace/app/unpacked /app/unpacked
EXPOSE 8080

# Fix volume permissions on startup, then drop to appuser
ENTRYPOINT ["sh", "-c", "chown -R appuser:appgroup /app/data 2>/dev/null || true; exec su-exec appuser java -cp /app/unpacked org.springframework.boot.loader.launch.PropertiesLauncher"]
