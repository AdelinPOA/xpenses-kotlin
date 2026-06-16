package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.Expense
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class ExpenseControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager

    private fun saveTechExpense(): Expense {
        val tech = userRepository.findByUsername("tech1")!!
        val cat = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
        return expenseRepository.save(
            Expense(user = tech, category = cat, amountOriginal = 30.0, amountEur = 30.0, date = "2026-06-01")
        )
    }

    @Test
    fun `GET expenses returns only own expenses for technician`() {
        val techUser = userRepository.findByUsername("tech1")!!
        val managerUser = userRepository.findByUsername("manager1")!!
        val cat = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
        expenseRepository.save(Expense(user = techUser, category = cat, amountOriginal = 30.0, amountEur = 30.0, date = "2026-06-01"))
        expenseRepository.save(Expense(user = managerUser, category = cat, amountOriginal = 100.0, amountEur = 100.0, date = "2026-06-01"))
        entityManager.flush()
        entityManager.clear()

        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/expenses").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
            // All returned expenses must belong to tech1 — verify no foreign user_id appears
            .andExpect(jsonPath("$[?(@.user_id != ${techUser.id})]").isEmpty)
    }

    @Test
    fun `POST expense creates expense and returns 201`() {
        val cat = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
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
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(delete("/api/expenses/${expense.id}").cookie(cookie))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `DELETE submitted expense returns 400`() {
        val expense = saveTechExpense()
        expense.status = "submitted"
        expenseRepository.save(expense)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(delete("/api/expenses/${expense.id}").cookie(cookie))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GET expenses without cookie returns 403 (Spring Security default for unauthenticated)`() {
        mockMvc.perform(get("/api/expenses"))
            .andExpect(status().isForbidden)
    }
}
