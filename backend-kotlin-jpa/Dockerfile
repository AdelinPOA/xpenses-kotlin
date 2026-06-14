# ── Stage 1: Build & Compile Native Binary using GraalVM ──
FROM ghcr.io/graalvm/native-image-community:21-ol9 AS builder
WORKDIR /workspace/app

# Copy gradle wrapper and configurations
COPY gradle gradle
COPY gradlew settings.gradle.kts build.gradle.kts ./

# Cache dependencies
RUN ./gradlew dependencies --no-daemon || true

# Copy source code
COPY src src

# Run AOT compiler and produce the standalone executable
RUN ./gradlew nativeCompile --no-daemon

# ── Stage 2a (Recommended): Distroless container for standard glibc compatibility ──
FROM gcr.io/distroless/cc-debian12:nonroot AS release-distroless
WORKDIR /app
COPY --from=builder /workspace/app/build/native/nativeCompile/backend-microservice /app/backend-microservice
EXPOSE 8080
ENTRYPOINT ["/app/backend-microservice"]

# ── Stage 2b (Alternative): Alpine Linux with glibc compatibility libraries ──
FROM alpine:3.19 AS release-alpine
RUN apk --no-cache add gcompat libc6-compat libstdc++
# Security hardening: Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /workspace/app/build/native/nativeCompile/backend-microservice /app/backend-microservice
EXPOSE 8080
ENTRYPOINT ["/app/backend-microservice"]
