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
import org.mockito.Mockito.*
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.util.Optional
import java.time.Instant

class ExpenseServiceTest {

    private val expenseRepository = mock(ExpenseRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val expenseReportRepository = mock(ExpenseReportRepository::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val fxService = mock(FxService::class.java)
    private val storageService = mock(StorageService::class.java)

    private val expenseService = ExpenseService(
        expenseRepository,
        categoryRepository,
        expenseReportRepository,
        ocrComparisonRepository,
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
            amount = 100.0,
            currency = "USD",
            date = "2024-01-01",
            taxAmount = 10.0
        )
        `when`(fxService.getRate("USD", "2024-01-01")).thenReturn(0.85)
        `when`(expenseRepository.save(any(Expense::class.java))).thenAnswer { it.arguments[0] }

        val result = expenseService.createExpense(createBody, techUser)

        assertEquals(100.0, result.amountOriginal)
        assertEquals("USD", result.currencyOriginal)
        assertEquals(85.0, result.amountEur)
        verify(expenseRepository).save(any(Expense::class.java))
    }

    @Test
    fun `updateExpense should reject if not draft`() {
        val expense = Expense(id = 1, user = techUser, status = "submitted", amountOriginal = 10.0, currencyOriginal = "EUR", date = "2024-01-01")
        `when`(expenseRepository.findById(1)).thenReturn(Optional.of(expense))

        val ex = assertThrows<ResponseStatusException> {
            expenseService.updateExpense(1, ExpenseUpdate(amount = 20.0), techUser)
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }

    @Test
    fun `deleteExpense should delete (soft delete handled by JPA) if draft`() {
        val expense = Expense(id = 1, user = techUser, status = "draft", amountOriginal = 10.0, currencyOriginal = "EUR", date = "2024-01-01")
        `when`(expenseRepository.findById(1)).thenReturn(Optional.of(expense))

        expenseService.deleteExpense(1, techUser)
        verify(expenseRepository).delete(expense)
    }
}
