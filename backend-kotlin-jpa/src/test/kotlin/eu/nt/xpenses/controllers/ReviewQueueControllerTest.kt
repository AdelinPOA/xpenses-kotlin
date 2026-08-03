package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.ExpenseReport
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.math.BigDecimal
import java.time.Instant

class ReviewQueueControllerTest : IntegrationTestBase() {

    @Test
    fun `manager receives compact oldest-first queue excluding own reports`() {
        val manager = userRepository.findByUsername("manager1")!!
        val technician = userRepository.findByUsername("tech1")!!
        val oldestSubmittedAt = Instant.parse("2026-07-01T10:00:00Z")
        val tiedSubmittedAt = Instant.parse("2026-07-02T10:00:00Z")

        val oldest = expenseReportRepository.save(
            ExpenseReport(
                user = technician,
                title = "Oldest report",
                description = "Compact summary",
                status = "submitted",
                submittedAt = oldestSubmittedAt,
                totalAmount = BigDecimal("125.50"),
                currency = "EUR"
            )
        )
        val tiedFirst = expenseReportRepository.save(
            ExpenseReport(
                user = technician,
                title = "Tied first",
                status = "submitted",
                submittedAt = tiedSubmittedAt,
                totalAmount = BigDecimal("20.00"),
                currency = "EUR"
            )
        )
        val tiedSecond = expenseReportRepository.save(
            ExpenseReport(
                user = technician,
                title = "Tied second",
                status = "submitted",
                submittedAt = tiedSubmittedAt,
                totalAmount = BigDecimal("30.00"),
                currency = "EUR"
            )
        )
        val own = expenseReportRepository.save(
            ExpenseReport(
                user = manager,
                title = "Manager's own report",
                status = "submitted",
                submittedAt = Instant.parse("2026-06-01T10:00:00Z"),
                totalAmount = BigDecimal("999.00"),
                currency = "EUR"
            )
        )
        expenseReportRepository.flush()

        val cookie = authHelper.loginAs("manager1", "manager1")
        mockMvc.perform(get("/api/review-queue").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$", hasSize<Any>(3)))
            .andExpect(jsonPath("$[0].id").value(oldest.id))
            .andExpect(jsonPath("$[1].id").value(tiedFirst.id))
            .andExpect(jsonPath("$[2].id").value(tiedSecond.id))
            .andExpect(jsonPath("$[0].title").value("Oldest report"))
            .andExpect(jsonPath("$[0].user_id").value(technician.id))
            .andExpect(jsonPath("$[0].expense_count").value(0))
            .andExpect(jsonPath("$[0].total_amount_eur").value(125.50))
            .andExpect(jsonPath("$[0].currency").value("EUR"))
            .andExpect(jsonPath("$[0].status").value("submitted"))
            .andExpect(jsonPath("$[?(@.id == ${own.id})]").isEmpty)
    }

    @Test
    fun `moderator and technician cannot request actionable queue`() {
        val moderatorCookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(get("/api/review-queue").cookie(moderatorCookie))
            .andExpect(status().isForbidden)

        val technicianCookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/review-queue").cookie(technicianCookie))
            .andExpect(status().isForbidden)
    }
}
