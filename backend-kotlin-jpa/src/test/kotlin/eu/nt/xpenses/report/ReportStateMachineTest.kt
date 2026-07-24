package eu.nt.xpenses.report

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.math.BigDecimal

class ReportStateMachineTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager

    private fun makeReport(username: String): ExpenseReport {
        val user = userRepository.findByUsername(username)!!
        return expenseReportRepository.save(
            ExpenseReport(user = user, title = "Test Report")
        )
    }

    private fun makeExpense(username: String, report: ExpenseReport? = null): Expense {
        val user = userRepository.findByUsername(username)!!
        val category = categoryRepository.findAll().firstOrNull()
            ?: error("No seeded category found — check DataInitializer")
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

    // ── Submit ────────────────────────────────────────────────────────────────

    @Test
    fun `submit draft report with expense → status becomes submitted`() {
        val report = makeReport("tech1")
        // Pre-attach the expense so the controller can find it via the lazy expenses
        // collection. Hibernate's FlushMode.AUTO does not auto-flush before lazy
        // collection loads, only before JPQL queries — so attaching via expense_ids
        // inside the submit call would result in the collection appearing empty.
        makeExpense("tech1", report)
        // Flush + clear: ensures the controller loads fresh entities from DB and the
        // expenses lazy collection is uninitialized (not the stale empty list from
        // when the report was first created in this transaction).
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expense_ids":[]}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("submitted"))
    }

    @Test
    fun `submit report by non-owner → 403`() {
        val report = makeReport("tech1")
        makeExpense("tech1", report)
        entityManager.flush()
        entityManager.clear()
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
        entityManager.flush()
        entityManager.clear()
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
        val report = makeReport("tech1")
        report.status = "submitted"
        expenseReportRepository.save(report)
        entityManager.flush()
        entityManager.clear()
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
        // Flush + clear so the controller loads fresh entities from DB, bypassing the
        // initialized-empty collection that Hibernate cached when the report was created.
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(post("/api/reports/${report.id}/recall").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("draft"))

        // entityManager.clear() before MockMvc emptied the cache; the controller wrote within
        // the same outer transaction, so findById here sees the controller's committed-to-session writes.
        val refreshed = expenseRepository.findById(expense.id!!).get()
        assertEquals("draft", refreshed.status, "expense status should revert to draft")
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

    // ── Approve ───────────────────────────────────────────────────────────────

    @Test
    fun `manager approves submitted report → status approved and expenses approved`() {
        val report = makeReport("tech1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val expense = makeExpense("tech1", report).also { it.status = "submitted"; expenseRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/approve").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("approved"))

        val refreshed = expenseRepository.findById(expense.id!!).get()
        assertEquals("approved", refreshed.status, "expense status should become approved")
    }

    @Test
    fun `manager cannot approve own submitted report → 400`() {
        val report = makeReport("manager1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/approve").cookie(cookie))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `technician cannot approve report → 403`() {
        val report = makeReport("manager1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(post("/api/reports/${report.id}/approve").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `approve draft report → 400`() {
        val report = makeReport("tech1")
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/approve").cookie(cookie))
            .andExpect(status().isBadRequest)
    }

    // ── Reject ────────────────────────────────────────────────────────────────

    @Test
    fun `manager rejects submitted report → status rejected and expenses revert to draft`() {
        val report = makeReport("tech1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        val expense = makeExpense("tech1", report).also { it.status = "submitted"; expenseRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
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
        assertEquals("draft", refreshed.status, "expense should revert to draft after rejection")
    }

    @Test
    fun `technician cannot reject report → 403`() {
        val report = makeReport("manager1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
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
        entityManager.flush()
        entityManager.clear()
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
        makeExpense("tech1", report).also { it.status = "approved"; expenseRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(post("/api/reports/${report.id}/pay").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("paid"))
    }

    @Test
    fun `paying a report flushes paid status to its expenses without violating chk_expenses_status`() {
        // Regression for the V5 chk_expenses_status constraint omitting 'paid' (fixed in V21).
        // payReport sets each attached expense to status='paid'. The happy-path test above only
        // asserts the response JSON (built from the in-memory report) and never flushes the
        // expense UPDATE to Postgres, so the CHECK violation stayed invisible. Force the flush
        // here: against the old constraint this throws; with V21 it persists cleanly.
        val report = makeReport("tech1").also { it.status = "approved"; expenseReportRepository.save(it) }
        val expense = makeExpense("tech1", report).also { it.status = "approved"; expenseRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(post("/api/reports/${report.id}/pay").cookie(cookie))
            .andExpect(status().isOk)

        // Force the expense UPDATE to hit the DB — this is what actually exercises the constraint.
        entityManager.flush()
        entityManager.clear()

        val refreshed = expenseRepository.findById(expense.id!!).get()
        assertEquals("paid", refreshed.status)
    }

    @Test
    fun `manager cannot pay approved report → 403`() {
        val report = makeReport("tech1").also { it.status = "approved"; expenseReportRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/reports/${report.id}/pay").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `pay submitted (not approved) report → 400`() {
        val report = makeReport("tech1").also { it.status = "submitted"; expenseReportRepository.save(it) }
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(post("/api/reports/${report.id}/pay").cookie(cookie))
            .andExpect(status().isBadRequest)
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Test
    fun `DELETE report with delete_expenses=false detaches expense and keeps it in draft`() {
        val report = makeReport("tech1")
        val expense = makeExpense("tech1", report)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(delete("/api/reports/${report.id}?delete_expenses=false").cookie(cookie))
            .andExpect(status().isNoContent)

        entityManager.flush()
        entityManager.clear()

        val refreshedExp = expenseRepository.findById(expense.id!!).orElse(null)
        assert(refreshedExp != null)
        assertEquals("draft", refreshedExp?.status)
        assertEquals(null, refreshedExp?.report)
    }

    @Test
    fun `DELETE report with delete_expenses=true soft deletes attached expense`() {
        val report = makeReport("tech1")
        val expense = makeExpense("tech1", report)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(delete("/api/reports/${report.id}?delete_expenses=true").cookie(cookie))
            .andExpect(status().isNoContent)

        entityManager.flush()
        entityManager.clear()

        val refreshedExp = expenseRepository.findById(expense.id!!).orElse(null)
        assert(refreshedExp == null) // Soft deleted, ignored by @SQLRestriction
    }
}
