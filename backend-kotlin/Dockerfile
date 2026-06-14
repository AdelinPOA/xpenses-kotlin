# ── Stage 1: Build Native Binary using GraalVM community image ──
FROM ghcr.io/graalvm/native-image-community:21-ol9 AS builder
WORKDIR /workspace/app

# Copy gradle configuration and wrapper files
COPY gradle gradle
COPY gradlew settings.gradle.kts build.gradle.kts ./

# Prefetch dependencies to cache this layer
RUN ./gradlew dependencies --no-daemon || true

# Copy the source code
COPY src src

# Compile AOT classes and generate the native binary
RUN ./gradlew nativeCompile --no-daemon

# ── Stage 2: Minimal runtime image ──
FROM alpine:3.19
RUN apk --no-cache add gcompat libc6-compat libstdc++

# Run as non-root user for container security hardening
RUN addgroup -S xpenses && adduser -S xpenses -G xpenses
USER xpenses

WORKDIR /app

# Copy the native executable from the build stage
COPY --from=builder --chown=xpenses:xpenses /workspace/app/build/native/nativeCompile/xpenses /app/xpenses

EXPOSE 8000

ENV PORT=8000
ENV SPRING_PROFILES_ACTIVE=prod

ENTRYPOINT ["/app/xpenses"]
