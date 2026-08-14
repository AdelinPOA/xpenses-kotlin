# Testing Patterns

**Analysis Date:** 2026-08-14

## Test Frameworks & Tools

### Backend Stack
- **Test Runner:** JUnit Platform / JUnit 5 (Jupiter) configured via `useJUnitPlatform()` in `backend-kotlin-jpa/build.gradle.kts`
- **Spring Integration:** `spring-boot-starter-test` (Spring Boot 3.4.5), `spring-security-test`
- **Containers:** Testcontainers Jupiter & PostgreSQL (`org.testcontainers:postgresql`, pinned via `testcontainers-bom:1.21.0`)
- **Mocking:** Mockito (`@MockitoBean`, `org.mockito.Mockito.*`, `BDDMockito.given`)
- **Web Layer:** Spring `MockMvc` (WebEnvironment.MOCK)

### Frontend Stack
- **E2E & Integration:** Playwright (`@playwright/test: ^1.61.1`) configured in `frontend/playwright.config.ts`
- **Accessibility:** `@axe-core/playwright: ^4.10.2` for WCAG 2.1 AA accessibility auditing
- **Visual Regression:** Playwright snapshot comparison with `toHaveScreenshot` (`maxDiffPixels: 100`, `threshold: 0.3`)

### Repository Checks
- **Translation Parity:** Node script `scripts/check-i18n-parity.mjs` (run via `npm run i18n:check`)
- **Currency Format Check:** `scripts/check-format-currency.mjs`
- **Linting:** ESLint (`frontend/eslint.config.mjs`) via `npm run lint`

---

## Test Execution Commands

### Backend Commands
```bash
# Run all backend tests (spins up Testcontainers PostgreSQL)
./gradlew test

# Run a single test class
./gradlew test --tests "eu.nt.xpenses.controllers.ExpenseControllerTest"

# Run a specific test method
./gradlew test --tests "eu.nt.xpenses.services.FxServiceTest.EUR returns identity without repository or provider call"

# Run tests with detailed stacktraces
./gradlew test --info --stacktrace
```

### Frontend Commands
```bash
# Run all Playwright tests across all projects
npm --prefix frontend run test:e2e

# Run tests on specific viewports (mobile chromium + mobile webkit)
npm --prefix frontend run test:e2e:mobile

# Run a single test file
npx --prefix frontend playwright test tests/dashboard/dashboard.spec.ts

# Update visual regression snapshots
npx --prefix frontend playwright test tests/responsive/screenshots.spec.ts --update-snapshots

# Run translation key parity validation
npm --prefix frontend run i18n:check
```

---

## Backend Test Architecture & Patterns

### 1. Integration Tests (`IntegrationTestBase.kt`)

All integration and controller tests inherit from `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt`.

**Key Architectural Features:**
- **Shared PostgreSQL Container:** A static singleton `PostgreSQLContainer("postgres:16-alpine")` started once for all tests.
- **Dynamic Property Configuration:** `@DynamicPropertySource` registers datasource URLs, credentials, test JWT/encryption secrets, and isolated temporary storage directories (`signatures.dir`, `storage.local.base-dir`).
- **Transactional Rollback:** `@Transactional` on the base class rolls back database changes after each test method, ensuring isolation without truncating tables.
- **Security & Origin Header Setup:** `setUpBase()` initializes MockMvc with `springSecurity()` and sets default Origin header `http://localhost:3001` to satisfy CSRF/Origin checks.
- **Mock Services:** Shared `@MockitoBean` instances for external systems (`EmailSettingsService`, `FxService`, `OcrService`).
- **Authentication Helper:** `TestAuthHelper(mockMvc)` provides `authHelper.loginAs(username, password)` returning session cookies.

**Controller Test Example:**
```kotlin
class ExpenseControllerTest : IntegrationTestBase() {

    @Test
    fun `GET expenses returns only own expenses for technician`() {
        val techUser = userRepository.findByUsername("tech1")!!
        val managerUser = userRepository.findByUsername("manager1")!!
        val cat = categoryRepository.findAll().first()
        
        expenseRepository.save(Expense(user = techUser, category = cat, amountOriginal = BigDecimal("30.00"), amountEur = BigDecimal("30.00"), date = "2026-06-01"))
        expenseRepository.save(Expense(user = managerUser, category = cat, amountOriginal = BigDecimal("100.00"), amountEur = BigDecimal("100.00"), date = "2026-06-01"))
        
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/expenses").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
            .andExpect(jsonPath("$[?(@.user_id != ${techUser.id})]").isEmpty)
    }
}
```

### 2. Service Unit Tests

- Pure unit tests instantiated without Spring context when testing business logic or calculation math (e.g. `FxServiceTest.kt`, `MileageCalculationServiceTest.kt`, `LocalStorageProviderTest.kt`).
- Dependencies mocked using Mockito `mock(...)` and configured with `when(...)`.
- Kotlin backtick function names used for clear, readable test specifications:
```kotlin
@Test
fun `EUR returns identity without repository or provider call`() {
    val rate = fxService.getRate("eur", "2026-06-01")
    assertEquals(0, BigDecimal.ONE.compareTo(rate))
    verifyNoInteractions(fxRateRepository, fxRateProvider)
}
```

---

## Frontend Test Architecture & Patterns

### 1. Playwright Viewports & Matrix

Configured in `frontend/playwright.config.ts` across 4 standard projects:
- `mobile-chromium`: Pixel 7 (412x849)
- `mobile-webkit`: iPhone 13 (412x849)
- `tablet`: iPad Mini (768x1024)
- `desktop`: Desktop Chrome (1280x800)

### 2. Network & Route Mocking (`frontend/tests/shared/mocks.ts`)

- Mock data fixtures defined for users, dashboard metrics, review queues, categories, and expenses.
- Helper functions `setupAuthMocks(page, role)` and `setupAdminMocks(page)` intercept backend API endpoints via `page.route("**/api/...")` allowing frontend tests to run reliably in isolation without requiring live backend services.

### 3. Accessibility Auditing (`@axe-core/playwright`)

Accessibility validation runs on core flows and routes:
```typescript
async function expectNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter(({ impact }) =>
    impact === "critical" || impact === "serious"
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}
```

### 4. Responsive & Layout Contract Verification

Tests strictly verify responsiveness and prevent horizontal overflow:
```typescript
async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
```
- Touch targets: Mobile UI tests assert buttons have a bounding box height >= 44px.
- Visual regressions: `frontend/tests/responsive/screenshots.spec.ts` maintains baseline screenshots in `frontend/tests/__snapshots__/`.

---

## Test Directory Structure

```
backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/
├── IntegrationTestBase.kt                 # Shared base class with Testcontainers + MockMvc
├── TestAuthHelper.kt                      # Auth simulation helper
├── ContextLoadsTest.kt                    # Spring application context verification
├── controllers/                           # Spring MVC controller tests
│   ├── ExpenseControllerTest.kt
│   ├── AuthControllerTest.kt
│   ├── DashboardControllerTest.kt
│   ├── ReviewQueueControllerTest.kt
│   └── ...
├── services/                              # Domain and service unit tests
│   ├── FxServiceTest.kt
│   ├── MileageCalculationServiceTest.kt
│   ├── StorageServiceTest.kt
│   └── ...
├── report/                                # Report state machine & lifecycle tests
│   ├── ReportStateMachineTest.kt
│   └── ExpenseReportLifecycleTest.kt
├── security/                              # Security & rate limiting tests
└── migrations/                            # Flyway SQL migration regression tests

frontend/tests/
├── auth/                                  # Authentication and guard tests
│   ├── login.spec.ts
│   └── auth-guard.spec.ts
├── dashboard/                             # Dashboard feature tests
├── expenses/                              # Expense creation & list tests
├── reports/                               # Expense report lifecycle tests
├── admin/                                 # Admin panel route tests
├── responsive/                            # Layout, overflow & screenshot tests
│   ├── overflow.spec.ts
│   └── screenshots.spec.ts
├── shared/                                # Shared fixtures & API mocks
│   └── mocks.ts
├── mobile-ui.spec.ts                      # Mobile accessibility and touch contract
└── __snapshots__/                         # Baseline screenshot images
```

---

*Mapped from current repository state on 2026-08-14.*
