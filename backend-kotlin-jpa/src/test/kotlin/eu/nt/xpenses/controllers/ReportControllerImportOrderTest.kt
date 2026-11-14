package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.report.ImportOrderIn
import eu.nt.xpenses.dto.report.ImportOrderPreviewOut
import eu.nt.xpenses.dto.report.ReportCreate
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.User
import eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycle
import eu.nt.xpenses.report.lifecycle.ReportLifecycleNotificationAdapter
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.PdfService
import eu.nt.xpenses.services.SaveIdempotencyService
import eu.nt.xpenses.services.StorageService
import eu.nt.xpenses.services.mapper.ReportMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.AbstractPlatformTransactionManager
import org.springframework.transaction.support.DefaultTransactionStatus
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant

class ReportControllerImportOrderTest {
    private val expenseReportRepository = mock(ExpenseReportRepository::class.java)
    private val pdfService = mock(PdfService::class.java)
    private val storageService = mock(StorageService::class.java)
    private val exportService = mock(ExportService::class.java)
    private val reportMapper = mock(ReportMapper::class.java)
    private val lifecycle = mock(ExpenseReportLifecycle::class.java)
    private val notificationAdapter = mock(ReportLifecycleNotificationAdapter::class.java)
    private val authorization = mock(Authorization::class.java)
    private val emailImportService = mock(EmailImportService::class.java)
    private val idempotency = mock(SaveIdempotencyService::class.java)
    private val noOpTxManager = object : AbstractPlatformTransactionManager() {
        override fun doGetTransaction() = Any()
        override fun doBegin(transaction: Any, definition: TransactionDefinition) {}
        override fun doCommit(status: DefaultTransactionStatus) {}
        override fun doRollback(status: DefaultTransactionStatus) {}
    }

    private val controller = ReportController(
        expenseReportRepository,
        pdfService,
        storageService,
        exportService,
        reportMapper,
        lifecycle,
        notificationAdapter,
        authorization,
        emailImportService,
        idempotency,
        noOpTxManager,
    )

    @Test
    fun `importOrder throws 401 when currentUser is not in request attributes`() {
        val request = MockHttpServletRequest()
        val body = ImportOrderIn("Sample delegation text")

        val ex = assertThrows<ResponseStatusException> {
            controller.importOrder(body, request)
        }
        assertEquals(HttpStatus.UNAUTHORIZED, ex.statusCode)
    }

    @Test
    fun `importOrder passes currentUser and bodyText to service and returns 201 Created`() {
        val user = User(
            id = 15,
            username = "tech_ro",
            displayName = "Ion Popescu",
            email = "ion@nt-automation.eu",
            role = "technician",
            isActive = true
        )
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", user)
        }
        val body = ImportOrderIn("Auftrag 9999123\nStarttermin 01.06.2026")
        val createdReport = ExpenseReport(
            id = 101,
            title = "Order: 9999123",
            user = user,
            status = "draft",
            kundenauftrag = "9999123"
        )
        val expectedOut = ReportOut(
            id = 101,
            userId = 15,
            userDisplayName = "Ion Popescu",
            title = "Order: 9999123",
            description = null,
            dateFrom = null,
            dateTo = null,
            status = "draft",
            submittedAt = null,
            paidAt = null,
            approvedBy = null,
            approvedAt = null,
            rejectedBy = null,
            rejectedAt = null,
            rejectedReason = null,
            signerId = null,
            signedAt = null,
            totalAmount = BigDecimal.ZERO,
            currency = "EUR",
            createdAt = Instant.now(),
            updatedAt = Instant.now(),
            expenses = emptyList(),
            advances = emptyList(),
            totalAdvances = BigDecimal.ZERO,
            mileageRecords = emptyList(),
            totalMileageEur = BigDecimal.ZERO,
            dailyAllowance = BigDecimal.ZERO,
            totalReimbursable = BigDecimal.ZERO,
            kundenauftrag = "9999123"
        )

        `when`(emailImportService.importOrderForUser(user, body.bodyText)).thenReturn(createdReport)
        `when`(reportMapper.mapReportToOut(createdReport)).thenReturn(expectedOut)

        val response = controller.importOrder(body, request)

        assertEquals(HttpStatus.CREATED, response.statusCode)
        assertEquals(101, response.body?.id)
        assertEquals("9999123", response.body?.kundenauftrag)
        assertEquals("Ion Popescu", response.body?.userDisplayName)
    }

    @Test
    fun `previewImportOrder returns parsed preview payload for current user`() {
        val user = User(id = 15, username = "tech_ro", displayName = "Ion Popescu", role = "technician", isActive = true)
        val request = MockHttpServletRequest().apply { setAttribute("currentUser", user) }
        val body = ImportOrderIn("Auftrag 9999123\nStarttermin 01.06.2026")
        val preview =
            ImportOrderPreviewOut(
                title = "Order: 9999123",
                description = "Order nr: 9999123",
                dateFrom = "2026-06-01",
                dateTo = "2026-06-02",
                kundenauftrag = "9999123",
                kundeName = "Acme GmbH",
            )
        `when`(emailImportService.previewOrderForUser(user, body.bodyText)).thenReturn(preview)

        val response = controller.previewImportOrder(body, request)

        assertEquals("Order: 9999123", response.title)
        assertEquals("9999123", response.kundenauftrag)
        assertEquals("Acme GmbH", response.kundeName)
    }

    @Test
    fun `createReport persists optional delegation fields from review flow`() {
        val user = User(id = 15, username = "tech_ro", displayName = "Ion Popescu", role = "technician", isActive = true)
        val request = MockHttpServletRequest().apply { setAttribute("currentUser", user) }
        val body =
            ReportCreate(
                title = "Reviewed Order",
                description = "Order nr: 9999123",
                dateFrom = "2026-06-01",
                dateTo = "2026-06-02",
                kundenauftrag = "9999123",
                kundeName = "Acme GmbH",
                technplatzLine = true,
            )
        val dummyReport = ExpenseReport(id = 202, title = "Reviewed Order", user = user)
        `when`(expenseReportRepository.save(org.mockito.ArgumentMatchers.any(ExpenseReport::class.java) ?: dummyReport))
            .thenAnswer { invocation ->
                (invocation.arguments[0] as ExpenseReport).apply { id = 202 }
            }
        val expectedOut =
            ReportOut(
                id = 202,
                userId = 15,
                userDisplayName = "Ion Popescu",
                title = "Reviewed Order",
                description = "Order nr: 9999123",
                dateFrom = "2026-06-01",
                dateTo = "2026-06-02",
                status = "draft",
                submittedAt = null,
                paidAt = null,
                approvedBy = null,
                approvedAt = null,
                rejectedBy = null,
                rejectedAt = null,
                rejectedReason = null,
                signerId = null,
                signedAt = null,
                totalAmount = BigDecimal.ZERO,
                currency = "EUR",
                createdAt = Instant.now(),
                updatedAt = Instant.now(),
                expenses = emptyList(),
                advances = emptyList(),
                totalAdvances = BigDecimal.ZERO,
                mileageRecords = emptyList(),
                totalMileageEur = BigDecimal.ZERO,
                dailyAllowance = BigDecimal.ZERO,
                totalReimbursable = BigDecimal.ZERO,
                kundenauftrag = "9999123",
                kundeName = "Acme GmbH",
                technplatzLine = true,
            )
        `when`(reportMapper.mapReportToOut(org.mockito.ArgumentMatchers.any(ExpenseReport::class.java) ?: dummyReport))
            .thenReturn(expectedOut)

        val response = controller.createReport(body, request)

        val savedCaptor = org.mockito.ArgumentCaptor.forClass(ExpenseReport::class.java)
        org.mockito.Mockito.verify(expenseReportRepository).save(savedCaptor.capture() ?: dummyReport)
        assertEquals(HttpStatus.CREATED, response.statusCode)
        assertEquals("9999123", savedCaptor.value.kundenauftrag)
        assertEquals("Acme GmbH", savedCaptor.value.kundeName)
        assertEquals(true, savedCaptor.value.technplatzLine)
    }

    @Test
    fun `createReport atomically attaches optional expenseIds when supplied`() {
        val user = User(id = 15, username = "tech_ro", displayName = "Ion Popescu", role = "technician", isActive = true)
        val request = MockHttpServletRequest().apply { setAttribute("currentUser", user) }
        val body = ReportCreate(title = "Trip", dateFrom = "2026-06-01", dateTo = "2026-06-02", expenseIds = listOf(11, 12))
        val savedReport = ExpenseReport(id = 303, title = "Trip", user = user)
        `when`(expenseReportRepository.save(org.mockito.ArgumentMatchers.any(ExpenseReport::class.java) ?: savedReport))
            .thenReturn(savedReport)
        `when`(lifecycle.attach(303, eu.nt.xpenses.report.lifecycle.AttachExpensesCommand(listOf(11, 12)), user))
            .thenReturn(eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycleOutcome(savedReport))
        val expectedOut =
            ReportOut(
                id = 303,
                userId = 15,
                userDisplayName = "Ion Popescu",
                title = "Trip",
                description = null,
                dateFrom = "2026-06-01",
                dateTo = "2026-06-02",
                status = "draft",
                submittedAt = null,
                paidAt = null,
                approvedBy = null,
                approvedAt = null,
                rejectedBy = null,
                rejectedAt = null,
                rejectedReason = null,
                signerId = null,
                signedAt = null,
                totalAmount = BigDecimal.ZERO,
                currency = "EUR",
                createdAt = Instant.now(),
                updatedAt = Instant.now(),
                expenses = emptyList(),
                advances = emptyList(),
                totalAdvances = BigDecimal.ZERO,
                mileageRecords = emptyList(),
                totalMileageEur = BigDecimal.ZERO,
                dailyAllowance = BigDecimal.ZERO,
                totalReimbursable = BigDecimal.ZERO,
            )
        `when`(reportMapper.mapReportToOut(savedReport)).thenReturn(expectedOut)

        val response = controller.createReport(body, request)

        assertEquals(HttpStatus.CREATED, response.statusCode)
        org.mockito.Mockito.verify(lifecycle).attach(303, eu.nt.xpenses.report.lifecycle.AttachExpensesCommand(listOf(11, 12)), user)
    }
}
