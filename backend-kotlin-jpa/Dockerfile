# ── Stage 1: Build & Compile using JDK 21 ──
FROM eclipse-temurin:21-jdk-alpine@sha256:6ea5548706b60ac0a602eaf48af74792cbab012d90e811ca8db6184b16b5c3d6 AS builder

WORKDIR /workspace/app

# Copy gradle wrapper and configurations
COPY gradle gradle
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./

# Cache dependencies (BuildKit cache mount persists ~/.gradle across builds)
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew dependencies --no-daemon || true

# Copy source code
COPY src src

# Compile standard Spring Boot executable JAR.
# Keep Gradle's build cache enabled so normal deployments can reuse unchanged Kotlin/AOT work.
# Use `./gradlew clean bootJar --no-build-cache` explicitly when a clean rebuild is required.
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew bootJar --no-daemon && \
    mkdir -p /workspace/app/unpacked && \
    cd /workspace/app/unpacked && \
    jar -xf ../build/libs/*.jar

# ── Stage 2: Minimal JRE 21 Runtime ──
FROM eclipse-temurin:21-jre-alpine@sha256:974b08960c5d96694c780e65b2d5705268ab1e1ca1a0dd0caf4ba6c3fe34d699 AS release
WORKDIR /app

# Install curl for healthchecks + su-exec for privilege dropping
RUN apk upgrade --no-cache && apk add --no-cache curl su-exec

# Hardened security: Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create data directory with correct ownership (for named volume init)
RUN mkdir -p /app/data/receipts /app/data/signatures && chown -R appuser:appgroup /app/data

COPY --from=builder --chown=appuser:appgroup /workspace/app/unpacked /app/unpacked
EXPOSE 8080

# Fix volume permissions on startup, then drop to appuser
ENTRYPOINT ["sh", "-c", "chown -R appuser:appgroup /app/data 2>/dev/null || true; exec su-exec appuser java -cp /app/unpacked org.springframework.boot.loader.launch.PropertiesLauncher"]
