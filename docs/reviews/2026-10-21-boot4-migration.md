# Patched Spring Boot 4 migration (#65)

## Decision and boundary

After the capture fixes in `b88817c`, CI advanced past npm audit and found vulnerabilities in the existing backend platform. The maintainer explicitly chose a **major framework migration**, not VEX exceptions or an Enterprise-only Spring 6 patch. Production remains on its compatible previous pair until the migrated backend passes release verification. No CVE ignore, severity reduction or security-gate bypass is introduced.

Primary references:
- [Boot 4 migration guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide)
- [Boot 4.1 release notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.1-Release-Notes)
- [Jackson 3 changes](https://github.com/FasterXML/jackson/wiki/Jackson-Release-3.0)
- [Spring XsltView advisory](https://spring.io/security/cve-2026-47884/)
- [Spring SSE/view-fragment advisory](https://spring.io/security/cve-2026-47890/)

## Platform changes

- Spring Boot **4.1.1**, managed Spring Framework **7.0.9**, Hibernate **7.4.5**, Apache HttpCore **5.4.3**, Java **21**.
- Replace the web starter with `webmvc`, add the modular Flyway starter, and use webmvc/security/JPA test starters. Relocate `AutoConfigureMockMvc` imports.
- Remove old Boot 3 generation pins for Framework 6, Security 6, Tomcat 10 and Netty 4.1. Merely changing the Boot plugin while retaining those pins is not a valid framework migration.
- Application/internal and HTTP JSON use Jackson **3.1.8** (`tools.jackson`), patched beyond Boot's managed 3.1.5 baseline. Shared `com.fasterxml.jackson.annotation` annotations remain unchanged as required by Jackson 3.
- Keep unavoidable Jackson 2 adapters (JWT, logging and third-party OpenAPI dependencies) consistently on patched **2.21.8**, rather than Boot's older managed 2.x baseline. No application services remain on the old mapper package.
- Upgrade springdoc to **3.1.1** and Tomcat to **11.0.27**, beyond Boot's managed 11.0.24 baseline. The first Boot 4 CI scan identified the remaining patch-level Tomcat/Jackson findings; these are upgraded, not suppressed.
- Keep established JSON defaults via `spring.jackson.use-jackson2-defaults=true` and the existing SNAKE_CASE policy. This does not switch HTTP back to Jackson 2.
- Bound build memory and use the compiler in-process with no resident Gradle daemon by default.

## Compatibility work

Jackson 3 immutable mapper builders replace removed Kotlin registration helpers. The standalone MVC test uses the Jackson 3 HTTP converter. Tree API changes are adapted without weakening assertions: `propertyNames`, non-generic `deepCopy`, and explicit child `values().map`. The latter matters because Jackson 3 introduces a node-level `map` method which otherwise shadows Kotlin's child-iteration extension. Spring 7/JSpecify nullable JDBC query results are filtered during test-only cleanup.

No financial rules, authorization policy, applied migration, expiry/cleanup rule or domain workflow is redesigned. The API DTO names remain stable. V105/V106 are unchanged additive migrations.

## Evidence at migration commit

- Main and test compilation passed on the actual Framework 7 dependencies; bootJar/AOT packaging passed.
- Expense/recovery/settings initial targeted group: **32 passed**.
- Auth, Report, Expense idempotency, OCR/settings/delegation/email group: **56 passed** after adapting the Jackson tree assertions.
- Settings/catalog/storage/FX/migration and golden compatibility group passed.
- `FrameworkJsonCompatibilityTest` pins a fingerprint captured from an actual Boot 3/Jackson 2 HTTP save of a synthetic fixture. Jackson 3 produces the exact same SHA-256 fingerprint; tests must not recalculate the expected fingerprint from the new implementation.
- A durable Boot 3 save operation is also retained in the isolated stack for an actual cross-version replay probe after the runtime swap.

Final image scans, the full CI suite and real migrated-runtime integration/restart/restore rehearsals are release gates, not assumed results from compilation. Operational outcomes belong in the release evidence and GitHub status after they run. No physical-iPhone acceptance is claimed; #51 and historical OCR-source provenance #60 remain separate.
