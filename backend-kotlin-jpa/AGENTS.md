# backend-kotlin-jpa — Spring Boot Backend

## OVERVIEW
Spring Boot 3.4.5 + Kotlin 2.1 + JPA/Hibernate + Flyway. REST API for expense management. 42 source files, 14 test files.

## STRUCTURE
```
src/main/kotlin/eu/nt/xpenses/
├── XpensesApplication.kt    # @EnableAsync + @EnableScheduling + @EnableCaching
├── config/                  # Security, cache, async, data-init, validation
├── controllers/             # 15 thin REST controllers (thin: delegate to services)
├── models/                  # Models.kt (all JPA entities), PagedResponse, UserResponse
├── repositories/            # Single Repositories.kt (all repos)
├── security/                # JwtTokenProvider, JwtAuthenticationFilter
└── services/                # 16 services + storage/ subdir (S3Provider, StorageProvider)
```

## WHERE TO LOOK
| Task | File(s) |
|------|---------|
| Add migration | `src/main/resources/db/migration/V17__...` |
| New entity | `src/main/kotlin/eu/nt/xpenses/models/Models.kt` + repo in `Repositories.kt` |
| New endpoint | New controller in `controllers/` + service in `services/` |
| Security/auth | `security/JwtTokenProvider.kt`, `config/SecurityConfig.kt` |
| FX rates | `services/FxService.kt` |
| OCR processing | `services/OcrService.kt`, `services/AsyncOcrService.kt` |
| PDF generation | `services/PdfService.kt` |

## CONVENTIONS
- **Flyway**: `ddl-auto: validate`. All schema → migrations. Never edit existing migrations.
- **Soft delete**: `@SQLDelete` + `@SQLRestriction("deleted = false")`. `delete()` = UPDATE.
- **SNAKE_CASE**: Jackson global property naming.
- **In-memory filtering**: repo finds all, Kotlin filters (no SQL WHERE for lists).
- **Slf4j logging**: `LoggerFactory.getLogger()` per class.
- **Tests**: `IntegrationTestBase` → `@SpringBootTest(MOCK)`, `@Transactional`, `@AutoConfigureMockMvc`. Use `TestAuthHelper.loginAs()`.

## ANTI-PATTERNS
- Never suppress type errors (`as any`/`@Suppress` equivalent) in Kotlin.
- Never edit an applied Flyway migration; add V17+.
- No business logic in controllers.
- No SQL-level WHERE for list filtering (in-memory preferred).

## COMMANDS
```bash
# Build (JDK 21/22 only)
./gradlew bootJar --no-daemon

# Run tests
./gradlew test --no-daemon

# Single test class
./gradlew test --no-daemon --tests 'eu.nt.xpenses.report.ReportStateMachineTest'

# Hot-swap into running Docker
./gradlew classes processResources
```
