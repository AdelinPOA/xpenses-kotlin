package eu.nt.xpenses.services

import eu.nt.xpenses.models.Expense
import eu.nt.xpenses.models.User
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.controllers.ExpenseCreate
import eu.nt.xpenses.controllers.ExpenseUpdate
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.ArgumentMatchers.any
import java.math.BigDecimal
import org.mockito.Mockito.*
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.util.Optional
import java.time.Instant

import eu.nt.xpenses.repositories.ReceiptRepository

class ExpenseServiceTest {

    private val expenseRepository = mock(ExpenseRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val expenseReportRepository = mock(ExpenseReportRepository::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val receiptRepository = mock(ReceiptRepository::class.java)
    private val fxService = mock(FxService::class.java)
    private val storageService = mock(StorageService::class.java)

    private val expenseService = ExpenseService(
        expenseRepository,
        categoryRepository,
        expenseReportRepository,
        ocrComparisonRepository,
        receiptRepository,
        fxService,
        storageService
    )

    private lateinit var techUser: User

    @BeforeEach
    fun setup() {
        techUser = User(id = 1, username = "tech", displayName = "Tech", role = "technician")
    }

    @Test
    fun `createExpense should use fxService and save`() {
        val createBody = ExpenseCreate(
            amount = BigDecimal("100.00"),
            currency = "USD",
            date = "2024-01-01",
            taxAmount = BigDecimal("10.00")
        )
        `when`(fxService.getRate("USD", "2024-01-01")).thenReturn(BigDecimal("0.85"))
        `when`(expenseRepository.save(any(Expense::class.java))).thenAnswer { it.arguments[0] }

        val result = expenseService.createExpense(createBody, techUser)

        assertEquals(BigDecimal("100.00"), result.amountOriginal)
        assertEquals("USD", result.currencyOriginal)
        assertEquals(BigDecimal("85.00"), result.amountEur)
        verify(expenseRepository).save(any(Expense::class.java))
    }

    @Test
    fun `updateExpense should reject if not draft`() {
        val expense = Expense(id = 1, user = techUser, status = "submitted", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        `when`(expenseRepository.findById(1)).thenReturn(Optional.of(expense))

        val ex = assertThrows<ResponseStatusException> {
            expenseService.updateExpense(1, ExpenseUpdate(amount = BigDecimal("20.00")), techUser)
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }

    @Test
    fun `deleteExpense should delete (soft delete handled by JPA) if draft`() {
        val expense = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        `when`(expenseRepository.findById(1)).thenReturn(Optional.of(expense))

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
        val deactivatedCategory = eu.nt.xpenses.models.Category(id = 10, name = "Deactivated Cat", isActive = false)
        `when`(fxService.getRate("USD", "2024-01-01")).thenReturn(BigDecimal("0.85"))
        `when`(categoryRepository.findById(10)).thenReturn(Optional.of(deactivatedCategory))

        val ex = assertThrows<ResponseStatusException> {
            expenseService.createExpense(createBody, techUser)
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
        assertTrue(ex.reason?.contains("deactivated") == true)
    }

    @Test
    fun `updateExpense should reject deactivated category`() {
        val expense = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("10.00"), amountEur = BigDecimal("10.00"), currencyOriginal = "EUR", date = "2024-01-01")
        val deactivatedCategory = eu.nt.xpenses.models.Category(id = 10, name = "Deactivated Cat", isActive = false)
        `when`(expenseRepository.findById(1)).thenReturn(Optional.of(expense))
        `when`(categoryRepository.findById(10)).thenReturn(Optional.of(deactivatedCategory))

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
        `when`(expenseRepository.save(any(Expense::class.java))).thenAnswer { it.arguments[0] }

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
        `when`(fxService.getRate("GBP", "2024-01-01")).thenReturn(BigDecimal("1.15"))
        `when`(expenseRepository.save(any(Expense::class.java))).thenAnswer { it.arguments[0] }

        val result = expenseService.createExpense(createBody, techUser)

        assertEquals(BigDecimal("115.00"), result.amountEur)
        assertEquals(BigDecimal("1.15"), result.fxRate)
        assertFalse(result.fxRateManual)
        verify(fxService).getRate("GBP", "2024-01-01")
    }

    @Test
    fun `updateExpense with manual fxRate should use provided rate and set fxRateManual`() {
        val expense = Expense(id = 1, user = techUser, status = "draft", amountOriginal = BigDecimal("50.00"), amountEur = BigDecimal("50.00"), currencyOriginal = "EUR", date = "2024-01-01")
        `when`(expenseRepository.findById(1)).thenReturn(Optional.of(expense))
        `when`(expenseRepository.save(any(Expense::class.java))).thenAnswer { it.arguments[0] }

        val result = expenseService.updateExpense(1, ExpenseUpdate(amount = BigDecimal("100.00"), currency = "USD", fxRate = BigDecimal("0.88")), techUser)

        assertEquals(BigDecimal("100.00"), result.amountOriginal)
        assertEquals("USD", result.currencyOriginal)
        assertEquals(BigDecimal("0.88"), result.fxRate)
        assertEquals(BigDecimal("88.00"), result.amountEur)
        assertTrue(result.fxRateManual)
        verify(fxService, times(0)).getRate(anyString(), anyString())
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
        `when`(expenseRepository.findById(1)).thenReturn(Optional.of(sourceExpense))
        `when`(expenseRepository.save(any(Expense::class.java))).thenAnswer { it.arguments[0] }

        val result = expenseService.duplicateExpense(1, techUser)

        assertEquals(BigDecimal("0.90"), result.fxRate)
        assertTrue(result.fxRateManual)
        assertEquals(BigDecimal("90.00"), result.amountEur)
        assertEquals(BigDecimal("9.00"), result.taxAmountEur)
        assertEquals("draft", result.status)
        assertNull(result.report)
        verify(fxService, times(0)).getRate(anyString(), anyString())
    }
}
