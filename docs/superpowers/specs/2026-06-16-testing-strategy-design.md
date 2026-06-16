# Testing Strategy Design — xpenses-kotlin Kotlin Backend

**Date**: 2026-06-16  
**Scope**: Backend only (`backend-kotlin-jpa/`). No frontend test changes.  
**Priority order**: State machine → API contracts → Service unit tests

---

## 1. Goals

- Provide a safety net for the report state machine (the highest-value business logic)
- Verify HTTP API contracts: status codes, JSON shapes, auth guards
- Unit-test service-layer edge cases against mocked external dependencies
- Run entirely in CI with no manual setup (Docker required for Testcontainers)

## 2. Non-Goals

- No frontend tests
- No performance / load tests
- No SFTP/SMB/WebDAV storage provider tests (those providers remain stubbed)
- No full end-to-end browser tests

---

## 3. Infrastructure & Test Base

### Dependencies (test scope only)

Add to `build.gradle.kts`:
```kotlin
testImplementation("org.testcontainers:junit-jupiter")
testImplementation("org.testcontainers:postgresql")
```

Spring Boot's dependency-management BOM manages Testcontainers versions — no explicit version needed.

### Shared PostgreSQL container

One `PostgreSQLContainer` per JVM run, held in a companion object on `IntegrationTestBase`. All integration test classes extend this base. Spring datasource properties are overridden via `@DynamicPropertySource`. Container starts once; Flyway runs once; `DataInitializer` seeds the four standard users (`tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, `mod1/mod1`).

Tests use `@SpringBootTest(webEnvironment = WebEnvironment.MOCK)` with `@AutoConfigureMockMvc`. MockMvc dispatches requests synchronously in the same thread, so each test method annotated `@Transactional` wraps the entire request processing and rolls back after — no manual truncation needed, full isolation guaranteed.

### Auth helper

`TestAuthHelper` — a helper class (not a Spring component) that takes a `MockMvc` instance and performs a real `POST /api/auth/login`. Returns a `RequestPostProcessor` that injects the extracted `access_token` cookie into subsequent MockMvc requests. Tests exercise the real JWT filter path — no `@WithMockUser` shortcuts.

```kotlin
// Usage in tests:
val techAuth = authHelper.loginAs("tech1", "tech1")
mockMvc.perform(get("/api/reports").with(techAuth))
```

### External service mocks

The following beans are `@MockBean`-ed in `IntegrationTestBase` so tests never touch external systems:

| Bean | Why mocked |
|---|---|
| `EmailSettingsService` | Sends SMTP — no mail server in CI |
| `FxService` | HTTP calls to Frankfurter / fallback API |
| `OcrService` | Spawns Python subprocess |

Default mock behavior: `emailSettingsService.sendEmail(...)` does nothing; `fxService.getRate(...)` returns `1.0`.

### File layout

```
backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/
├── IntegrationTestBase.kt          # Shared container, MockMvc, mocks, authHelper
├── TestAuthHelper.kt               # Login helper → RequestPostProcessor
├── report/
│   └── ReportStateMachineTest.kt   # All state machine transitions + guards
├── controllers/
│   ├── AuthControllerTest.kt
│   ├── ExpenseControllerTest.kt
│   ├── UserControllerTest.kt
│   ├── DashboardControllerTest.kt
│   └── AdvanceControllerTest.kt
└── services/
    ├── FxServiceTest.kt
    ├── EmailImportServiceTest.kt
    └── StorageServiceTest.kt
```

---

## 4. State Machine Tests

**File**: `report/ReportStateMachineTest.kt`

Data setup: create entities via repositories directly (not HTTP) in `@BeforeEach`. Each test is one transition call via MockMvc.

### Transitions covered

#### `draft → submitted`
- **Happy path**: owner submits report with ≥1 expense attached → `200`, status becomes `submitted`
- **Guard: non-owner**: different user tries to submit → `403`
- **Guard: empty report**: no expenses attached → `400`
- **Guard: wrong status**: already-submitted report submitted again → `400`

#### `submitted → draft` (recall)
- **Happy path**: owner recalls submitted report → `200`, status becomes `draft`, expenses revert to `draft`
- **Guard: non-owner**: → `403`
- **Guard: wrong status**: draft report recalled → `400`

#### `submitted → approved`
- **Happy path**: `manager1` approves → `200`, status becomes `approved`
- **Guard: self-approval**: `manager1` submits own report → tries to approve it → `403`
- **Guard: wrong role**: technician tries to approve → `403`
- **Guard: wrong status**: draft report approved → `400`

#### `submitted → rejected`
- **Happy path**: `manager1` rejects → `200`, status becomes `rejected`, expenses detach back to `draft`
- **Guard: wrong role**: technician → `403`
- **Guard: wrong status**: already-approved report → `400`

#### `approved → paid`
- **Happy path**: `cfo1` pays → `200`, status becomes `paid`
- **Guard: manager cannot pay**: `manager1` tries to pay → `403`
- **Guard: wrong status**: submitted (not approved) report → `400`

---

## 5. API Contract Tests

**Location**: `controllers/`  
Focus: HTTP status codes, JSON field presence/absence, role guards. No duplication of state machine logic.

### AuthControllerTest
- `POST /api/auth/login` with valid credentials → `200`, response contains `user.username`, no `password_hash`
- Invalid credentials → `401`
- `@Valid` rejects blank username → `400` with `detail` field
- `@Valid` rejects blank password → `400` with `detail` field

### ExpenseControllerTest
- `GET /api/expenses` — technician sees only own expenses (not others')
- `POST /api/expenses` → `201`, returns created expense
- `DELETE /api/expenses/{id}` on draft expense → `204`
- `DELETE /api/expenses/{id}` on submitted expense → `400`
- No cookie → `401`

### UserControllerTest
- `GET /api/users` returns list with no `password_hash` field on any item
- `GET /api/users/{id}` returns `UserResponse` shape: `id`, `username`, `display_name`, `email`, `role`, `is_active` present; `password_hash` absent
- `POST /api/users` as technician → `403`
- `POST /api/users` as `mod1` → `201`

### DashboardControllerTest
- `chef_finance` calling `GET /api/dashboard` sees aggregated org-wide data
- Technician calling `GET /api/dashboard` sees only own data (verify `total_reports` scoped)
- No cookie → `401`

### AdvanceControllerTest
- `POST /api/reports/{id}/advances` creates advance on own report → `201`
- `GET /api/reports/{id}/advances` on another user's report → `403` (IDOR guard)
- Approve advance as `chef_finance` → `200`

### JSON shape assertion pattern

Use `jsonPath` field-level assertions rather than full-body comparisons:
```kotlin
.andExpect(jsonPath("$.password_hash").doesNotExist())
.andExpect(jsonPath("$.username").value("tech1"))
.andExpect(jsonPath("$.display_name").isString)
```

---

## 6. Service Unit Tests

**Location**: `services/`  
Pure Kotlin, no Spring context. Dependencies injected manually or mocked with Mockito.

### FxServiceTest
- `getRate("EUR", anyDate)` returns `1.0` without any HTTP call
- When Frankfurter returns null, fallback API is called
- Second call for same `(currency, date)` is served from the `fx_rates` DB cache without HTTP (mock repository returns cached value)
- When both APIs return `0.0`, `IllegalArgumentException` is thrown

### EmailImportServiceTest
- Parse a well-formed delegation email with Kundenauftrag, Positionstyp, TechnPlatz fields → correct values extracted
- Parse email missing optional fields → result has nulls for missing fields, no exception
- Malformed/empty email body → returns empty/default `DelegationDetails`, no exception

### StorageServiceTest
- Local provider: `storeFile` + `downloadFile` round-trip returns original bytes
- When config specifies `provider_type = "s3"`, `remoteProvider` is an `S3StorageProvider` instance
- When config specifies unsupported type (e.g. `"sftp"`), `remoteProvider` is null and a warning is logged
- `downloadFile` on local-only config never calls `remoteProvider`

---

## 7. What Is Not Tested

| Area | Reason |
|---|---|
| PDF generation | Binary output; correctness verified manually |
| OCR subprocess | Requires Python + model files; mocked at service boundary |
| SMTP delivery | No mail server in CI; mocked |
| S3 real upload | Requires AWS credentials; `S3StorageProvider` is unit-tested with a mock S3Client |
| SFTP/SMB/WebDAV | Providers are stubs; nothing to test |

---

## 8. CI Integration

The existing `.github/workflows/ci.yml` already runs `./gradlew bootJar`. Add a separate step:
```yaml
- name: Run tests
  run: ./gradlew test --no-daemon
  working-directory: backend-kotlin-jpa
```

Testcontainers requires Docker to be available in the CI runner. GitHub Actions hosted runners have Docker pre-installed — no additional setup needed.
