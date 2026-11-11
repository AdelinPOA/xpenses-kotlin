package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.report.ImportOrderIn
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
import eu.nt.xpenses.services.StorageService
import eu.nt.xpenses.services.mapper.ReportMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
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
}
