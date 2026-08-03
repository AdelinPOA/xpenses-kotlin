package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.math.BigDecimal
import java.time.Instant

class DashboardControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager

    @Test
    fun `GET dashboard without cookie returns 403 (Spring Security default for unauthenticated)`() {
        mockMvc.perform(get("/api/dashboard"))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `technician dashboard shows only own data`() {
        val tech = userRepository.findByUsername("tech1")!!
        val manager = userRepository.findByUsername("manager1")!!
        val cat = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
        expenseRepository.save(Expense(user = tech, category = cat, amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), date = "2026-06-01"))
        expenseRepository.save(Expense(user = manager, category = cat, amountOriginal = BigDecimal("500.00"), amountEur = BigDecimal("500.00"), date = "2026-06-01"))
        entityManager.flush()
        entityManager.clear()

        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/dashboard").cookie(cookie))
            .andExpect(status().isOk)
            // Assert no expense from a foreign user appears in the recent list
            .andExpect(jsonPath("$.recent_expenses[?(@.user_id != ${tech.id})]").isEmpty)
    }

    @Test
    fun `chef_finance dashboard shows org-wide data`() {
        val tech = userRepository.findByUsername("tech1")!!
        val manager = userRepository.findByUsername("manager1")!!
        val cat = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
        expenseRepository.save(Expense(user = tech, category = cat, amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), date = "2026-06-01"))
        expenseRepository.save(Expense(user = manager, category = cat, amountOriginal = BigDecimal("500.00"), amountEur = BigDecimal("500.00"), date = "2026-06-01"))
        entityManager.flush()
        entityManager.clear()

        val cookie = authHelper.loginAs("cfo1", "cfo1")
        mockMvc.perform(get("/api/dashboard").param("all", "true").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.expense_count_total").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)))
    }

    @Test
    fun `technician gets 403 forbidden for manager dashboard`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/dashboard/manager").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `manager dashboard uses actionable queue projection for count and total`() {
        val manager = userRepository.findByUsername("manager1")!!
        val technician = userRepository.findByUsername("tech1")!!
        expenseReportRepository.save(
            ExpenseReport(
                user = technician,
                title = "Technician submission",
                status = "submitted",
                submittedAt = Instant.parse("2026-07-01T10:00:00Z"),
                totalAmount = BigDecimal("125.00")
            )
        )
        expenseReportRepository.save(
            ExpenseReport(
                user = manager,
                title = "Manager submission",
                status = "submitted",
                submittedAt = Instant.parse("2026-06-01T10:00:00Z"),
                totalAmount = BigDecimal("999.00")
            )
        )
        entityManager.flush()

        val cookie = authHelper.loginAs("manager1", "manager1")
        mockMvc.perform(get("/api/dashboard/manager").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.kpis.pending_reports_count").value(1))
            .andExpect(jsonPath("$.kpis.pending_reports_total_eur").value(125.00))
            .andExpect(jsonPath("$.pending_reports[0].title").value("Technician submission"))
    }

    @Test
    fun `manager gets 200 ok with manager dashboard stats`() {
        val cookie = authHelper.loginAs("manager1", "manager1")
        mockMvc.perform(get("/api/dashboard/manager").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.kpis.pending_reports_count").exists())
            .andExpect(jsonPath("$.kpis.pending_advances_count").exists())
            .andExpect(jsonPath("$.pending_reports").isArray)
            .andExpect(jsonPath("$.pending_advances").isArray)
            .andExpect(jsonPath("$.recent_activity").isArray)
    }
}

