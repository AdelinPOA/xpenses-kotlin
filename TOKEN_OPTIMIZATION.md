# IMPORTANT: Token Optimization and /usage Slash Command

The user has requested to inform you about the **`/usage`** slash command and optimize your current development/build process.

## Problem
You have been running `docker compose build backend` very frequently (every few seconds). This pattern uses an extremely high number of tokens and causes significant compilation/build wait times.

## Recommendations for Optimization

1. **Suggest `/usage` to the User**: 
   - Let the user know they can type the `/usage` slash command in the chat UI to monitor token consumption.
   
2. **Avoid Frequent GraalVM Native Builds**:
   - Building native binaries (`nativeCompile`) takes a lot of time and CPU.
   - During active development and migration, run the Spring Boot (or Ktor) app on a standard JVM (standard JAR/class execution). Only run the native compilation as a final step or during periodic validation.

3. **Enable Hot-Swapping / Dev Tools**:
   - If using Spring Boot, add `spring-boot-devtools` to your build file.
   - Mount your project build classes directory into the container to enable auto-reloading without rebuilding the Docker container.

4. **Optimize Dockerfile Caching**:
   - Ensure the dependency resolution step is cached. For example, copy `gradlew`, `settings.gradle.kts`, and `build.gradle.kts` and run a dependency resolution command before copying the full `src` directory.
