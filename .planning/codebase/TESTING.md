# Testing Patterns

**Analysis Date:** 2026-06-29

## Test Framework

**Backend (Kotlin):**
- **Runner:** JUnit 5 (Jupiter)
- **Spring Test:** `@SpringBootTest`, `@AutoConfigureMockMvc` for controller integration tests
- **Database:** Testcontainers with PostgreSQL (v16-alpine) — spins up throwaway DB per test suite
- **Mocking:** Mockito via `@MockitoBean` for external service mocks
- **Config:** `build.gradle.kts:92-97` configures JUnit 5 and Testcontainers API version negotiation

**Frontend (Next.js):**
- No test framework configured (no Jest, Vitest, or Testing Library)
- ESLint only for code quality (no runtime tests)

**Run Commands:**
```bash
# Backend: run JUnit suite with Testcontainers (requires Docker)
make test
# or: cd backend-kotlin-jpa && ./gradlew test --no-daemon

# Backend: run specific test class
cd backend-kotlin-jpa && ./gradlew test --no-daemon --tests 'eu.nt.xpenses.report.ReportStateMachineTest'

# Frontend: lint only (no tests to run)
npm run lint
```

## Test File Organization

**Location:**
- Backend: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/`
  - Mirrors source structure: `src/main/kotlin/eu/nt/xpenses/controllers/` → `src/test/kotlin/eu/nt/xpenses/controllers/`
- Frontend: No tests present; static analysis only

**Naming:**
- Backend: Append `Test` suffix (e.g., `AuthControllerTest.kt`, `ReportStateMachineTest.kt`, `OcrServiceTest.kt`)

**Structure:**
```
backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/
├── IntegrationTestBase.kt           # Base class for all tests
├── TestAuthHelper.kt                # Auth utility for tests
├── ContextLoadsTest.kt              # Smoke test: app context loads
├── controllers/
│   ├── AuthControllerTest.kt
│   ├── ExpenseControllerTest.kt
│   ├── AdvanceControllerTest.kt
│   ├── UserControllerTest.kt
│   ├── DashboardControllerTest.kt
│   └── ...
├── report/
│   └── ReportStateMachineTest.kt
├── services/
│   └── OcrServiceTest.kt
└── ocr/
    └── AsyncOcrTest.kt
```

## Test Structure

**Base Class Pattern (Integration Tests):**
```kotlin
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
abstract class IntegrationTestBase {
    companion object {
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")
            .also { it.start() }
        
        @DynamicPropertySource
        @JvmStatic
        fun overrideProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            // ... other overrides
        }
    }
    
    @Autowired lateinit var mockMvc: MockMvc
    @MockitoBean lateinit var externalService: SomeService
    
    @BeforeEach
    fun setUpBase() {
        mockMvc = webAppContextSetup(webApplicationContext)
            .apply(springSecurity())
            .build()
    }
}
```

Key points:
- `@Transactional` wraps each test method and rolls back after completion → test isolation without truncation
- `PostgreSQLContainer` is a static shared instance (started once per test suite, not per test)
- `@MockitoBean` mocks external services (FxService, OcrService, EmailSettingsService)
- `@DynamicPropertySource` overrides Spring Boot config for testing (JWT secret, DB URL, rate limiting disabled)

**Suite Organization (Example: `AuthControllerTest.kt`):**
```kotlin
class AuthControllerTest : IntegrationTestBase() {
    @Test
    fun `login with valid credentials returns 200 and access_token cookie`() {
        mockMvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"username":"tech1","password":"tech1"}""")
        )
            .andExpect(status().isOk)
            .andExpect(cookie().exists("access_token"))
            .andExpect(jsonPath("$.username").value("tech1"))
    }
    
    @Test
    fun `login with wrong password returns 401`() {
        // test implementation
    }
}
```

**Patterns:**
- Backtick method names: `` `login with valid credentials returns 200 and access_token cookie`() `` (Kotlin string interpolation in names for readability)
- One assertion concept per test, but multiple related assertions allowed (e.g., check status + cookie + JSON fields)
- Use `mockMvc.perform(post(...))` with MockMvc builders for HTTP requests

## Mocking

**Framework:** Mockito (imported via `spring-boot-starter-test`)

**Declaration Pattern:**
```kotlin
@MockitoBean
lateinit var emailSettingsService: EmailSettingsService

// In test:
given(emailSettingsService.getConfig()).willReturn(config)
```

**Patterns:**
- Use `@MockitoBean` for Spring beans; constructor injection of mocks in non-Spring tests
- `given(...).willReturn(...)` syntax (BDD style)
- `verify(mock).methodCall(...)` to assert mock was called
- `spy(realService)` to partially mock (wrap real object, override specific methods)
- `doThrow(exception).when(spyService).method(...)` to make spied method throw

**Example (OcrServiceTest.kt):**
```kotlin
val spyService = spy(ocrService)
doThrow(RuntimeException("rate limited"))
    .`when`(spyService).scanGemini(..., "gemini-3.1-flash-lite")
doReturn(geminiResult(...))
    .`when`(spyService).scanGemini(..., "gemini-3.5-flash")

val result = spyService.scanReceipt(fakeBytes, filename)
// Verify fallback occurred
verify(spyService).scanGemini(..., "gemini-3.1-flash-lite")
verify(spyService).scanGemini(..., "gemini-3.5-flash")
```

**What to Mock:**
- External HTTP calls (FxService, OcrService, EmailSettingsService)
- Database operations in unit tests (but not in integration tests with Testcontainers)
- Configuration lookups (AppSettingRepository in isolated tests)

**What NOT to Mock:**
- Repository methods in integration tests (use real Testcontainers DB)
- Spring Security (use helper `authHelper.loginAs()` instead)
- Core business logic (test real ExpenseService, ReportService; mock their dependencies)

## Fixtures and Factories

**Test Data Pattern:**
```kotlin
private fun makeReport(username: String): ExpenseReport {
    val user = userRepository.findByUsername(username)!!
    return expenseReportRepository.save(
        ExpenseReport(user = user, title = "Test Report")
    )
}

private fun makeExpense(username: String, report: ExpenseReport? = null): Expense {
    val user = userRepository.findByUsername(username)!!
    val category = categoryRepository.findAll().firstOrNull()
        ?: error("No seeded category found")
    return expenseRepository.save(
        Expense(
            user = user,
            category = category,
            amountOriginal = BigDecimal("50.00"),
            amountEur = BigDecimal("50.00"),
            date = "2026-06-01",
            report = report
        )
    )
}
```

**Location:**
- Test helpers: `IntegrationTestBase.kt` (shared auth helper `TestAuthHelper`)
- Factory methods: Inline in test classes as `private fun` (no separate factory classes)

**Seeded Data:**
- User accounts seeded by `DataInitializer.kt` on app startup (when `seed.demo.users=true`)
  - `tech1/tech1` (technician), `manager1/manager1` (manager), `cfo1/cfo1` (chef_finance), `mod1/mod1` (mod)
- Categories seeded; queried via `categoryRepository.findAll().firstOrNull()`
- Test-created entities are transaction-scoped; visible only within the test method

## Coverage

**Requirements:** No explicit coverage target enforced

**View Coverage:**
```bash
# Gradle does not have coverage plugin configured
# To add coverage, would need to integrate JaCoCo or similar
```

**Current coverage:** Unknown (no coverage reports generated)

## Test Types

**Unit Tests:**
- **Scope:** Individual service methods or components
- **Approach:** Mocks dependencies (e.g., `OcrServiceTest.kt`)
- **Example:** `OcrServiceTest.scanReceipt()` tests cache hit, fallback chain, error handling with mocked Gemini API

**Integration Tests:**
- **Scope:** Controller → Service → Repository → Database (full stack)
- **Approach:** Real Testcontainers PostgreSQL, real Spring context, mocked external HTTP services
- **Example:** `AuthControllerTest`, `ReportStateMachineTest` verify HTTP request/response + database state

**E2E Tests:**
- **Framework:** Not present
- **Note:** Frontend has no E2E test suite configured

## Common Patterns

**Async Testing:**
```kotlin
// Testcontainers PostgreSQL runs synchronously; MockMvc dispatches synchronously
// No special async handling needed
mockMvc.perform(post("/api/endpoint"))
    .andExpect(status().isOk)
```

**Error Testing:**
```kotlin
@Test
fun `operation with invalid input returns 400`() {
    mockMvc.perform(
        post("/api/endpoint")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"field":""}""")
    ).andExpect(status().isBadRequest)
        .andExpect(jsonPath("$.detail").isString)
}
```

**State Machine Testing (ReportStateMachineTest.kt):**
- Organize tests by transition (submit, approve, reject, pay, recall sections)
- Use `entityManager.flush()` + `entityManager.clear()` to ensure lazy collections reload from DB
- Verify both HTTP response and database state after controller dispatch

**Example:**
```kotlin
@Test
fun `recall submitted report → status becomes draft`() {
    val report = makeReport("tech1").also {
        it.status = "submitted"
        expenseReportRepository.save(it)
    }
    val expense = makeExpense("tech1", report).also {
        it.status = "submitted"
        expenseRepository.save(it)
    }
    entityManager.flush()
    entityManager.clear() // Clear cache, force reload
    val cookie = authHelper.loginAs("tech1", "tech1")
    
    mockMvc.perform(post("/api/reports/${report.id}/recall").cookie(cookie))
        .andExpect(status().isOk)
        .andExpect(jsonPath("$.status").value("draft"))
    
    val refreshed = expenseRepository.findById(expense.id!!).get()
    assertEquals("draft", refreshed.status)
}
```

**Auth Helper Utility (TestAuthHelper.kt):**
```kotlin
// Usage in tests:
val cookie = authHelper.loginAs("tech1", "tech1")
mockMvc.perform(get("/api/endpoint").cookie(cookie))
```

Queries committed seeded data only; never works with test-created entities (different transaction scope).

## Known Test Limitations

1. **Frontend:** No test suite (static analysis via ESLint only)
2. **Coverage:** Not measured or enforced
3. **E2E:** Not automated; manual testing only
4. **Performance:** No load or stress tests configured
5. **Async Operations:** OCR jobs run asynchronously in production but test via synchronous MockMvc (acceptable for controller-level tests)

---

*Testing analysis: 2026-06-29*
