package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.Expense
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

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
        expenseRepository.save(Expense(user = tech, category = cat, amountOriginal = 10.0, amountEur = 10.0, date = "2026-06-01"))
        expenseRepository.save(Expense(user = manager, category = cat, amountOriginal = 500.0, amountEur = 500.0, date = "2026-06-01"))
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
        expenseRepository.save(Expense(user = tech, category = cat, amountOriginal = 10.0, amountEur = 10.0, date = "2026-06-01"))
        expenseRepository.save(Expense(user = manager, category = cat, amountOriginal = 500.0, amountEur = 500.0, date = "2026-06-01"))
        entityManager.flush()
        entityManager.clear()

        val cookie = authHelper.loginAs("cfo1", "cfo1")
        mockMvc.perform(get("/api/dashboard").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.expense_count_total").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)))
    }
}
