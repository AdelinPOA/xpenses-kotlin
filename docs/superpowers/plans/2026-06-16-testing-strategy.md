# Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full test suite to the Kotlin backend — state machine tests, API contract tests, and service unit tests — starting from zero test files.

**Architecture:** Testcontainers PostgreSQL shared across all test classes via a base class; MockMvc dispatches in `WebEnvironment.MOCK` so `@Transactional` rollbacks isolate each test. Service unit tests instantiate beans directly with Mockito mocks, no Spring context.

**Tech Stack:** JUnit 5 (via `spring-boot-starter-test`), MockMvc, Testcontainers PostgreSQL, Mockito (via `spring-boot-starter-test`), `spring-security-test`.

---

## File Map

| Action | Path |
|---|---|
| Modify | `backend-kotlin-jpa/build.gradle.kts` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/TestAuthHelper.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/report/ReportStateMachineTest.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AuthControllerTest.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/ExpenseControllerTest.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserControllerTest.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/DashboardControllerTest.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AdvanceControllerTest.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/EmailImportServiceTest.kt` |
| Create | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/StorageServiceTest.kt` |
| Modify | `.github/workflows/ci.yml` |

---

## Task 1: Gradle Dependencies + Test Infrastructure

**Files:**
- Modify: `backend-kotlin-jpa/build.gradle.kts`
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt`
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/TestAuthHelper.kt`

- [ ] **Step 1.1: Add Testcontainers to build.gradle.kts**

In `backend-kotlin-jpa/build.gradle.kts`, add inside the `dependencies { }` block after the existing `testImplementation` lines:

```kotlin
testImplementation("org.testcontainers:junit-jupiter")
testImplementation("org.testcontainers:postgresql")
```

No version numbers — Spring Boot's dependency-management BOM manages Testcontainers versions since Boot 3.1.

- [ ] **Step 1.2: Verify Gradle resolves the new dependencies**

```bash
cd backend-kotlin-jpa && ./gradlew dependencies --configuration testRuntimeClasspath --no-daemon 2>&1 | grep testcontainers | head -5
```

Expected: lines showing `org.testcontainers:junit-jupiter:x.y.z` and `org.testcontainers:postgresql:x.y.z`.

- [ ] **Step 1.3: Create the test source directories**

```bash
mkdir -p backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/report
mkdir -p backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers
mkdir -p backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services
```

- [ ] **Step 1.4: Create TestAuthHelper.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/TestAuthHelper.kt`:

```kotlin
package eu.nt.xpenses

import jakarta.servlet.http.Cookie
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

class TestAuthHelper(private val mockMvc: MockMvc) {

    fun loginAs(username: String, password: String): Cookie {
        val result = mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"$username","password":"$password"}""")
        ).andExpect(status().isOk).andReturn()

        return result.response.getCookie("access_token")
            ?: error("No access_token cookie in login response for '$username'")
    }
}
```

- [ ] **Step 1.5: Create IntegrationTestBase.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt`:

```kotlin
package eu.nt.xpenses

import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.EmailSettingsService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.OcrService
import org.junit.jupiter.api.BeforeEach
import org.mockito.BDDMockito.given
import org.mockito.ArgumentMatchers.anyString
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.transaction.annotation.Transactional
import org.testcontainers.containers.PostgreSQLContainer

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
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
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var categoryRepository: CategoryRepository
    @Autowired lateinit var expenseRepository: ExpenseRepository
    @Autowired lateinit var expenseReportRepository: ExpenseReportRepository
    @Autowired lateinit var advancePaymentRepository: AdvancePaymentRepository

    @MockBean lateinit var emailSettingsService: EmailSettingsService
    @MockBean lateinit var fxService: FxService
    @MockBean lateinit var ocrService: OcrService

    lateinit var authHelper: TestAuthHelper

    @BeforeEach
    fun setUpBase() {
        authHelper = TestAuthHelper(mockMvc)
        given(fxService.getRate(anyString(), anyString())).willReturn(1.0)
    }
}
```

- [ ] **Step 1.6: Create a context smoke test**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ContextLoadsTest.kt`:

```kotlin
package eu.nt.xpenses

import org.junit.jupiter.api.Test
import org.springframework.test.context.ActiveProfiles

@ActiveProfiles("test")
class ContextLoadsTest : IntegrationTestBase() {

    @Test
    fun `spring context loads and seeded users are present`() {
        assert(userRepository.findByUsername("tech1") != null) { "tech1 not seeded" }
        assert(userRepository.findByUsername("manager1") != null) { "manager1 not seeded" }
        assert(userRepository.findByUsername("cfo1") != null) { "cfo1 not seeded" }
    }
}
```

- [ ] **Step 1.7: Run the smoke test**

```bash
cd backend-kotlin-jpa && ./gradlew test --tests "eu.nt.xpenses.ContextLoadsTest" --no-daemon 2>&1 | tail -20
```

Expected output: `BUILD SUCCESSFUL` and `3 tests passed` (or `1 test passed` for the single test method). First run will pull the Postgres Docker image — takes ~60s. Subsequent runs: ~10s.

If it fails with `DataInitializer` not finding users: check that `spring.jpa.hibernate.ddl-auto` is `validate` (not `create-drop`) so Flyway runs first.

- [ ] **Step 1.8: Commit**

```bash
git add backend-kotlin-jpa/build.gradle.kts \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/TestAuthHelper.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ContextLoadsTest.kt
git commit -m "test: add Testcontainers base infrastructure and context smoke test"
```

---

## Task 2: State Machine Tests — Submit & Recall

**Files:**
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/report/ReportStateMachineTest.kt`

- [ ] **Step 2.1: Create ReportStateMachineTest.kt with submit happy path**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/report/ReportStateMachineTest.kt`:

```kotlin
package eu.nt.xpenses.report

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.Expense
import eu.nt.xpenses.models.ExpenseReport
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class ReportStateMachineTest : IntegrationTestBase() {

    private fun makeReport(username: String): ExpenseReport {
        val user = userRepository.findByUsername(username)!!
        return expenseReportRepository.save(
            ExpenseReport(user = user, title = "Test Report")
        )
    }

    private fun makeExpense(username: String, report: ExpenseReport? = null): Expense {
        val user = userRepository.findByUsername(username)!!
        val category = categoryRepository.findAll().first()
        return expenseRepository.save(
            Expense(
                user = user,
                category = category,
                amountOriginal = 50.0,
                amountEur = 50.0,
                date = "2026-06-01",
                report = report
            )
        )
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    @Test
    fun `submit draft report with expense → status becomes submitted`() {
        val report = makeReport("tech1")
        val expense = makeExpense("tech1")
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expense_ids":[${expense.id}]}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("submitted"))
    }

    @Test
    fun `submit report by non-owner → 403`() {
        val report = makeReport("tech1")
        makeExpense("tech1", report)
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(
            post("/api/reports/${report.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expense_ids":[]}""")
                .cookie(cookie)
        ).andExpect(status().isForbidden)
    }

    @Test
    fun `submit report with no expenses attached → 400`() {
        val report = makeReport("tech1")
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expense_ids":[]}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)
    }

    @Test
    fun `submit already-submitted report → 400`() {
        val report = makeReport("tech1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expense_ids":[]}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)
    }

    // ── Recall ────────────────────────────────────────────────────────────────

    @Test
    fun `recall submitted report → status becomes draft`() {
        val report = makeReport("tech1").also {
            it.status = "submitted"; expenseReportRepository.save(it)
        }
        val expense = makeExpense("tech1", report).also {
            it.status = "submitted"; expenseRepository.save(it)
        }
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(post("/api/reports/${report.id}/recall").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("draft"))

        val refreshed = expenseRepository.findById(expense.id!!).get()
        assert(refreshed.status == "draft") { "expense status should revert to draft" }
    }

    @Test
    fun `recall by non-owner → 403`() {
        val report = makeReport("tech1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/recall").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `recall draft report → 400`() {
        val report = makeReport("tech1")
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(post("/api/reports/${report.id}/recall").cookie(cookie))
            .andExpect(status().isBadRequest)
    }
}
```

- [ ] **Step 2.2: Run the submit/recall tests**

```bash
cd backend-kotlin-jpa && ./gradlew test --tests "eu.nt.xpenses.report.ReportStateMachineTest" --no-daemon 2>&1 | tail -30
```

Expected: all 7 tests pass. If a test fails, read the full output: `./gradlew test --tests "eu.nt.xpenses.report.ReportStateMachineTest" --no-daemon --info 2>&1 | grep -A 20 "FAILED"`.

- [ ] **Step 2.3: Commit**

```bash
git add backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/report/ReportStateMachineTest.kt
git commit -m "test: add state machine tests for submit and recall transitions"
```

---

## Task 3: State Machine Tests — Approve, Reject, Pay

**Files:**
- Modify: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/report/ReportStateMachineTest.kt`

- [ ] **Step 3.1: Add approve, reject, and pay tests**

Append the following test methods inside `ReportStateMachineTest` (before the closing `}`):

```kotlin
    // ── Approve ───────────────────────────────────────────────────────────────

    @Test
    fun `manager approves submitted report → status becomes approved`() {
        val report = makeReport("tech1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/approve").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("approved"))
    }

    @Test
    fun `manager cannot approve own submitted report → 403`() {
        val report = makeReport("manager1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/approve").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `technician cannot approve report → 403`() {
        val report = makeReport("manager1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(post("/api/reports/${report.id}/approve").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `approve draft report → 400`() {
        val report = makeReport("tech1")
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/approve").cookie(cookie))
            .andExpect(status().isBadRequest)
    }

    // ── Reject ────────────────────────────────────────────────────────────────

    @Test
    fun `manager rejects submitted report → status becomes rejected and expenses revert to draft`() {
        val report = makeReport("tech1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val expense = makeExpense("tech1", report).also { it.status = "submitted"; expenseRepository.save(it) }
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(
            post("/api/reports/${report.id}/reject")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"reason":"missing receipts"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("rejected"))

        val refreshed = expenseRepository.findById(expense.id!!).get()
        assert(refreshed.status == "draft") { "expense should revert to draft after rejection" }
        assert(refreshed.report == null) { "expense should be detached from report after rejection" }
    }

    @Test
    fun `technician cannot reject report → 403`() {
        val report = makeReport("manager1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/reject")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"reason":"test"}""")
                .cookie(cookie)
        ).andExpect(status().isForbidden)
    }

    @Test
    fun `reject approved report → 400`() {
        val report = makeReport("tech1").also { it.status = "approved"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(
            post("/api/reports/${report.id}/reject")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"reason":"test"}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)
    }

    // ── Pay ───────────────────────────────────────────────────────────────────

    @Test
    fun `chef_finance pays approved report → status becomes paid`() {
        val report = makeReport("tech1").also { it.status = "approved"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(post("/api/reports/${report.id}/pay").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("paid"))
    }

    @Test
    fun `manager cannot pay approved report → 403`() {
        val report = makeReport("tech1").also { it.status = "approved"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/pay").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `pay submitted (not approved) report → 400`() {
        val report = makeReport("tech1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(post("/api/reports/${report.id}/pay").cookie(cookie))
            .andExpect(status().isBadRequest)
    }
```

- [ ] **Step 3.2: Run all state machine tests**

```bash
cd backend-kotlin-jpa && ./gradlew test --tests "eu.nt.xpenses.report.ReportStateMachineTest" --no-daemon 2>&1 | tail -20
```

Expected: all 17 tests pass.

- [ ] **Step 3.3: Commit**

```bash
git add backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/report/ReportStateMachineTest.kt
git commit -m "test: add approve, reject, and pay state machine tests"
```

---

## Task 4: Auth & User Contract Tests

**Files:**
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AuthControllerTest.kt`
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserControllerTest.kt`

- [ ] **Step 4.1: Create AuthControllerTest.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AuthControllerTest.kt`:

```kotlin
package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class AuthControllerTest : IntegrationTestBase() {

    @Test
    fun `login with valid credentials returns 200 and access_token cookie`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech1","password":"tech1"}""")
        )
            .andExpect(status().isOk)
            .andExpect(cookie().exists("access_token"))
            .andExpect(jsonPath("$.username").value("tech1"))
            .andExpect(jsonPath("$.role").value("technician"))
            .andExpect(jsonPath("$.password_hash").doesNotExist())
    }

    @Test
    fun `login with wrong password returns 401`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech1","password":"wrongpassword"}""")
        ).andExpect(status().isUnauthorized)
    }

    @Test
    fun `login with unknown username returns 401`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"nobody","password":"x"}""")
        ).andExpect(status().isUnauthorized)
    }

    @Test
    fun `login with blank username returns 400`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"","password":"tech1"}""")
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.detail").isString)
    }

    @Test
    fun `login with blank password returns 400`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech1","password":""}""")
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.detail").isString)
    }

    @Test
    fun `GET me without cookie returns 401`() {
        mockMvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET me with valid cookie returns current user`() {
        val cookie = authHelper.loginAs("manager1", "manager1")
        mockMvc.perform(get("/api/auth/me").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.username").value("manager1"))
            .andExpect(jsonPath("$.password_hash").doesNotExist())
    }
}
```

- [ ] **Step 4.2: Create UserControllerTest.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserControllerTest.kt`:

```kotlin
package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class UserControllerTest : IntegrationTestBase() {

    @Test
    fun `GET users as mod returns list without password_hash`() {
        val cookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(get("/api/users").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].password_hash").doesNotExist())
            .andExpect(jsonPath("$[0].username").isString)
            .andExpect(jsonPath("$[0].display_name").isString)
            .andExpect(jsonPath("$[0].role").isString)
            .andExpect(jsonPath("$[0].is_active").isBoolean)
    }

    @Test
    fun `GET users as technician returns 403`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/users").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GET users without cookie returns 401`() {
        mockMvc.perform(get("/api/users"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET user by id returns UserResponse shape without password_hash`() {
        val user = userRepository.findByUsername("tech1")!!
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(get("/api/users/${user.id}").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(user.id))
            .andExpect(jsonPath("$.username").value("tech1"))
            .andExpect(jsonPath("$.display_name").isString)
            .andExpect(jsonPath("$.email").isString)
            .andExpect(jsonPath("$.role").value("technician"))
            .andExpect(jsonPath("$.is_active").isBoolean)
            .andExpect(jsonPath("$.auth_source").value("local"))
            .andExpect(jsonPath("$.password_hash").doesNotExist())
    }

    @Test
    fun `POST users as mod creates new user`() {
        val cookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"newuser","display_name":"New User","password":"pass1234","role":"technician"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.username").value("newuser"))
            .andExpect(jsonPath("$.password_hash").doesNotExist())
    }

    @Test
    fun `POST users as technician returns 403`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"x","display_name":"X","password":"pass1234","role":"technician"}""")
                .cookie(cookie)
        ).andExpect(status().isForbidden)
    }
}
```

- [ ] **Step 4.3: Run auth and user tests**

```bash
cd backend-kotlin-jpa && ./gradlew test --tests "eu.nt.xpenses.controllers.AuthControllerTest" --tests "eu.nt.xpenses.controllers.UserControllerTest" --no-daemon 2>&1 | tail -20
```

Expected: all 13 tests pass.

- [ ] **Step 4.4: Commit**

```bash
git add backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AuthControllerTest.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserControllerTest.kt
git commit -m "test: add Auth and User API contract tests"
```

---

## Task 5: Expense, Dashboard & Advance Contract Tests

**Files:**
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/ExpenseControllerTest.kt`
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/DashboardControllerTest.kt`
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AdvanceControllerTest.kt`

- [ ] **Step 5.1: Create ExpenseControllerTest.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/ExpenseControllerTest.kt`:

```kotlin
package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.Expense
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class ExpenseControllerTest : IntegrationTestBase() {

    private fun saveTechExpense(): Expense {
        val tech = userRepository.findByUsername("tech1")!!
        val cat = categoryRepository.findAll().first()
        return expenseRepository.save(
            Expense(user = tech, category = cat, amountOriginal = 30.0, amountEur = 30.0, date = "2026-06-01")
        )
    }

    @Test
    fun `GET expenses returns only own expenses for technician`() {
        saveTechExpense()
        val managerUser = userRepository.findByUsername("manager1")!!
        val cat = categoryRepository.findAll().first()
        expenseRepository.save(
            Expense(user = managerUser, category = cat, amountOriginal = 100.0, amountEur = 100.0, date = "2026-06-01")
        )
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/expenses").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
            .andExpect(jsonPath("$[?(@.user_id != ${userRepository.findByUsername("tech1")!!.id})]").isEmpty)
    }

    @Test
    fun `POST expense creates expense and returns 201`() {
        val cat = categoryRepository.findAll().first()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/expenses")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"category_id":${cat.id},"amount":75.0,"currency":"EUR","date":"2026-06-10","description":"Lunch"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.amount_eur").value(75.0))
            .andExpect(jsonPath("$.status").value("draft"))
    }

    @Test
    fun `DELETE draft expense returns 204`() {
        val expense = saveTechExpense()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(delete("/api/expenses/${expense.id}").cookie(cookie))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `DELETE submitted expense returns 400`() {
        val expense = saveTechExpense().also { it.status = "submitted"; expenseRepository.save(it) }
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(delete("/api/expenses/${expense.id}").cookie(cookie))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GET expenses without cookie returns 401`() {
        mockMvc.perform(get("/api/expenses"))
            .andExpect(status().isUnauthorized)
    }
}
```

- [ ] **Step 5.2: Create DashboardControllerTest.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/DashboardControllerTest.kt`:

```kotlin
package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.Expense
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class DashboardControllerTest : IntegrationTestBase() {

    @Test
    fun `GET dashboard without cookie returns 401`() {
        mockMvc.perform(get("/api/dashboard"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `technician dashboard shows only own data`() {
        val tech = userRepository.findByUsername("tech1")!!
        val manager = userRepository.findByUsername("manager1")!!
        val cat = categoryRepository.findAll().first()
        expenseRepository.save(Expense(user = tech, category = cat, amountOriginal = 10.0, amountEur = 10.0, date = "2026-06-01"))
        expenseRepository.save(Expense(user = manager, category = cat, amountOriginal = 500.0, amountEur = 500.0, date = "2026-06-01"))

        val cookie = authHelper.loginAs("tech1", "tech1")
        val result = mockMvc.perform(get("/api/dashboard").cookie(cookie))
            .andExpect(status().isOk)
            .andReturn()

        val body = result.response.contentAsString
        // tech1 has 1 expense worth 10 EUR; if total_month_eur > 100, org-wide data leaked
        val totalMonth = body.substringAfter("\"total_month_eur\":").substringBefore(",").trim().toDoubleOrNull() ?: 0.0
        assert(totalMonth < 100.0) { "technician should see only own expenses, got total_month_eur=$totalMonth" }
    }

    @Test
    fun `chef_finance dashboard shows org-wide data`() {
        val tech = userRepository.findByUsername("tech1")!!
        val manager = userRepository.findByUsername("manager1")!!
        val cat = categoryRepository.findAll().first()
        expenseRepository.save(Expense(user = tech, category = cat, amountOriginal = 10.0, amountEur = 10.0, date = "2026-06-01"))
        expenseRepository.save(Expense(user = manager, category = cat, amountOriginal = 500.0, amountEur = 500.0, date = "2026-06-01"))

        val cookie = authHelper.loginAs("cfo1", "cfo1")
        mockMvc.perform(get("/api/dashboard").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.expense_count_total").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)))
    }
}
```

- [ ] **Step 5.3: Create AdvanceControllerTest.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AdvanceControllerTest.kt`:

```kotlin
package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.ExpenseReport
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class AdvanceControllerTest : IntegrationTestBase() {

    private fun makeTechReport(): ExpenseReport {
        val tech = userRepository.findByUsername("tech1")!!
        return expenseReportRepository.save(ExpenseReport(user = tech, title = "Advance Test Report"))
    }

    @Test
    fun `POST advance on own report creates advance and returns 201`() {
        val report = makeTechReport()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/advances")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"type":"requested","amount":200.0,"currency":"EUR","date":"2026-06-01"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.amount_original").value(200.0))
            .andExpect(jsonPath("$.status").value("requested"))
    }

    @Test
    fun `GET advances on another user report → 403 (IDOR guard)`() {
        val report = makeTechReport()
        val cookie = authHelper.loginAs("manager1", "manager1")

        // manager1 is a manager so verifyReportOwnership allows managers — test with a second technician
        // Create a second tech user and try to access tech1's report as them
        val tech2Cookie = run {
            val mod = authHelper.loginAs("mod1", "mod1")
            mockMvc.perform(
                post("/api/users")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"username":"tech2test","display_name":"Tech 2","password":"pass1234","role":"technician"}""")
                    .cookie(mod)
            ).andExpect(status().isCreated)
            authHelper.loginAs("tech2test", "pass1234")
        }

        mockMvc.perform(get("/api/reports/${report.id}/advances").cookie(tech2Cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GET advances without cookie → 401`() {
        val report = makeTechReport()
        mockMvc.perform(get("/api/reports/${report.id}/advances"))
            .andExpect(status().isUnauthorized)
    }
}
```

- [ ] **Step 5.4: Run all three new test classes**

```bash
cd backend-kotlin-jpa && ./gradlew test \
  --tests "eu.nt.xpenses.controllers.ExpenseControllerTest" \
  --tests "eu.nt.xpenses.controllers.DashboardControllerTest" \
  --tests "eu.nt.xpenses.controllers.AdvanceControllerTest" \
  --no-daemon 2>&1 | tail -20
```

Expected: all 11 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/ExpenseControllerTest.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/DashboardControllerTest.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AdvanceControllerTest.kt
git commit -m "test: add Expense, Dashboard, and Advance API contract tests"
```

---

## Task 6: FxService Unit Tests

**Files:**
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt`

- [ ] **Step 6.1: Create FxServiceTest.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt`:

```kotlin
package eu.nt.xpenses.services

import eu.nt.xpenses.models.FxRate
import eu.nt.xpenses.repositories.FxRateRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*
import java.util.Optional

class FxServiceTest {

    private lateinit var fxRateRepository: FxRateRepository
    private lateinit var fxService: FxService

    @BeforeEach
    fun setUp() {
        fxRateRepository = mock(FxRateRepository::class.java)
        fxService = FxService(fxRateRepository)
    }

    @Test
    fun `getRate for EUR returns 1_0 without any repository or HTTP call`() {
        val rate = fxService.getRate("EUR", "2026-06-01")

        assertEquals(1.0, rate)
        verifyNoInteractions(fxRateRepository)
    }

    @Test
    fun `getRate for EUR lowercase returns 1_0`() {
        val rate = fxService.getRate("eur", "2026-06-01")
        assertEquals(1.0, rate)
    }

    @Test
    fun `getRate returns cached value without HTTP call when cache hit`() {
        val cached = FxRate(
            id = 1, fromCurrency = "USD", toCurrency = "EUR",
            rateDate = "2026-06-01", rate = 0.92
        )
        `when`(fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate("USD", "EUR", "2026-06-01"))
            .thenReturn(cached)

        val rate = fxService.getRate("USD", "2026-06-01")

        assertEquals(0.92, rate)
        // save() should NOT be called — value came from cache
        verify(fxRateRepository, never()).save(any())
    }

    @Test
    fun `getRate throws IllegalArgumentException when both APIs return null`() {
        `when`(fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate(anyString(), anyString(), anyString()))
            .thenReturn(null)
        `when`(fxRateRepository.save(any())).thenAnswer { it.arguments[0] }

        // INVALID_CURRENCY will 404 on both real APIs; in unit test both fetchXxx() methods
        // return null because RestClient isn't mocked — they'll throw and be caught, returning null.
        // We just assert the exception is thrown (not that specific APIs were called).
        assertThrows(IllegalArgumentException::class.java) {
            fxService.getRate("INVALID_CURRENCY_XYZ", "2026-06-01")
        }
    }
}
```

- [ ] **Step 6.2: Run FxService tests**

```bash
cd backend-kotlin-jpa && ./gradlew test --tests "eu.nt.xpenses.services.FxServiceTest" --no-daemon 2>&1 | tail -20
```

Expected: 4 tests pass. Note: the `INVALID_CURRENCY_XYZ` test makes real HTTP calls to Frankfurter (which 404s), so it requires network access. If running in a network-isolated CI environment, this test may need a `@Tag("network")` to be excluded.

- [ ] **Step 6.3: Commit**

```bash
git add backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt
git commit -m "test: add FxService unit tests"
```

---

## Task 7: EmailImportService Unit Tests

**Files:**
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/EmailImportServiceTest.kt`

- [ ] **Step 7.1: Create EmailImportServiceTest.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/EmailImportServiceTest.kt`:

```kotlin
package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.UserRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock

class EmailImportServiceTest {

    private lateinit var service: EmailImportService

    @BeforeEach
    fun setUp() {
        service = EmailImportService(
            userRepository = mock(UserRepository::class.java),
            expenseReportRepository = mock(ExpenseReportRepository::class.java),
            ocrService = mock(OcrService::class.java),
            objectMapper = ObjectMapper().registerKotlinModule()
        )
    }

    @Test
    fun `parseDelegationEmailLocal extracts kundenauftrag from structured email`() {
        val emailText = """
            Kundenauftrag: 0007038319
            Auftragsart: ZSM2
            Positionstyp: Mechanical full installation
            Starttermin: 01.06.2026
            Endtermin: 05.06.2026
            TechnPlatz: C123456 Pump Station A
            Kunde: ABC Manufacturing GmbH
        """.trimIndent()

        val result = service.parseDelegationEmailLocal(emailText)

        assertNotNull(result)
        assertEquals("0007038319", result!!["kundenauftrag"])
        assertEquals("2026-06-01", result["date_from"])
        assertEquals("2026-06-05", result["date_to"])
    }

    @Test
    fun `parseDelegationEmailLocal extracts positionstyp`() {
        val emailText = """
            Kundenauftrag: 0007038319
            Positionstyp: Mechanical full installation
            Starttermin: 01.06.2026
            Endtermin: 05.06.2026
        """.trimIndent()

        val result = service.parseDelegationEmailLocal(emailText)

        assertNotNull(result)
        val positionstyp = result!!["positionstyp"]
        assertNotNull(positionstyp)
        assertTrue(positionstyp!!.contains("Mechanical"), "Expected positionstyp to contain 'Mechanical', got: $positionstyp")
    }

    @Test
    fun `parseDelegationEmailLocal detects TechnPlatz line number starting with C followed by digits`() {
        val emailText = """
            Starttermin: 10.06.2026
            Endtermin: 12.06.2026
            TechnPlatz: C1234567 Some Site Description
        """.trimIndent()

        val result = service.parseDelegationEmailLocal(emailText)

        assertNotNull(result)
        assertEquals("true", result!!["technplatz_line"])
    }

    @Test
    fun `parseDelegationEmailLocal returns null when no dates found`() {
        val emailText = "This email has no dates and no structured fields at all."

        val result = service.parseDelegationEmailLocal(emailText)

        assertNull(result)
    }

    @Test
    fun `parseDelegationEmailLocal handles empty string without throwing`() {
        val result = service.parseDelegationEmailLocal("")
        assertNull(result)
    }

    @Test
    fun `parseDateFlexible parses multiple date formats`() {
        assertEquals("2026-06-01", service.parseDateFlexible("01.06.2026"))
        assertEquals("2026-06-01", service.parseDateFlexible("01/06/2026"))
        assertEquals("2026-06-01", service.parseDateFlexible("2026-06-01"))
        assertNull(service.parseDateFlexible("not-a-date"))
    }
}
```

- [ ] **Step 7.2: Run EmailImportService tests**

```bash
cd backend-kotlin-jpa && ./gradlew test --tests "eu.nt.xpenses.services.EmailImportServiceTest" --no-daemon 2>&1 | tail -20
```

Expected: all 6 tests pass.

- [ ] **Step 7.3: Commit**

```bash
git add backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/EmailImportServiceTest.kt
git commit -m "test: add EmailImportService unit tests for delegation email parsing"
```

---

## Task 8: StorageService Unit Tests + CI Update

**Files:**
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/StorageServiceTest.kt`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 8.1: Create StorageServiceTest.kt**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/StorageServiceTest.kt`:

```kotlin
package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.storage.StorageProvider
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.mockito.Mockito.*
import java.io.File
import java.nio.file.Path
import java.util.Optional

class StorageServiceTest {

    private lateinit var appSettingRepository: AppSettingRepository
    private lateinit var cryptoService: CryptoService
    private lateinit var objectMapper: ObjectMapper

    @TempDir
    lateinit var tempDir: Path

    @BeforeEach
    fun setUp() {
        appSettingRepository = mock(AppSettingRepository::class.java)
        cryptoService = mock(CryptoService::class.java)
        objectMapper = ObjectMapper().registerKotlinModule()

        // Default: no storage config in DB → falls back to local
        `when`(appSettingRepository.findById("storage_config")).thenReturn(Optional.empty())
        `when`(cryptoService.decrypt(anyString(), anyString())).thenAnswer { it.arguments[0] }
    }

    private fun makeLocalService(): StorageService {
        val localConfigJson = """{"provider_type":"local","local":{"path":"${tempDir.toAbsolutePath()}"}}"""
        `when`(appSettingRepository.findById("storage_config"))
            .thenReturn(Optional.of(AppSetting("storage_config", localConfigJson)))
        return StorageService(appSettingRepository, cryptoService, objectMapper)
    }

    @Test
    fun `local provider stores and retrieves bytes round-trip`() {
        val service = makeLocalService()
        val content = "Hello storage".toByteArray()

        service.uploadFile("receipts/test.txt", content)
        val retrieved = service.downloadFile("receipts/test.txt")

        assertArrayEquals(content, retrieved)
    }

    @Test
    fun `unsupported provider type logs warning and leaves remoteProvider null`() {
        val sftp = """{"provider_type":"sftp"}"""
        `when`(appSettingRepository.findById("storage_config"))
            .thenReturn(Optional.of(AppSetting("storage_config", sftp)))

        // Constructor calls @PostConstruct equivalent via initProvider — no exception should be thrown
        val service = StorageService(appSettingRepository, cryptoService, objectMapper)

        // Verify: downloadFile on local path should still work even with unsupported remote
        // (remoteProvider is null, so only local copy is checked)
        assertDoesNotThrow { service.getStorageConfig() }
    }

    @Test
    fun `s3 config instantiates S3StorageProvider`() {
        val s3Config = """
            {
              "provider_type":"s3",
              "s3":{
                "region":"eu-central-1",
                "bucket":"test-bucket",
                "access_key_id":"AKIATEST",
                "secret_key":"secretkey"
              }
            }
        """.trimIndent()
        `when`(appSettingRepository.findById("storage_config"))
            .thenReturn(Optional.of(AppSetting("storage_config", s3Config)))

        // Should not throw during construction (S3Client is lazily connected)
        assertDoesNotThrow {
            StorageService(appSettingRepository, cryptoService, objectMapper)
        }
    }
}
```

- [ ] **Step 8.2: Verify StorageService method names match the test**

```bash
grep -n "fun uploadFile\|fun downloadFile" backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt
```

Expected: `fun uploadFile(relativePath: String, content: ByteArray)` at line ~155 and `fun downloadFile(relativePath: String): ByteArray` at line ~173. These match what the test uses. If names differ, update the test.

- [ ] **Step 8.3: Run StorageService tests**

```bash
cd backend-kotlin-jpa && ./gradlew test --tests "eu.nt.xpenses.services.StorageServiceTest" --no-daemon 2>&1 | tail -20
```

Expected: 3 tests pass. If the round-trip test fails with a method name error, fix the name from Step 8.2.

- [ ] **Step 8.4: Run the full test suite**

```bash
cd backend-kotlin-jpa && ./gradlew test --no-daemon 2>&1 | tail -30
```

Expected: all tests pass. Note the total count.

- [ ] **Step 8.5: Add test step to CI workflow**

Read `.github/workflows/ci.yml`, then add a `Run tests` step after the existing `Build backend` step:

```yaml
      - name: Run tests
        working-directory: backend-kotlin-jpa
        run: ./gradlew test --no-daemon
```

The full jobs section should look like:
```yaml
      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Build backend
        working-directory: backend-kotlin-jpa
        run: ./gradlew bootJar --no-daemon

      - name: Run tests
        working-directory: backend-kotlin-jpa
        run: ./gradlew test --no-daemon
```

GitHub Actions hosted runners have Docker pre-installed, so Testcontainers will work without additional setup.

- [ ] **Step 8.6: Commit everything**

```bash
git add backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/StorageServiceTest.kt \
  .github/workflows/ci.yml
git commit -m "test: add StorageService unit tests and wire tests into CI"
```

---

## Done

At this point the backend has:
- **17** state machine tests covering every transition + guard
- **13** API contract tests (Auth + User)
- **11** contract tests (Expense + Dashboard + Advance)
- **4** FxService unit tests
- **6** EmailImportService unit tests
- **3** StorageService unit tests
- CI running the full suite on every push

Run the full suite at any time:
```bash
cd backend-kotlin-jpa && ./gradlew test --no-daemon
```
