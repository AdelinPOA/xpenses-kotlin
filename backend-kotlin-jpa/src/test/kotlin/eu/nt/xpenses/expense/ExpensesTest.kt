package eu.nt.xpenses.expense

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ExpenseReviewRequest
import eu.nt.xpenses.dto.expense.ExpenseReviewValues
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.model.Category
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.OcrJob
import eu.nt.xpenses.model.OcrJobStage
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.models.PagedResponse
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.services.StorageService
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.nio.file.Files
import java.util.UUID

class ExpensesTest : IntegrationTestBase() {

    companion object {
        private val storageDirectory = Files.createTempDirectory("expenses-module-test-")

        @JvmStatic
        @DynamicPropertySource
        fun isolateStorage(registry: DynamicPropertyRegistry) {
            registry.add("storage.location") { storageDirectory.toString() }
        }
    }

    @Autowired
    private lateinit var expenses: Expenses

    @Autowired
    private lateinit var ocrJobRepository: OcrJobRepository

    @Autowired
    private lateinit var entityManager: EntityManager

    private val pngBytes = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

    @Test
    fun `createExpense computes EUR amount with FX rate and updates attached draft report total`() {
        val tech = userRepository.findByUsername("tech1")!!
        val report = expenseReportRepository.save(ExpenseReport(user = tech, title = "Field Trip"))
        `when`(fxService.getRate("USD", "2026-06-15")).thenReturn(BigDecimal("0.92"))
        entityManager.flush()
        entityManager.clear()

        val created = expenses.createExpense(
            ExpenseCreate(
                reportId = report.id,
                amount = BigDecimal("100.00"),
                currency = "usd",
                taxAmount = BigDecimal("10.00"),
                date = "2026-06-15",
                merchant = "Cloud Vendor",
                description = "Tooling",
            ),
            tech,
        )

        assertEquals("USD", created.currencyOriginal)
        assertEquals(0, BigDecimal("92.00").compareTo(created.amountEur))
        assertEquals(0, BigDecimal("9.20").compareTo(created.taxAmountEur))
        assertFalse(created.fxRateManual)

        val reloadedReport = expenseReportRepository.findById(report.id!!).orElseThrow()
        assertEquals(0, BigDecimal("92.00").compareTo(reloadedReport.totalAmount))
    }

    @Test
    fun `createExpense rejects deactivated category and non-draft report`() {
        val tech = userRepository.findByUsername("tech1")!!
        val inactiveCat = categoryRepository.save(Category(name = "Inactive-${UUID.randomUUID()}", isActive = false))
        val submittedReport = expenseReportRepository.save(
            ExpenseReport(user = tech, title = "Submitted", status = "submitted")
        )
        entityManager.flush()

        val catEx = assertThrows<ResponseStatusException> {
            expenses.createExpense(
                ExpenseCreate(
                    categoryId = inactiveCat.id,
                    amount = BigDecimal("10.00"),
                    currency = "EUR",
                    date = "2026-06-15",
                ),
                tech,
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, catEx.statusCode)

        val reportEx = assertThrows<ResponseStatusException> {
            expenses.createExpense(
                ExpenseCreate(
                    reportId = submittedReport.id,
                    amount = BigDecimal("10.00"),
                    currency = "EUR",
                    date = "2026-06-15",
                ),
                tech,
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, reportEx.statusCode)
    }

    @Test
    fun `updateExpense recalculates FX when currency changes and clears category when requested`() {
        val tech = userRepository.findByUsername("tech1")!!
        val cat = categoryRepository.save(Category(name = "Travel-${UUID.randomUUID()}", isActive = true))
        val created = expenses.createExpense(
            ExpenseCreate(
                categoryId = cat.id,
                amount = BigDecimal("50.00"),
                currency = "EUR",
                date = "2026-06-10",
                merchant = "Initial",
            ),
            tech,
        )
        `when`(fxService.getRate("RON", "2026-06-10")).thenReturn(BigDecimal("0.20"))

        val updated = expenses.updateExpense(
            created.id,
            ExpenseUpdate(
                currency = "RON",
                clearCategory = true,
                merchant = "Updated Merchant",
            ),
            tech,
        )

        assertNull(updated.categoryId)
        assertEquals("RON", updated.currencyOriginal)
        assertEquals("Updated Merchant", updated.merchant)
        assertEquals(0, BigDecimal("10.00").compareTo(updated.amountEur))
    }

    @Test
    fun `listExpenses filters by query and returns paged results`() {
        val tech = userRepository.findByUsername("tech1")!!
        val uniqueMerchant = "UniqueCoffee-${UUID.randomUUID()}"
        expenses.createExpense(
            ExpenseCreate(
                amount = BigDecimal("12.50"),
                currency = "EUR",
                date = "2026-06-12",
                merchant = uniqueMerchant,
            ),
            tech,
        )

        val paged = expenses.listExpenses(
            currentUser = tech,
            reportId = null,
            categoryId = null,
            status = null,
            fromDate = null,
            toDate = null,
            all = false,
            page = 0,
            size = 10,
            q = uniqueMerchant,
        ) as PagedResponse<*>

        assertEquals(1L, paged.totalElements)
        val first = paged.data.single() as ExpenseOut
        assertEquals(uniqueMerchant, first.merchant)
    }

    @Test
    fun `listExpenses includes unattached and uncategorized expenses when no report or category filter is set`() {
        val tech = userRepository.findByUsername("tech1")!!
        val created = expenses.createExpense(
            ExpenseCreate(
                reportId = null,
                categoryId = null,
                amount = BigDecimal("18.77"),
                currency = "EUR",
                date = "2026-11-19",
                merchant = "UnattachedLaundry-${UUID.randomUUID()}",
            ),
            tech,
        )

        val paged = expenses.listExpenses(
            currentUser = tech,
            reportId = null,
            categoryId = null,
            status = null,
            fromDate = null,
            toDate = null,
            all = false,
            page = 0,
            size = 50,
            q = null,
        ) as PagedResponse<*>

        @Suppress("UNCHECKED_CAST")
        val items = paged.data as List<ExpenseOut>
        assertTrue(items.any { it.id == created.id })
    }

    @Test
    fun `duplicateExpense creates detached draft copy`() {
        val tech = userRepository.findByUsername("tech1")!!
        val report = expenseReportRepository.save(ExpenseReport(user = tech, title = "Trip"))
        val original = expenses.createExpense(
            ExpenseCreate(
                reportId = report.id,
                amount = BigDecimal("35.00"),
                currency = "EUR",
                date = "2026-06-12",
                merchant = "Hotel",
            ),
            tech,
        )

        val copy = expenses.duplicateExpense(original.id, tech)
        assertNotEquals(original.id, copy.id)
        assertNull(copy.reportId)
        assertEquals("draft", copy.status)
        assertEquals("Hotel", copy.merchant)
        assertEquals(0, BigDecimal("35.00").compareTo(copy.amountEur))
    }

    @Test
    fun `uploadReceipts, getReceiptDownload, and deleteSingleReceipt manage receipt lifecycle`() {
        val tech = userRepository.findByUsername("tech1")!!
        val created = expenses.createExpense(
            ExpenseCreate(
                amount = BigDecimal("25.00"),
                currency = "EUR",
                date = "2026-06-14",
                merchant = "Stationery",
            ),
            tech,
        )

        val file = MockMultipartFile("files", "receipt.png", "image/png", pngBytes)
        val uploaded = expenses.uploadReceipts(created.id, listOf(file), tech)
        assertEquals(1, uploaded.size)
        val receiptId = uploaded.single()["id"] as Int

        val (bytes, contentType, filename) = expenses.getReceiptDownload(created.id, receiptId, tech)
        assertEquals(pngBytes.toList(), bytes.toList())
        assertEquals("image/png", contentType)
        assertEquals("receipt.png", filename)

        expenses.deleteSingleReceipt(created.id, receiptId, tech)
        entityManager.flush()
        entityManager.clear()

        val afterDelete = expenses.getExpense(created.id, tech)
        assertTrue(afterDelete.receipts.isEmpty())
    }

    @Test
    fun `verifyExpense enforces owner verification, receipt requirement, version conflict, and idempotency`() {
        val tech = userRepository.findByUsername("tech1")!!
        val manager = userRepository.findByUsername("manager1")!!
        val created = expenses.createExpense(
            ExpenseCreate(
                amount = BigDecimal("40.00"),
                currency = "EUR",
                date = "2026-06-14",
                merchant = "Original OCR",
            ),
            tech,
        )
        val expenseEntity = expenseRepository.findById(created.id).orElseThrow()
        expenseEntity.verificationState = ExpenseVerificationState.PENDING
        val savedPending = expenseRepository.saveAndFlush(expenseEntity)

        ocrJobRepository.saveAndFlush(
            OcrJob(
                user = tech,
                filename = "scan.png",
                status = OcrJobStatus.COMPLETED,
                stage = OcrJobStage.RECEIPT,
                expenseId = created.id,
            )
        )

        val key = "verify-${UUID.randomUUID()}"
        val request = ExpenseReviewRequest(
            expectedVersion = savedPending.version,
            confirm = true,
            values = ExpenseReviewValues(merchant = "Verified Merchant"),
        )

        // Non-owner cannot verify
        val forbiddenEx = assertThrows<ResponseStatusException> {
            expenses.verifyExpense(created.id, request, manager, key)
        }
        assertEquals(HttpStatus.FORBIDDEN, forbiddenEx.statusCode)

        // Cannot verify without attached receipt
        val noReceiptEx = assertThrows<ResponseStatusException> {
            expenses.verifyExpense(created.id, request, tech, key)
        }
        assertEquals(HttpStatus.CONFLICT, noReceiptEx.statusCode)

        // Attach receipt, then verify with stale version
        val file = MockMultipartFile("files", "scan.png", "image/png", pngBytes)
        expenses.uploadReceipts(created.id, listOf(file), tech)
        entityManager.flush()
        entityManager.clear()
        val current = expenses.getExpense(created.id, tech)

        assertThrows<ExpenseVersionConflict> {
            expenses.verifyExpense(
                created.id,
                request.copy(expectedVersion = current.version - 1),
                tech,
                key,
            )
        }

        // Verify succeeds and replays idempotently
        val validRequest = request.copy(expectedVersion = current.version)
        val verified = expenses.verifyExpense(created.id, validRequest, tech, key)
        assertEquals("VERIFIED", verified.verificationState)
        assertEquals("Verified Merchant", verified.merchant)
        assertNotNull(verified.lastVerifiedAt)

        val replayed = expenses.verifyExpense(created.id, validRequest, tech, key)
        assertEquals(verified.id, replayed.id)
        assertEquals(verified.version, replayed.version)
    }

    @Test
    fun `deleteExpense removes expense and recomputes report total`() {
        val tech = userRepository.findByUsername("tech1")!!
        val report = expenseReportRepository.save(ExpenseReport(user = tech, title = "Delete Test"))
        val created = expenses.createExpense(
            ExpenseCreate(
                reportId = report.id,
                amount = BigDecimal("75.00"),
                currency = "EUR",
                date = "2026-06-14",
            ),
            tech,
        )

        expenses.deleteExpense(created.id, tech)
        entityManager.flush()
        entityManager.clear()

        val notFoundEx = assertThrows<ResponseStatusException> {
            expenses.getExpense(created.id, tech)
        }
        assertEquals(HttpStatus.NOT_FOUND, notFoundEx.statusCode)

        val reloadedReport = expenseReportRepository.findById(report.id!!).orElseThrow()
        assertEquals(0, BigDecimal.ZERO.compareTo(reloadedReport.totalAmount))
    }

    @Test
    fun `exportExpenses produces csv and xlsx bytes`() {
        val tech = userRepository.findByUsername("tech1")!!
        expenses.createExpense(
            ExpenseCreate(
                amount = BigDecimal("19.99"),
                currency = "EUR",
                date = "2026-06-15",
                merchant = "Export Merchant",
            ),
            tech,
        )

        val (csvBytes, csvType, csvName) = expenses.exportExpenses(
            tech, "csv", null, null, null, null, null, false, null
        )
        assertEquals("text/csv", csvType)
        assertTrue(csvName.endsWith(".csv"))
        assertTrue(String(csvBytes).contains("Export Merchant"))

        val (xlsxBytes, xlsxType, xlsxName) = expenses.exportExpenses(
            tech, "xlsx", null, null, null, null, null, false, null
        )
        assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxType)
        assertTrue(xlsxName.endsWith(".xlsx"))
        assertTrue(xlsxBytes.isNotEmpty())
    }
}
