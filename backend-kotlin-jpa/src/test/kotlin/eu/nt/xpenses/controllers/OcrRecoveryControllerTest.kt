package eu.nt.xpenses.controllers

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.repositories.OcrJobActionOperationRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.math.BigDecimal
import java.time.Instant

class OcrRecoveryControllerTest : IntegrationTestBase() {
    @Autowired
    private lateinit var ocrJobRepository: OcrJobRepository

    @Autowired
    private lateinit var actionRepository: OcrJobActionOperationRepository

    @Test
    fun `owner recovery exposes safe data and denies other users`() {
        val owner = userRepository.findByUsername("tech1")!!
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = owner,
                filename = "receipt.png",
                status = OcrJobStatus.PERMANENT_FAILURE,
                stage = OcrJobStage.OCR,
                sourcePath = "ocr-sources/private-receipt.png",
                sourceSha256 = "a".repeat(64),
                sourceSizeBytes = 128,
                expiresAt = Instant.now().plusSeconds(3600),
                errorCode = "OCR_PROCESSING_FAILED",
                errorMessage = "provider-token=must-not-leak"
            )
        )
        val ownerCookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/ocr/jobs/${job.id}").cookie(ownerCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.job_id").value(job.id))
            .andExpect(jsonPath("$.status").value(OcrJobStatus.PERMANENT_FAILURE))
            .andExpect(jsonPath("$.retryable").value(true))
            .andExpect(jsonPath("$.allowed_actions[0]").value("retry"))
            .andExpect(jsonPath("$.allowed_actions[1]").value("complete_manually"))
            .andExpect(jsonPath("$.error_message").value("OCR processing failed. You can retry or enter the Expense manually."))
            .andExpect(jsonPath("$.result_json").doesNotExist())
            .andExpect(jsonPath("$.source_path").doesNotExist())
            .andExpect(jsonPath("$.error_message").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("provider-token"))))

        mockMvc.perform(get("/api/ocr/jobs?limit=10").cookie(ownerCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].job_id").value(job.id))
            .andExpect(jsonPath("$[0].result_json").doesNotExist())

        mockMvc.perform(get("/api/ocr/jobs/${job.id}").cookie(authHelper.loginAs("manager1", "manager1")))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `retry is idempotent and resumes the same failed job`() {
        val owner = userRepository.findByUsername("tech1")!!
        val existingExpense = expenseRepository.saveAndFlush(
            Expense(
                user = owner,
                amountOriginal = BigDecimal("12.00"),
                amountEur = BigDecimal("12.00"),
                currencyOriginal = "EUR",
                date = "2026-06-01"
            )
        )
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = owner,
                filename = "retry.png",
                status = OcrJobStatus.PERMANENT_FAILURE,
                stage = OcrJobStage.EXPENSE,
                sourcePath = "ocr-sources/retry.png",
                expiresAt = Instant.now().plusSeconds(3600),
                expenseId = existingExpense.id,
                resultJson = """{"amount":12.0}""",
                errorCode = "OCR_PROCESSING_FAILED",
                errorMessage = "private diagnostic"
            )
        )
        val cookie = authHelper.loginAs("tech1", "tech1")
        val key = "retry-${job.id}"

        repeat(2) {
            mockMvc.perform(
                post("/api/ocr/jobs/${job.id}/retry")
                    .header("Idempotency-Key", key)
                    .cookie(cookie)
            )
                .andExpect(status().isAccepted)
                .andExpect(jsonPath("$.job_id").value(job.id))
                .andExpect(jsonPath("$.status").value(OcrJobStatus.PENDING))
                .andExpect(jsonPath("$.stage").value(OcrJobStage.EXPENSE))
                .andExpect(jsonPath("$.expense_id").value(existingExpense.id))
        }

        val persisted = ocrJobRepository.findById(job.id!!).orElseThrow()
        assertEquals(OcrJobStatus.PENDING, persisted.status)
        assertEquals(OcrJobStage.EXPENSE, persisted.stage)
        assertEquals(existingExpense.id, persisted.expenseId)
        assertEquals(1, actionRepository.count())
    }

    @Test
    fun `manual completion skips OCR and replays only the same keyed payload`() {
        val owner = userRepository.findByUsername("tech1")!!
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = owner,
                filename = "manual.png",
                status = OcrJobStatus.PERMANENT_FAILURE,
                stage = OcrJobStage.OCR,
                sourcePath = "ocr-sources/manual.png",
                expiresAt = Instant.now().plusSeconds(3600),
                errorCode = "OCR_PROCESSING_FAILED",
                errorMessage = "private diagnostic"
            )
        )
        val cookie = authHelper.loginAs("tech1", "tech1")
        val key = "manual-${job.id}"
        val body = """{"values":{"amount":25.50,"currency":"EUR","date":"2026-06-01","merchant":"Manual Shop"}}"""

        repeat(2) {
            mockMvc.perform(
                post("/api/ocr/jobs/${job.id}/complete-manually")
                    .header("Idempotency-Key", key)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body)
                    .cookie(cookie)
            )
                .andExpect(status().isAccepted)
                .andExpect(jsonPath("$.job_id").value(job.id))
                .andExpect(jsonPath("$.status").value(OcrJobStatus.PENDING))
                .andExpect(jsonPath("$.stage").value(OcrJobStage.EXPENSE))
        }

        mockMvc.perform(
            post("/api/ocr/jobs/${job.id}/complete-manually")
                .header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"values":{"amount":30,"currency":"EUR","date":"2026-06-01"}}""")
                .cookie(cookie)
        ).andExpect(status().isConflict)

        val persisted = ocrJobRepository.findById(job.id!!).orElseThrow()
        val manualResult = ObjectMapper().readTree(persisted.resultJson)
        assertEquals(0, BigDecimal("25.50").compareTo(manualResult["amount"].decimalValue()))
        assertEquals("Manual Shop", manualResult["merchant"].asString())
        assertNull(manualResult.get("raw_text"))
        assertEquals(1, actionRepository.count())
    }

    @Test
    fun `manual completion rejects an unknown category instead of dropping it`() {
        val owner = userRepository.findByUsername("tech1")!!
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = owner,
                filename = "manual-category.png",
                status = OcrJobStatus.PERMANENT_FAILURE,
                stage = OcrJobStage.OCR,
                sourcePath = "ocr-sources/manual-category.png",
                expiresAt = Instant.now().plusSeconds(3600)
            )
        )

        mockMvc.perform(
            post("/api/ocr/jobs/${job.id}/complete-manually")
                .header("Idempotency-Key", "manual-category-${job.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"values":{"amount":10,"currency":"EUR","date":"2026-06-01","category_id":999999}}""")
                .cookie(authHelper.loginAs("tech1", "tech1"))
        ).andExpect(status().isNotFound)

        assertEquals(OcrJobStatus.PERMANENT_FAILURE, ocrJobRepository.findById(job.id!!).orElseThrow().status)
        assertEquals(0, actionRepository.count())
    }

    @Test
    fun `manual recovery reuses a known Expense instead of creating a replacement`() {
        val owner = userRepository.findByUsername("tech1")!!
        val expense = expenseRepository.saveAndFlush(
            Expense(
                user = owner,
                amountOriginal = BigDecimal("9.00"),
                amountEur = BigDecimal("9.00"),
                currencyOriginal = "EUR",
                date = "2026-06-01"
            )
        )
        val job = ocrJobRepository.saveAndFlush(
            OcrJob(
                user = owner,
                filename = "partial.png",
                status = OcrJobStatus.PERMANENT_FAILURE,
                stage = OcrJobStage.EXPENSE,
                sourcePath = "ocr-sources/partial.png",
                expiresAt = Instant.now().plusSeconds(3600),
                expenseId = expense.id,
                errorCode = "OCR_PROCESSING_FAILED"
            )
        )
        val beforeCount = expenseRepository.count()

        mockMvc.perform(
            post("/api/ocr/jobs/${job.id}/complete-manually")
                .header("Idempotency-Key", "partial-${job.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .cookie(authHelper.loginAs("tech1", "tech1"))
        )
            .andExpect(status().isAccepted)
            .andExpect(jsonPath("$.expense_id").value(expense.id))
            .andExpect(jsonPath("$.stage").value(OcrJobStage.RECEIPT))

        assertEquals(beforeCount, expenseRepository.count())
        assertEquals(1, expenseRepository.findAllByUserId(owner.id!!).count { it.id == expense.id })
    }
}
