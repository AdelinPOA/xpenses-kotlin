# ── Stage 1: Build & Compile using JDK 21 ──
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /workspace/app

# Copy gradle wrapper and configurations
COPY gradle gradle
COPY gradlew settings.gradle.kts build.gradle.kts ./

# Cache dependencies
RUN ./gradlew dependencies --no-daemon || true

# Copy source code
COPY src src

# Compile standard Spring Boot executable JAR
RUN ./gradlew bootJar --no-daemon

# ── Stage 2: Minimal JRE 21 Runtime ──
FROM eclipse-temurin:21-jre-alpine AS release
WORKDIR /app

# Hardened security: Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder --chown=appuser:appgroup /workspace/app/build/libs/*.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
