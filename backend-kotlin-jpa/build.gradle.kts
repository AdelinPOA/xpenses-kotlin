plugins {
    kotlin("jvm") version "2.4.0"
    kotlin("plugin.spring") version "2.4.0"
    kotlin("plugin.jpa") version "2.4.0"
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.graalvm.buildtools.native") version "0.10.4"
}

group = "eu.nt"
version = "1.0.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

// JWT/logging adapters still use Jackson 2; keep that managed family patched
// while application HTTP/settings/OCR JSON migrates to Boot 4's Jackson 3.
extra["jackson-2-bom.version"] = "2.21.8"
// Security patches newer than Boot 4.1.1's managed baseline, within its lines.
extra["jackson-bom.version"] = "3.1.8"
extra["tomcat.version"] = "11.0.27"

dependencies {
    // Spring Boot Starters
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.apache.httpcomponents.client5:httpclient5")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("net.logstash.logback:logstash-logback-encoder:8.0")
    implementation("org.springframework.boot:spring-boot-starter-cache")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("com.github.ben-manes.caffeine:caffeine")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.1.1")
    implementation("javax.cache:cache-api:1.1.1")
    implementation("com.github.ben-manes.caffeine:jcache")

    // Database
    runtimeOnly("org.postgresql:postgresql:42.7.13")
    implementation("org.flywaydb:flyway-database-postgresql")

    // JWT
    implementation("io.jsonwebtoken:jjwt-api:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.6")

    // PDF Generation & Parsing
    implementation("com.github.librepdf:openpdf:2.0.3")
    implementation("org.apache.pdfbox:pdfbox:3.0.4")

    // Excel/CSV Export
    implementation("org.apache.poi:poi-ooxml:5.4.0")

    // S3 Storage
    implementation("software.amazon.awssdk:s3:2.30.0")

    // Email HTML normalization (local parsing only, no remote resources).
    implementation("org.jsoup:jsoup:1.23.2")

    // Kotlin Support
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("tools.jackson.module:jackson-module-kotlin")

    // DevTools for Hot-Swapping
    developmentOnly("org.springframework.boot:spring-boot-devtools")

    // Testing
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-test")
    testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
}

dependencyManagement {
    imports {
        // Override Spring Boot's managed Testcontainers to 1.21.x so we get a current
        // testcontainers-bom. The actual Docker API version fix is handled via the
        // systemProperty("api.version", ...) in tasks.withType<Test> below — Testcontainers
        // shades docker-java internally and defaults to API 1.32, which is rejected by
        // Docker 29+ (minimum 1.40).
        mavenBom("org.testcontainers:testcontainers-bom:1.21.0")
    }
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
    // Testcontainers 1.21 on Docker 29+ requires API negotiation >= 1.40.
    // docker-java (shaded inside Testcontainers) reads this property as its API version override.
    systemProperty("api.version", "1.45")
}

// GraalVM native AOT processing tries to spin up a Spring context with Docker — skip it.
tasks.named("processTestAot") { enabled = false }

graalvmNative {
    binaries {
        named("main") {
            imageName = "backend-microservice"
            mainClass = "eu.nt.xpenses.XpensesApplication"

            buildArgs.addAll(
                "--no-fallback",
                "--enable-http",
                "--enable-https",
                "--initialize-at-build-time=org.slf4j,ch.qos.logback,org.apache.commons.logging,org.apache.logging.log4j,org.apache.logging.slf4j,org.springframework.core.SpringProperties",
                "-H:+ReportExceptionStackTraces",
            )
        }
    }
}
