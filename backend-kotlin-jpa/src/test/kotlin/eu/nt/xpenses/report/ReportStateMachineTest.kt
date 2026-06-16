package eu.nt.xpenses.report

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.Expense
import eu.nt.xpenses.models.ExpenseReport
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

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
        // Flush + clear so the controller loads fresh entities from DB, bypassing the
        // initialized-empty collection that Hibernate cached when the report was created.
        entityManager.flush()
        entityManager.clear()
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
