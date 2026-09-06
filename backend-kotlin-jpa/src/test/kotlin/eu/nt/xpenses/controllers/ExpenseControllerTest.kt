package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.Receipt
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.math.BigDecimal

class ExpenseControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager

    private fun saveTechExpense(): Expense {
        val tech = userRepository.findByUsername("tech1")!!
        val cat = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
        return expenseRepository.save(
            Expense(user = tech, category = cat, amountOriginal = BigDecimal("30.00"), amountEur = BigDecimal("30.00"), date = "2026-06-01")
        )
    }

    @Test
    fun `GET expenses returns only own expenses for technician`() {
        val techUser = userRepository.findByUsername("tech1")!!
        val managerUser = userRepository.findByUsername("manager1")!!
        val cat = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
        expenseRepository.save(Expense(user = techUser, category = cat, amountOriginal = BigDecimal("30.00"), amountEur = BigDecimal("30.00"), date = "2026-06-01"))
        expenseRepository.save(Expense(user = managerUser, category = cat, amountOriginal = BigDecimal("100.00"), amountEur = BigDecimal("100.00"), date = "2026-06-01"))
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
                .content("""{"category_id":${cat.id},"amount":75.0,"currency":"EUR","date":"2026-06-10","description":"Lunch","merchant":"Cafe"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.amount_eur").value(75.0))
            .andExpect(jsonPath("$.status").value("draft"))
    }

    @Test
    fun `POST expense rejects non-positive manual FX rate before persistence`() {
        val cat = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
        val cookie = authHelper.loginAs("tech1", "tech1")
        val expenseCountBefore = expenseRepository.count()

        mockMvc.perform(
            post("/api/expenses")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"category_id":${cat.id},"amount":75.0,"currency":"USD","date":"2026-06-10","fx_rate":0}""")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)

        org.junit.jupiter.api.Assertions.assertEquals(expenseCountBefore, expenseRepository.count())
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
    fun `POST upload receipts on non-draft expense returns 400`() {
        val expense = saveTechExpense()
        expense.status = "submitted"
        expenseRepository.save(expense)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val file = org.springframework.mock.web.MockMultipartFile("files", "receipt.png", "image/png", byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))
        mockMvc.perform(
            multipart("/api/expenses/${expense.id}/receipts")
                .file(file)
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `DELETE receipt on non-draft expense returns 400`() {
        val expense = saveTechExpense()
        expense.status = "submitted"
        val receipt = eu.nt.xpenses.model.Receipt(expense = expense, filePath = "2026/06/test.png", originalName = "test.png")
        expense.receipts.add(receipt)
        expenseRepository.save(expense)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            delete("/api/expenses/${expense.id}/receipts/${expense.receipts.first().id}")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GET expenses without cookie returns 401 Unauthorized`() {
        mockMvc.perform(get("/api/expenses"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `DELETE expense soft deletes and is hidden from list but visible in audit`() {
        val expense = saveTechExpense()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        // 1. Delete it
        mockMvc.perform(delete("/api/expenses/${expense.id}").cookie(cookie))
            .andExpect(status().isNoContent)
            
        // 2. Fetch list, ensure it's absent
        mockMvc.perform(get("/api/expenses").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[?(@.id == ${expense.id})]").isEmpty)

        // 3. Fetch by ID, ensure 404
        mockMvc.perform(get("/api/expenses/${expense.id}").cookie(cookie))
            .andExpect(status().isNotFound)

        // 4. Audit path still finds it
        val deletedAudit = expenseRepository.findDeletedAudit()
        assert(deletedAudit.any { it.id == expense.id })
    }

    @Test
    fun `GET single expense as manager returns 200`() {
        val expense = saveTechExpense()
        entityManager.flush()
        entityManager.clear()
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(get("/api/expenses/${expense.id}").cookie(managerCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(expense.id))
    }
}
