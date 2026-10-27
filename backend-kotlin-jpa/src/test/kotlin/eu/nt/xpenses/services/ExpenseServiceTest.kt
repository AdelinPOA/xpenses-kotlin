package eu.nt.xpenses.services

import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.model.Category
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.ExpenseReviewOperationRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.mapper.ExpenseMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.ArgumentMatchers.*
import org.mockito.Mockito.*
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockMultipartFile
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant
import java.util.Optional

class ExpenseServiceTest {

    private val pngBytes = byteArrayOf(
        0x89.toByte(), 0x50.toByte(), 0x4E.toByte(), 0x47.toByte(),
        0x0D.toByte(), 0x0A.toByte(), 0x1A.toByte(), 0x0A.toByte()
    )
    private val dummyUpload = RawUpload(pngBytes, "dummy.png", "image/png")
    private val dummyExpense = Expense(id = 1, amountOriginal = BigDecimal.ONE, amountEur = BigDecimal.ONE, currencyOriginal = "EUR", date = "2024-01-01")
    private val dummyReceipt = Receipt(expense = dummyExpense, filePath = "dummy", originalName = "dummy")

    private fun <T : Any> anyObject(dummy: T): T {
        any(dummy::class.java)
        return dummy
    }

    private fun <T : Any> eqNonNull(value: T): T {
        eq(value)
        return value
    }

    private val expenseRepository = mock(ExpenseRepository::class.java)
    private val expenseReviewOperationRepository = mock(ExpenseReviewOperationRepository::class.java)
    private val ocrJobRepository = mock(OcrJobRepository::class.java)
    private val jdbcTemplate = mock(JdbcTemplate::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val expenseReportRepository = mock(ExpenseReportRepository::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val receiptRepository = mock(ReceiptRepository::class.java)
    private val fxService = mock(FxService::class.java)
    private val storageService = mock(StorageService::class.java)
    private val exportService = mock(ExportService::class.java)
    private val expenseMapper = ExpenseMapper()
    private val authorization = Authorization()

    private val expenseService = ExpenseService(
        expenseRepository,
        categoryRepository,
        expenseReportRepository,
        ocrComparisonRepository,
        receiptRepository,
        fxService,
        storageService,
        exportService,
        expenseMapper,
        authorization,
        expenseReviewOperationRepository,
        ocrJobRepository,
        jdbcTemplate
    )

    private lateinit var techUser: User
    private lateinit var managerUser: User
    private lateinit var otherUser: User

    @BeforeEach
    fun setup() {
        techUser = User(id = 1, username = "tech", displayName = "Tech", role = Authorization.ROLE_TECHNICIAN)
        managerUser = User(id = 2, username = "mgr", displayName = "Manager", role = Authorization.ROLE_MANAGER)
        otherUser = User(id = 3, username = "other", displayName = "Other", role = Authorization.ROLE_TECHNICIAN)
    }

    @Test
    fun `createExpense should use fxService and save`() {
        val createBody = ExpenseCreate(
            amount = BigDecimal("100.00"),
            currency = "USD",
            date = "2024-01-01",
            taxAmount = BigDecimal("10.00")
        )
        doReturn(BigDecimal("0.85")).`when`(fxService).getRate("USD", "2024-01-01")
        doAnswer {
            val exp = it.arguments[0] as Expense
            exp.id = 1
            exp
        }.`when`(expenseRepository).save(anyObject(dummyExpense))

        val result = expenseService.createExpense(createBody, techUser)

        assertEquals(BigDecimal("100.00"), result.amountOriginal)
        assertEquals("USD", result.currencyOriginal)
        assertEquals(BigDecimal("85.00"), result.amountEur)
        verify(expenseRepository).save(anyObject(dummyExpense))
    }

    @Test
    fun `updateExpense should reject if not draft`() {
        val expense = Expense(id = 1, user = techUser, status = "submitted", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        doReturn(Optional.of(expense)).`when`(expenseRepository).findById(1)

        val ex = assertThrows<ResponseStatusException> {
            expenseService.updateExpense(1, ExpenseUpdate(amount = BigDecimal("20.00")), techUser)
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }

    @Test
    fun `deleteExpense should delete if draft`() {
        val expense = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        doReturn(Optional.of(expense)).`when`(expenseRepository).findById(1)

        expenseService.deleteExpense(1, techUser)
        verify(expenseRepository).delete(expense)
    }

    @Test
    fun `createExpense should reject deactivated category`() {
        val createBody = ExpenseCreate(
            categoryId = 10,
            amount = BigDecimal("100.00"),
            currency = "USD",
            date = "2024-01-01"
        )
        val deactivatedCategory = Category(id = 10, name = "Deactivated Cat", isActive = false)
        doReturn(BigDecimal("0.85")).`when`(fxService).getRate("USD", "2024-01-01")
        doReturn(Optional.of(deactivatedCategory)).`when`(categoryRepository).findById(10)

        val ex = assertThrows<ResponseStatusException> {
            expenseService.createExpense(createBody, techUser)
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
        assertTrue(ex.reason?.contains("deactivated") == true)
    }

    @Test
    fun `updateExpense should reject deactivated category`() {
        val expense = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        val deactivatedCategory = Category(id = 10, name = "Deactivated Cat", isActive = false)
        doReturn(Optional.of(expense)).`when`(expenseRepository).findById(1)
        doReturn(Optional.of(deactivatedCategory)).`when`(categoryRepository).findById(10)

        val ex = assertThrows<ResponseStatusException> {
            expenseService.updateExpense(1, ExpenseUpdate(categoryId = 10), techUser)
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
        assertTrue(ex.reason?.contains("deactivated") == true)
    }

    @Test
    fun `createExpense with manual fxRate should skip API call and set fxRateManual`() {
        val createBody = ExpenseCreate(
            amount = BigDecimal("100.00"),
            currency = "USD",
            date = "2024-01-01",
            taxAmount = BigDecimal("10.00"),
            fxRate = BigDecimal("0.90")
        )
        doAnswer {
            val exp = it.arguments[0] as Expense
            exp.id = 1
            exp
        }.`when`(expenseRepository).save(anyObject(dummyExpense))

        val result = expenseService.createExpense(createBody, techUser)

        assertEquals(BigDecimal("100.00"), result.amountOriginal)
        assertEquals(BigDecimal("0.90"), result.fxRate)
        assertEquals(BigDecimal("90.00"), result.amountEur)
        assertTrue(result.fxRateManual)
        verify(fxService, times(0)).getRate(anyString(), anyString())
    }

    @Test
    fun `createExpense without fxRate should fetch from API and set fxRateManual false`() {
        val createBody = ExpenseCreate(
            amount = BigDecimal("100.00"),
            currency = "GBP",
            date = "2024-01-01",
            taxAmount = BigDecimal("10.00")
        )
        doReturn(BigDecimal("1.15")).`when`(fxService).getRate("GBP", "2024-01-01")
        doAnswer {
            val exp = it.arguments[0] as Expense
            exp.id = 1
            exp
        }.`when`(expenseRepository).save(anyObject(dummyExpense))

        val result = expenseService.createExpense(createBody, techUser)

        assertEquals(BigDecimal("115.00"), result.amountEur)
        assertEquals(BigDecimal("1.15"), result.fxRate)
        assertFalse(result.fxRateManual)
        verify(fxService).getRate("GBP", "2024-01-01")
    }

    @Test
    fun `updateExpense with manual fxRate should use provided rate and set fxRateManual`() {
        val expense = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("50.00"), amountEur = BigDecimal("50.00"), currencyOriginal = "EUR", date = "2024-01-01")
        doReturn(Optional.of(expense)).`when`(expenseRepository).findById(1)
        doAnswer {
            val exp = it.arguments[0] as Expense
            exp.id = 1
            exp
        }.`when`(expenseRepository).save(anyObject(dummyExpense))

        val result = expenseService.updateExpense(1, ExpenseUpdate(amount = BigDecimal("100.00"), currency = "USD", fxRate = BigDecimal("0.88")), techUser)

        assertEquals(BigDecimal("100.00"), result.amountOriginal)
        assertEquals("USD", result.currencyOriginal)
        assertEquals(BigDecimal("0.88"), result.fxRate)
        assertEquals(BigDecimal("88.00"), result.amountEur)
        assertTrue(result.fxRateManual)
        verify(fxService, times(0)).getRate(anyString(), anyString())
    }

    @Test
    fun `updateExpense amount and tax only retains existing manual rate`() {
        val expense = Expense(
            id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("50.00"),
            amountEur = BigDecimal("45.00"), currencyOriginal = "USD", fxRate = BigDecimal("0.90"),
            fxRateManual = true, taxAmount = BigDecimal("5.00"), taxAmountEur = BigDecimal("4.50"),
            date = "2024-01-01"
        )
        doReturn(Optional.of(expense)).`when`(expenseRepository).findById(1)
        doAnswer { it.arguments[0] as Expense }.`when`(expenseRepository).save(anyObject(dummyExpense))

        val result = expenseService.updateExpense(
            1,
            ExpenseUpdate(amount = BigDecimal("100.00"), taxAmount = BigDecimal("10.00")),
            techUser
        )

        assertEquals(BigDecimal("0.90"), result.fxRate)
        assertTrue(result.fxRateManual)
        assertEquals(BigDecimal("90.00"), result.amountEur)
        assertEquals(BigDecimal("9.00"), result.taxAmountEur)
        verify(fxService, times(0)).getRate(anyString(), anyString())
    }

    @Test
    fun `updateExpense amount only retains existing automatic rate`() {
        val expense = Expense(
            id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("50.00"),
            amountEur = BigDecimal("42.50"), currencyOriginal = "USD", fxRate = BigDecimal("0.85"),
            fxRateManual = false, date = "2024-01-01"
        )
        doReturn(Optional.of(expense)).`when`(expenseRepository).findById(1)
        doAnswer { it.arguments[0] as Expense }.`when`(expenseRepository).save(anyObject(dummyExpense))

        val result = expenseService.updateExpense(1, ExpenseUpdate(amount = BigDecimal("100.00")), techUser)

        assertEquals(BigDecimal("0.85"), result.fxRate)
        assertFalse(result.fxRateManual)
        assertEquals(BigDecimal("85.00"), result.amountEur)
        verify(fxService, times(0)).getRate(anyString(), anyString())
    }

    @Test
    fun `updateExpense currency change resolves fresh policy rate and clears manual provenance`() {
        val expense = Expense(
            id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("50.00"),
            amountEur = BigDecimal("45.00"), currencyOriginal = "USD", fxRate = BigDecimal("0.90"),
            fxRateManual = true, date = "2024-01-01"
        )
        doReturn(Optional.of(expense)).`when`(expenseRepository).findById(1)
        doReturn(BigDecimal("0.82")).`when`(fxService).getRate("GBP", "2024-01-01")
        doAnswer { it.arguments[0] as Expense }.`when`(expenseRepository).save(anyObject(dummyExpense))

        val result = expenseService.updateExpense(1, ExpenseUpdate(currency = "GBP"), techUser)

        assertEquals("GBP", result.currencyOriginal)
        assertEquals(BigDecimal("0.82"), result.fxRate)
        assertFalse(result.fxRateManual)
        assertEquals(BigDecimal("41.00"), result.amountEur)
        verify(fxService).getRate("GBP", "2024-01-01")
    }

    @Test
    fun `duplicateExpense should preserve fxRate and fxRateManual from source`() {
        val sourceExpense = Expense(
            id = 1, user = techUser, status = "draft",
            amountOriginal = BigDecimal("100.00"), currencyOriginal = "USD",
            amountEur = BigDecimal("90.00"), fxRate = BigDecimal("0.90"), fxRateManual = true,
            taxAmount = BigDecimal("10.00"), taxAmountEur = BigDecimal("9.00"),
            date = "2024-01-01"
        )
        doReturn(Optional.of(sourceExpense)).`when`(expenseRepository).findById(1)
        doAnswer {
            val exp = it.arguments[0] as Expense
            exp.id = 2
            exp
        }.`when`(expenseRepository).save(anyObject(dummyExpense))

        val result = expenseService.duplicateExpense(1, techUser)

        assertEquals(BigDecimal("0.90"), result.fxRate)
        assertTrue(result.fxRateManual)
        assertEquals(BigDecimal("90.00"), result.amountEur)
        assertEquals(BigDecimal("9.00"), result.taxAmountEur)
        assertEquals("draft", result.status)
        assertNull(result.reportId)
        verify(fxService, times(0)).getRate(anyString(), anyString())
    }

    @Test
    fun `listExpenses with filters and authorization`() {
        val exp = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        doReturn(listOf(exp)).`when`(expenseRepository).findAllWithFilters(any(), any(), any(), any(), any(), any(), any(), any())

        val list = expenseService.listExpenses(techUser, null, null, null, null, null, false, null, 20, null) as List<*>
        assertEquals(1, list.size)
    }

    @Test
    fun `getExpense owner access vs unauthorized access`() {
        val exp = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        doReturn(Optional.of(exp)).`when`(expenseRepository).findById(1)

        // Owner can access
        val ownerResult = expenseService.getExpense(1, techUser)
        assertEquals(1, ownerResult.id)

        // Manager can access
        val managerResult = expenseService.getExpense(1, managerUser)
        assertEquals(1, managerResult.id)

        // Other non-privileged user cannot access
        assertThrows<ResponseStatusException> {
            expenseService.getExpense(1, otherUser)
        }
    }

    @Test
    fun `exportExpenses builds csv and xlsx`() {
        val exp = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        doReturn(listOf(exp)).`when`(expenseRepository).findAllWithFilters(any(), any(), any(), any(), any(), any(), any(), any())
        doReturn("csv,content".toByteArray()).`when`(exportService).buildCsv(anyList(), anyList())

        val (bytes, contentType, filename) = expenseService.exportExpenses(techUser, "csv", null, null, null, null, null, false, null)
        assertEquals("text/csv", contentType)
        assertTrue(filename.endsWith(".csv"))
        assertArrayEquals("csv,content".toByteArray(), bytes)
    }

    @Test
    fun `getReceiptBytes downloads receipt file`() {
        val exp = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        val receipt = Receipt(id = 10, expense = exp, filePath = "2024/01/1_receipt.png", originalName = "receipt.png", createdAt = Instant.now())
        exp.receipts.add(receipt)
        doReturn(Optional.of(exp)).`when`(expenseRepository).findById(1)
        doReturn(Optional.of(receipt)).`when`(receiptRepository).findById(10)
        doReturn("image-bytes".toByteArray()).`when`(storageService).downloadFile("2024/01/1_receipt.png")

        val (bytes, contentType) = expenseService.getReceiptBytes(1, 10, techUser)
        assertEquals("image/png", contentType)
        assertArrayEquals("image-bytes".toByteArray(), bytes)
    }

    @Test
    fun `uploadReceipts uses StorageContext RECEIPT`() {
        val verifiedAt = Instant.parse("2024-01-02T03:04:05Z")
        val exp = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01", verificationState = ExpenseVerificationState.VERIFIED, lastVerifiedAt = verifiedAt, lastVerifiedBy = techUser)
        doReturn(Optional.of(exp)).`when`(expenseRepository).findById(1)
        doReturn("2024/01/1_test.png").`when`(storageService).storeFile(eqNonNull(StorageContext.RECEIPT), anyObject(dummyUpload), anyInt())
        doAnswer {
            val r = it.arguments[0] as Receipt
            r.id = 100
            r
        }.`when`(receiptRepository).save(anyObject(dummyReceipt))

        val file = MockMultipartFile("files", "test.png", "image/png", pngBytes)
        val result = expenseService.uploadReceipts(1, listOf(file), techUser)

        assertEquals(1, result.size)
        assertEquals("2024/01/1_test.png", result[0]["file_path"])
        assertEquals(ExpenseVerificationState.VERIFIED, exp.verificationState)
        assertEquals(verifiedAt, exp.lastVerifiedAt)
        assertEquals(techUser.id, exp.lastVerifiedBy?.id)
        verify(storageService).storeFile(eqNonNull(StorageContext.RECEIPT), anyObject(dummyUpload), anyInt())
    }

    @Test
    fun `deleteSingleReceipt preserves completed verification`() {
        val verifiedAt = Instant.parse("2024-01-02T03:04:05Z")
        val expense = Expense(
            id = 1,
            user = techUser,
            status = "draft",
            amountOriginal = BigDecimal("10.00"),
            amountEur = BigDecimal("10.00"),
            currencyOriginal = "EUR",
            date = "2024-01-01",
            verificationState = ExpenseVerificationState.VERIFIED,
            lastVerifiedAt = verifiedAt,
            lastVerifiedBy = techUser,
        )
        val receipt = Receipt(id = 100, expense = expense, filePath = "2024/01/1_test.png", originalName = "test.png")
        expense.receipts.add(receipt)
        doReturn(Optional.of(expense)).`when`(expenseRepository).findById(1)
        doReturn(Optional.of(receipt)).`when`(receiptRepository).findById(100)

        expenseService.deleteSingleReceipt(1, 100, techUser)

        assertEquals(ExpenseVerificationState.VERIFIED, expense.verificationState)
        assertEquals(verifiedAt, expense.lastVerifiedAt)
        assertEquals(techUser.id, expense.lastVerifiedBy?.id)
        verify(receiptRepository).delete(receipt)
    }
}
