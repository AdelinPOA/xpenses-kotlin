package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.report.ImportOrderIn
import eu.nt.xpenses.dto.report.ImportOrderPreviewOut
import eu.nt.xpenses.dto.report.ReportCreate
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.model.User
import eu.nt.xpenses.report.ExpenseReports
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant

class ReportControllerImportOrderTest {
    private val expenseReports = mock(ExpenseReports::class.java)
    private val controller = ReportController(expenseReports)

    private fun sampleOut(id: Int, title: String, kundenauftrag: String? = null) = ReportOut(
        id = id,
        userId = 15,
        userDisplayName = "Ion Popescu",
        title = title,
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
        kundenauftrag = kundenauftrag,
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
    fun `importOrder delegates to ExpenseReports and returns 201 Created`() {
        val user = User(
            id = 15,
            username = "tech_ro",
            displayName = "Ion Popescu",
            email = "ion@nt-automation.eu",
            role = "technician",
            isActive = true,
        )
        val request = MockHttpServletRequest().apply { setAttribute("currentUser", user) }
        val body = ImportOrderIn("Auftrag 9999123\nStarttermin 01.06.2026")
        val expectedOut = sampleOut(id = 101, title = "Order: 9999123", kundenauftrag = "9999123")

        `when`(expenseReports.importOrder(body.bodyText, user)).thenReturn(expectedOut)

        val response = controller.importOrder(body, request)

        assertEquals(HttpStatus.CREATED, response.statusCode)
        assertEquals(101, response.body?.id)
        assertEquals("9999123", response.body?.kundenauftrag)
        assertEquals("Ion Popescu", response.body?.userDisplayName)
    }

    @Test
    fun `previewImportOrder delegates to ExpenseReports and returns preview payload`() {
        val user = User(id = 15, username = "tech_ro", displayName = "Ion Popescu", role = "technician", isActive = true)
        val request = MockHttpServletRequest().apply { setAttribute("currentUser", user) }
        val body = ImportOrderIn("Auftrag 9999123\nStarttermin 01.06.2026")
        val preview = ImportOrderPreviewOut(
            title = "Order: 9999123",
            description = "Order nr: 9999123",
            dateFrom = "2026-06-01",
            dateTo = "2026-06-02",
            kundenauftrag = "9999123",
            kundeName = "Acme GmbH",
        )
        `when`(expenseReports.previewImportOrder(body.bodyText, user)).thenReturn(preview)

        val response = controller.previewImportOrder(body, request)

        assertEquals("Order: 9999123", response.title)
        assertEquals("9999123", response.kundenauftrag)
        assertEquals("Acme GmbH", response.kundeName)
    }

    @Test
    fun `createReport passes Idempotency-Key header and body to ExpenseReports and returns 201 Created`() {
        val user = User(id = 15, username = "tech_ro", displayName = "Ion Popescu", role = "technician", isActive = true)
        val request = MockHttpServletRequest().apply {
            setAttribute("currentUser", user)
            addHeader("Idempotency-Key", "idem-123")
        }
        val body = ReportCreate(title = "Trip", dateFrom = "2026-06-01", dateTo = "2026-06-02", expenseIds = listOf(11, 12))
        val expectedOut = sampleOut(id = 303, title = "Trip")
        `when`(expenseReports.createReport(body, "idem-123", user)).thenReturn(expectedOut)

        val response = controller.createReport(body, request)

        assertEquals(HttpStatus.CREATED, response.statusCode)
        assertEquals(303, response.body?.id)
        verify(expenseReports).createReport(body, "idem-123", user)
    }
}
