package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.repositories.OcrJobRepository
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.math.BigDecimal
import java.time.Instant

class ExpenseControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager

    @Autowired
    private lateinit var ocrJobRepository: OcrJobRepository

    private fun associateCompletedOcrJob(expense: Expense) {
        ocrJobRepository.saveAndFlush(
            OcrJob(
                user = expense.user,
                status = OcrJobStatus.COMPLETED,
                stage = OcrJobStage.RECEIPT,
                filename = "review.png",
                expenseId = expense.id,
                receiptId = expense.receipts.firstOrNull()?.id,
                completedAt = Instant.now(),
            ),
        )
    }

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
    fun `GET expenses can filter verification state independently of financial status`() {
        val expense = saveTechExpense().apply {
            status = "submitted"
            verificationState = ExpenseVerificationState.PENDING
        }
        expenseRepository.save(expense)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/expenses?verification_state=PENDING").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[?(@.id == ${expense.id})]").isNotEmpty)
        mockMvc.perform(get("/api/expenses?verification_state=VERIFIED").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[?(@.id == ${expense.id})]").isEmpty)
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
            .andExpect(jsonPath("$.verification_state").value("NOT_REQUIRED"))
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
    fun `PUT review confirms current values without changing submitted financial status`() {
        val expense = saveTechExpense().apply {
            status = "submitted"
            verificationState = ExpenseVerificationState.PENDING
        }
        expense.receipts.add(Receipt(expense = expense, filePath = "2026/06/review-receipt.png", originalName = "review-receipt.png"))
        expenseRepository.save(expense)
        entityManager.flush()
        associateCompletedOcrJob(expense)
        entityManager.clear()
        val expectedVersion = expenseRepository.findById(expense.id!!).orElseThrow().version
        val cookie = authHelper.loginAs("tech1", "tech1")
        val body = """{"expected_version":$expectedVersion,"values":{},"confirm":true}"""

        mockMvc.perform(
            put("/api/expenses/${expense.id}/review")
                .header("Idempotency-Key", "review-confirm-${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("submitted"))
            .andExpect(jsonPath("$.verification_state").value("VERIFIED"))
            .andExpect(jsonPath("$.version").value(expectedVersion + 1))
            .andExpect(jsonPath("$.last_verified_by_user_id").value(expense.user!!.id))

        mockMvc.perform(
            put("/api/expenses/${expense.id}/review")
                .header("Idempotency-Key", "review-confirm-${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.verification_state").value("VERIFIED"))
            .andExpect(jsonPath("$.version").value(expectedVersion + 1))

        mockMvc.perform(
            put("/api/expenses/${expense.id}/review")
                .header("Idempotency-Key", "review-confirm-${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expected_version":$expectedVersion,"values":{"description":"different"},"confirm":true}""")
                .cookie(cookie)
        ).andExpect(status().isConflict)

        val secondExpense = saveTechExpense()
        entityManager.flush()
        mockMvc.perform(
            put("/api/expenses/${secondExpense.id}/review")
                .header("Idempotency-Key", "review-confirm-${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .cookie(cookie)
        ).andExpect(status().isConflict)
    }

    @Test
    fun `PUT review cannot verify an Expense before its Receipt is attached`() {
        val expense = saveTechExpense().apply { verificationState = ExpenseVerificationState.PENDING }
        expenseRepository.save(expense)
        entityManager.flush()
        associateCompletedOcrJob(expense)
        entityManager.clear()
        val currentVersion = expenseRepository.findById(expense.id!!).orElseThrow().version
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            put("/api/expenses/${expense.id}/review")
                .header("Idempotency-Key", "review-without-receipt-${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expected_version":$currentVersion,"values":{},"confirm":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.detail").value("A Receipt must be attached before the Expense can be verified"))

        entityManager.clear()
        val persisted = expenseRepository.findById(expense.id!!).orElseThrow()
        org.junit.jupiter.api.Assertions.assertEquals(ExpenseVerificationState.PENDING, persisted.verificationState)
        org.junit.jupiter.api.Assertions.assertNull(persisted.lastVerifiedAt)
    }

    @Test
    fun `PUT review rejects stale versions without mutating the Expense`() {
        val expense = saveTechExpense()
        entityManager.flush()
        expense.status = "submitted"
        entityManager.flush()
        entityManager.clear()
        val currentVersion = expenseRepository.findById(expense.id!!).orElseThrow().version
        val cookie = authHelper.loginAs("tech1", "tech1")
        val body = """{"expected_version":${currentVersion - 1},"values":{},"confirm":true}"""

        mockMvc.perform(
            put("/api/expenses/${expense.id}/review")
                .header("Idempotency-Key", "stale-review-${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .cookie(cookie)
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.current.version").value(currentVersion))
            .andExpect(jsonPath("$.current.status").value("submitted"))
            .andExpect(jsonPath("$.current.verification_state").value("NOT_REQUIRED"))

        entityManager.clear()
        val persisted = expenseRepository.findById(expense.id!!).orElseThrow()
        org.junit.jupiter.api.Assertions.assertEquals(currentVersion, persisted.version)
        org.junit.jupiter.api.Assertions.assertEquals(ExpenseVerificationState.NOT_REQUIRED, persisted.verificationState)
        org.junit.jupiter.api.Assertions.assertNull(persisted.lastVerifiedAt)
    }

    @Test
    fun `PUT review allows each owner role to verify its own Expense`() {
        val category = categoryRepository.findAll().firstOrNull() ?: error("No seeded category")
        val ownerAccounts = listOf(
            "tech1" to "tech1",
            "manager1" to "manager1",
            "cfo1" to "cfo1",
            "mod1" to "mod1"
        )

        for ((username, password) in ownerAccounts) {
            val owner = userRepository.findByUsername(username)!!
            val expense = Expense(
                user = owner,
                category = category,
                amountOriginal = BigDecimal("30.00"),
                amountEur = BigDecimal("30.00"),
                date = "2026-06-01",
                verificationState = ExpenseVerificationState.PENDING
            )
            expense.receipts.add(
                Receipt(expense = expense, filePath = "2026/06/review-$username.png", originalName = "review-$username.png")
            )
            expenseRepository.save(expense)
            entityManager.flush()
            associateCompletedOcrJob(expense)
            val currentVersion = expense.version

            mockMvc.perform(
                put("/api/expenses/${expense.id}/review")
                    .header("Idempotency-Key", "owner-review-$username-${expense.id}")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"expected_version":$currentVersion,"values":{},"confirm":true}""")
                    .cookie(authHelper.loginAs(username, password))
            )
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.verification_state").value("VERIFIED"))
                .andExpect(jsonPath("$.last_verified_by_user_id").value(owner.id))

            entityManager.clear()
            org.junit.jupiter.api.Assertions.assertEquals(
                ExpenseVerificationState.VERIFIED,
                expenseRepository.findById(expense.id!!).orElseThrow().verificationState
            )
        }
    }

    @Test
    fun `PUT review forbids a non-owner even when the requester is a moderator`() {
        val expense = saveTechExpense().apply { verificationState = ExpenseVerificationState.PENDING }
        expense.receipts.add(
            Receipt(expense = expense, filePath = "2026/06/non-owner-review.png", originalName = "non-owner-review.png")
        )
        expenseRepository.save(expense)
        entityManager.flush()
        entityManager.clear()
        val currentVersion = expenseRepository.findById(expense.id!!).orElseThrow().version
        val modCookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(
            put("/api/expenses/${expense.id}/review")
                .header("Idempotency-Key", "foreign-review-${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expected_version":$currentVersion,"values":{},"confirm":true}""")
                .cookie(modCookie)
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.detail").value("Only the owner can verify this Expense"))

        entityManager.clear()
        val unchanged = expenseRepository.findById(expense.id!!).orElseThrow()
        org.junit.jupiter.api.Assertions.assertEquals(ExpenseVerificationState.PENDING, unchanged.verificationState)
        org.junit.jupiter.api.Assertions.assertEquals(currentVersion, unchanged.version)
        org.junit.jupiter.api.Assertions.assertNull(unchanged.lastVerifiedAt)
    }

    @Test
    fun `PATCH reviewable Expense changes preserve prior verification`() {
        val expense = saveTechExpense()
        val verifiedAt = Instant.parse("2026-06-01T12:00:00Z")
        expense.verificationState = ExpenseVerificationState.VERIFIED
        expense.lastVerifiedAt = verifiedAt
        expense.lastVerifiedBy = expense.user
        expenseRepository.save(expense)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            patch("/api/expenses/${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"amount":45.00}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.verification_state").value("VERIFIED"))
            .andExpect(jsonPath("$.last_verified_at").value(verifiedAt.toString()))
            .andExpect(jsonPath("$.last_verified_by_user_id").value(expense.user!!.id))

        entityManager.flush()
        entityManager.clear()
        val persisted = expenseRepository.findById(expense.id!!).orElseThrow()
        org.junit.jupiter.api.Assertions.assertEquals(ExpenseVerificationState.VERIFIED, persisted.verificationState)
        org.junit.jupiter.api.Assertions.assertEquals(verifiedAt, persisted.lastVerifiedAt)
        org.junit.jupiter.api.Assertions.assertEquals(expense.user!!.id, persisted.lastVerifiedBy?.id)
    }

    @Test
    fun `PUT review rejects a second confirmation of an already verified expense`() {
        val expense = saveTechExpense().apply {
            verificationState = ExpenseVerificationState.VERIFIED
            lastVerifiedAt = Instant.parse("2026-06-01T12:00:00Z")
            lastVerifiedBy = user
        }
        expense.receipts.add(Receipt(expense = expense, filePath = "2026/06/verified.png", originalName = "verified.png"))
        expenseRepository.save(expense)
        entityManager.flush()
        entityManager.clear()
        val version = expenseRepository.findById(expense.id!!).orElseThrow().version
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            put("/api/expenses/${expense.id}/review")
                .header("Idempotency-Key", "review-again-${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expected_version":$version,"values":{},"confirm":true}""")
                .cookie(cookie)
        ).andExpect(status().isConflict)

        entityManager.clear()
        val persisted = expenseRepository.findById(expense.id!!).orElseThrow()
        org.junit.jupiter.api.Assertions.assertEquals(ExpenseVerificationState.VERIFIED, persisted.verificationState)
        org.junit.jupiter.api.Assertions.assertEquals(version, persisted.version)
        org.junit.jupiter.api.Assertions.assertEquals(Instant.parse("2026-06-01T12:00:00Z"), persisted.lastVerifiedAt)
    }

    @Test
    fun `PUT review rejects manual expenses and pending expenses without an OCR source`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        val manualExpense = saveTechExpense()
        entityManager.flush()
        val manualVersion = manualExpense.version

        mockMvc.perform(
            put("/api/expenses/${manualExpense.id}/review")
                .header("Idempotency-Key", "manual-review-${manualExpense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expected_version":$manualVersion,"values":{},"confirm":true}""")
                .cookie(cookie)
        ).andExpect(status().isConflict)
            .andExpect(jsonPath("$.detail").value("Initial OCR review is no longer pending"))

        val pendingExpense = saveTechExpense().apply {
            verificationState = ExpenseVerificationState.PENDING
            receipts.add(Receipt(expense = this, filePath = "2026/06/no-job.png", originalName = "no-job.png"))
        }
        expenseRepository.save(pendingExpense)
        entityManager.flush()
        val pendingVersion = pendingExpense.version

        mockMvc.perform(
            put("/api/expenses/${pendingExpense.id}/review")
                .header("Idempotency-Key", "orphan-review-${pendingExpense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"expected_version":$pendingVersion,"values":{},"confirm":true}""")
                .cookie(cookie)
        ).andExpect(status().isConflict)
            .andExpect(jsonPath("$.detail").value("Expense is not linked to an active OCR source"))
    }

    @Test
    fun `PATCH expense explicitly clears text and category but omitted fields remain unchanged`() {
        val expense = saveTechExpense()
        expense.merchant = "Merchant to clear"
        expense.description = "Description to clear"
        expenseRepository.save(expense)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")
        val categoryId = expense.category!!.id

        mockMvc.perform(
            patch("/api/expenses/${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"amount":42}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.category_id").value(categoryId))
            .andExpect(jsonPath("$.merchant").value("Merchant to clear"))
            .andExpect(jsonPath("$.description").value("Description to clear"))

        // A legacy null remains an omitted value, not an implicit destructive clear.
        mockMvc.perform(
            patch("/api/expenses/${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"category_id":null}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.category_id").value(categoryId))

        mockMvc.perform(
            patch("/api/expenses/${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"merchant":"","description":"","clear_category":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.category_id").doesNotExist())
            .andExpect(jsonPath("$.merchant").value(""))
            .andExpect(jsonPath("$.description").value(""))
            .andExpect(jsonPath("$.amount_original").value(42))

        entityManager.flush()
        entityManager.clear()
        val persisted = expenseRepository.findById(expense.id!!).orElseThrow()
        org.junit.jupiter.api.Assertions.assertNull(persisted.category)
        org.junit.jupiter.api.Assertions.assertEquals("", persisted.merchant)
        org.junit.jupiter.api.Assertions.assertEquals("", persisted.description)
    }

    @Test
    fun `PATCH expense rejects contradictory category selection and clearing`() {
        val expense = saveTechExpense()
        entityManager.flush()
        entityManager.clear()
        val categoryId = expense.category!!.id
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(
            patch("/api/expenses/${expense.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"category_id":$categoryId,"clear_category":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
        entityManager.flush()
        entityManager.clear()
        org.junit.jupiter.api.Assertions.assertEquals(categoryId, expenseRepository.findById(expense.id!!).orElseThrow().category!!.id)
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
