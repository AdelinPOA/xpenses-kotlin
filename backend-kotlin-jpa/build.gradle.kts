plugins {
    kotlin("jvm") version "2.1.0"
    kotlin("plugin.spring") version "2.1.0"
    kotlin("plugin.jpa") version "2.1.0"
    id("org.springframework.boot") version "3.4.5"
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

dependencies {
    // Spring Boot Starters
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.flywaydb:flyway-core")
    implementation("org.springframework.boot:spring-boot-starter-data-ldap")
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("net.logstash.logback:logstash-logback-encoder:7.4")
    implementation("com.giffing.bucket4j.spring.boot.starter:bucket4j-spring-boot-starter:0.12.8")
    implementation("org.springframework.boot:spring-boot-starter-cache")
    implementation("com.github.ben-manes.caffeine:caffeine")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0")
    implementation("javax.cache:cache-api:1.1.1")
    implementation("com.github.ben-manes.caffeine:jcache")

    // Database
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-database-postgresql")

    // JWT
    implementation("io.jsonwebtoken:jjwt-api:0.12.5")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.5")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.5")

    // PDF Generation & Parsing
    implementation("com.github.librepdf:openpdf:2.0.3")
    implementation("org.apache.pdfbox:pdfbox:3.0.2")

    // Excel/CSV Export
    implementation("org.apache.poi:poi-ooxml:5.3.0")

    // S3 Storage
    implementation("software.amazon.awssdk:s3:2.30.0")

    // Kotlin Support
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")

    // DevTools for Hot-Swapping
    developmentOnly("org.springframework.boot:spring-boot-devtools")

    // Testing
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
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
                "-H:+ReportExceptionStackTraces"
            )
        }
    }
}
