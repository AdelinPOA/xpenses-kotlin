package eu.nt.xpenses.report

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.dto.report.BulkStatusBody
import eu.nt.xpenses.dto.report.ImportOrderPreviewOut
import eu.nt.xpenses.dto.report.ReportCreate
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.dto.report.ReportUpdate
import eu.nt.xpenses.mileage.VehicleMileage
import eu.nt.xpenses.model.AdvancePayment
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.MileageRecord
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.PagedResponse
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycle
import eu.nt.xpenses.report.lifecycle.ReportLifecycleNotificationAdapter
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.PdfService
import eu.nt.xpenses.services.SaveIdempotencyService
import eu.nt.xpenses.services.StorageContext
import eu.nt.xpenses.services.StorageService
import eu.nt.xpenses.expense.ExpenseProjector
import jakarta.persistence.EntityManager
import org.apache.pdfbox.Loader
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import java.io.ByteArrayInputStream
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import java.util.zip.ZipInputStream

class ExpenseReportsTest : IntegrationTestBase() {

    @Autowired
    private lateinit var expenseReports: ExpenseReports

    @Autowired
    private lateinit var receiptRepository: ReceiptRepository

    @Autowired
    private lateinit var storageService: StorageService

    @Autowired
    private lateinit var expenseProjector: ExpenseProjector

    @Autowired
    private lateinit var lifecycle: ExpenseReportLifecycle

    @Autowired
    private lateinit var notificationAdapter: ReportLifecycleNotificationAdapter

    @Autowired
    private lateinit var reportProjector: ReportProjector

    @Autowired
    private lateinit var dailyAllowanceRatePort: DailyAllowanceRatePort

    @Autowired
    private lateinit var vehicleMileage: VehicleMileage

    @Autowired
    private lateinit var authorization: Authorization

    @Autowired
    private lateinit var idempotency: SaveIdempotencyService

    @Autowired
    private lateinit var pdfService: PdfService

    @Autowired
    private lateinit var exportService: ExportService

    @Autowired
    private lateinit var transactionManager: PlatformTransactionManager

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    private lateinit var entityManager: EntityManager

    private val minimalPng = byteArrayOf(
        0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    )

    private fun user(username: String): User = userRepository.findByUsername(username)!!

    private fun makeExpense(
        username: String = "tech1",
        report: ExpenseReport? = null,
        amountEur: BigDecimal = BigDecimal("50.00"),
        date: String = "2026-06-01",
        merchant: String? = "Acme Store",
        status: String = "draft",
    ): Expense {
        val category = categoryRepository.findAll().first()
        return expenseRepository.save(
            Expense(
                user = user(username),
                category = category,
                report = report,
                merchant = merchant,
                amountOriginal = amountEur,
                amountEur = amountEur,
                date = date,
                status = status,
            )
        )
    }

    private fun makeReport(
        username: String = "tech1",
        title: String = "Trip Report",
        status: String = "draft",
        dateFrom: String? = "2026-06-01",
        dateTo: String? = "2026-06-02",
    ): ExpenseReport = expenseReportRepository.save(
        ExpenseReport(
            user = user(username),
            title = title,
            status = status,
            dateFrom = dateFrom,
            dateTo = dateTo,
        )
    )

    private fun flushAndClear() {
        entityManager.flush()
        entityManager.clear()
    }

    @Test
    fun `ReportTotals separates API reimbursement from PDF reimbursement and handles invalid dates`() {
        val tech = user("tech1")
        val report = ExpenseReport(id = 1, user = tech, title = "Totals", dateFrom = "2026-06-01", dateTo = "2026-06-03")
        val expenses = listOf(
            Expense(id = 1, user = tech, amountOriginal = BigDecimal("80.00"), amountEur = BigDecimal("80.00"), date = "2026-06-01"),
            Expense(id = 2, user = tech, amountOriginal = BigDecimal("20.00"), amountEur = BigDecimal("20.00"), date = "2026-06-02"),
        )
        val advances = listOf(
            AdvancePayment(id = 1, user = tech, report = report, amountOriginal = BigDecimal("30.00"), amountEur = BigDecimal("30.00"), date = "2026-06-01", status = "paid"),
            AdvancePayment(id = 2, user = tech, report = report, amountOriginal = BigDecimal("99.00"), amountEur = BigDecimal("99.00"), date = "2026-06-01", status = "requested"),
        )
        val mileage = listOf(
            MileageRecord(
                id = 1,
                report = report,
                user = tech,
                origin = "A",
                destination = "B",
                distanceKm = 100.0,
                rateBeforeTax = BigDecimal("0.60"),
                rateAfterTax = BigDecimal("0.40"),
                amountBeforeTax = BigDecimal("60.00"),
                amountOriginal = BigDecimal("40.00"),
                amountEur = BigDecimal("40.00"),
                currencyOriginal = "EUR",
                fxRate = BigDecimal.ONE,
                startTime = Instant.parse("2026-06-01T08:00:00Z"),
                endTime = Instant.parse("2026-06-01T09:00:00Z"),
            )
        )

        val totals = ReportTotals.calculate("2026-06-01", "2026-06-03", expenses, advances, mileage, BigDecimal("50.00"))
        assertEquals(BigDecimal("100.00"), totals.totalExpensesEur)
        assertEquals(BigDecimal("30.00"), totals.totalPaidAdvancesEur)
        assertEquals(BigDecimal("40.00"), totals.totalMileageEur)
        assertEquals(BigDecimal("150.00"), totals.dailyAllowanceEur)
        // API includes mileage: 100 + 150 + 40 - 30 = 260
        assertEquals(BigDecimal("260.00"), totals.apiReimbursableEur)
        // PDF excludes mileage: 100 + 150 - 30 = 220
        assertEquals(BigDecimal("220.00"), totals.pdfReimbursableEur)

        assertEquals(BigDecimal.ZERO, ReportTotals.calculateDailyAllowance(null, "2026-06-03"))
        assertEquals(BigDecimal.ZERO, ReportTotals.calculateDailyAllowance("2026-06-05", "2026-06-03"))
        assertEquals(BigDecimal.ZERO, ReportTotals.calculateDailyAllowance("bad-date", "2026-06-03"))
    }

    @Test
    fun `ReportProjector toReportOuts queries daily allowance rate once across batch`() {
        var rateCalls = 0
        val countingProjector = ReportProjector(
            expenseProjector = expenseProjector,
            dailyAllowanceRatePort = DailyAllowanceRatePort {
                rateCalls++
                BigDecimal("60.00")
            },
        )
        val reports = listOf(
            makeReport(title = "R1", dateFrom = "2026-06-01", dateTo = "2026-06-01"),
            makeReport(title = "R2", dateFrom = "2026-06-01", dateTo = "2026-06-02"),
            makeReport(title = "R3", dateFrom = "2026-06-01", dateTo = "2026-06-03"),
        )

        val outs = countingProjector.toReportOuts(reports)
        assertEquals(1, rateCalls)
        assertEquals(listOf(BigDecimal("60.00"), BigDecimal("120.00"), BigDecimal("180.00")), outs.map { it.dailyAllowance })
        assertTrue(countingProjector.toReportOuts(emptyList()).isEmpty())
        assertEquals(1, rateCalls)
    }

    @Test
    fun `createReport supports delegation fields, atomic expense attach, and idempotency replay and conflict`() {
        val tech = user("tech1")
        val requiresNew = TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }
        val uniqueKey = "rep-key-${UUID.randomUUID()}"
        val (e1Id, e2Id) = requiresNew.execute {
            val e1 = makeExpense("tech1", amountEur = BigDecimal("25.00"))
            val e2 = makeExpense("tech1", amountEur = BigDecimal("35.00"))
            e1.id!! to e2.id!!
        }

        var createdReportId: Int? = null
        try {
            val req = ReportCreate(
                title = "  Order 9999123  ",
                description = "Order nr: 9999123",
                dateFrom = "2026-06-01",
                dateTo = "2026-06-02",
                kundenauftrag = "9999123",
                kundeName = "Acme GmbH",
                technplatzLine = true,
                expenseIds = listOf(e1Id, e2Id),
            )

            val created = expenseReports.createReport(req, uniqueKey, tech)
            createdReportId = created.id
            assertEquals("Order 9999123", created.title)
            assertEquals("9999123", created.kundenauftrag)
            assertEquals("Acme GmbH", created.kundeName)
            assertTrue(created.technplatzLine)
            assertEquals(2, created.expenses.size)
            assertEquals(BigDecimal("60.00"), created.totalAmount)

            val replayed = expenseReports.createReport(req, uniqueKey, tech)
            assertEquals(created.id, replayed.id)

            val conflict = assertThrows<ResponseStatusException> {
                expenseReports.createReport(req.copy(title = "Changed Title"), uniqueKey, tech)
            }
            assertEquals(HttpStatus.CONFLICT, conflict.statusCode)
        } finally {
            requiresNew.execute {
                jdbcTemplate.update(
                    "DELETE FROM expense_save_requests WHERE user_id = ? AND operation = 'report-create' AND request_key = ?",
                    tech.id!!,
                    uniqueKey,
                )
                jdbcTemplate.update("DELETE FROM expenses WHERE id IN (?, ?)", e1Id, e2Id)
                createdReportId?.let { jdbcTemplate.update("DELETE FROM expense_reports WHERE id = ?", it) }
            }
        }
    }

    @Test
    fun `listReports, getReport, updateReport, and deleteDraft enforce filtering, ownership, odometer, and draft rules`() {
        val tech = user("tech1")
        val manager = user("manager1")
        val tech2 = userRepository.save(User(username = "tech2_rep", displayName = "Tech 2", role = "technician", isActive = true))

        val draft1 = makeReport("tech1", title = "Draft One", status = "draft")
        val submitted = makeReport("tech1", title = "Submitted One", status = "submitted")
        val otherDraft = makeReport("manager1", title = "Manager Draft", status = "draft")
        flushAndClear()

        // Cross-user forbidden for technician
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> {
                expenseReports.listReports(null, false, manager.id, null, 20, tech)
            }.statusCode,
        )

        // Paged & status filter
        val paged = expenseReports.listReports("submitted", false, null, 0, 10, tech) as PagedResponse<*>
        assertTrue(paged.data.any { (it as ReportOut).id == submitted.id })
        assertTrue(paged.data.none { (it as ReportOut).id == draft1.id })

        // Manager all=true sees across users
        @Suppress("UNCHECKED_CAST")
        val allList = expenseReports.listReports(null, true, null, null, 20, manager) as List<ReportOut>
        assertTrue(allList.any { it.id == draft1.id })
        assertTrue(allList.any { it.id == otherDraft.id })

        // getReport ownership & 404
        assertEquals(draft1.id, expenseReports.getReport(draft1.id!!, tech).id)
        assertEquals(draft1.id, expenseReports.getReport(draft1.id!!, manager).id)
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> { expenseReports.getReport(draft1.id!!, tech2) }.statusCode,
        )
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> { expenseReports.getReport(999999, tech) }.statusCode,
        )

        // updateReport validates odometer, updates draft, blocks non-owner & non-draft
        val updated = expenseReports.updateReport(
            draft1.id!!,
            ReportUpdate(title = "Updated Draft", startingOdometerKm = BigDecimal("12345.6")),
            tech,
        )
        assertEquals("Updated Draft", updated.title)
        assertEquals(BigDecimal("12345.6"), updated.startingOdometerKm)

        val clearedOdo = expenseReports.updateReport(
            draft1.id!!,
            ReportUpdate(clearStartingOdometer = true),
            tech,
        )
        assertNull(clearedOdo.startingOdometerKm)

        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> {
                expenseReports.updateReport(submitted.id!!, ReportUpdate(title = "X"), tech)
            }.statusCode,
        )
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> {
                expenseReports.updateReport(draft1.id!!, ReportUpdate(title = "X"), manager)
            }.statusCode,
        )

        expenseReports.deleteDraft(draft1.id!!, false, tech)
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> { expenseReports.getReport(draft1.id!!, tech) }.statusCode,
        )
    }

    @Test
    fun `bulkStatus isolates failures per report without rolling back valid transitions`() {
        val tech = user("tech1")
        val manager = user("manager1")

        val validSubmitted = makeReport("tech1", title = "Valid Submitted", status = "submitted")
        makeExpense("tech1", validSubmitted, status = "submitted")
        val draftReport = makeReport("tech1", title = "Still Draft", status = "draft")
        val managerOwnSubmitted = makeReport("manager1", title = "Manager Own", status = "submitted")
        flushAndClear()

        // Authorization and input validation
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> {
                expenseReports.bulkStatus(BulkStatusBody(listOf(validSubmitted.id!!), "approve"), tech)
            }.statusCode,
        )
        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> {
                expenseReports.bulkStatus(BulkStatusBody(listOf(validSubmitted.id!!), "invalid"), manager)
            }.statusCode,
        )
        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> {
                expenseReports.bulkStatus(BulkStatusBody(listOf(validSubmitted.id!!), "reject", "   "), manager)
            }.statusCode,
        )

        val res = expenseReports.bulkStatus(
            BulkStatusBody(
                ids = listOf(validSubmitted.id!!, draftReport.id!!, managerOwnSubmitted.id!!, 999999, validSubmitted.id!!),
                action = "approve",
            ),
            manager,
        )

        assertEquals(listOf(validSubmitted.id!!), res.succeeded)
        assertEquals(3, res.failed.size)
        assertEquals(setOf(draftReport.id!!, managerOwnSubmitted.id!!, 999999), res.failed.map { it.id }.toSet())
        assertEquals("approved", expenseReportRepository.findById(validSubmitted.id!!).get().status)
        assertEquals("draft", expenseReportRepository.findById(draftReport.id!!).get().status)
    }

    @Test
    fun `downloadReceiptsZip archives sanitized deduplicated entries and throws 404 when empty`() {
        val tech = user("tech1")
        val report = makeReport("tech1", title = "Receipt Zip / Test")
        val e1 = makeExpense("tech1", report, date = "2026-06-01", merchant = "Cafe/Shop")
        val e2 = makeExpense("tech1", report, date = "2026-06-01", merchant = "Cafe/Shop")

        // Empty -> 404
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> { expenseReports.downloadReceiptsZip(report.id!!, tech) }.statusCode,
        )

        val path1 = storageService.storeFile(StorageContext.RECEIPT, RawUpload(minimalPng, "r1.png", "image/png"), e1.id!!)
        val path2 = storageService.storeFile(StorageContext.RECEIPT, RawUpload(minimalPng, "r2.png", "image/png"), e2.id!!)
        receiptRepository.save(Receipt(expense = e1, filePath = path1, originalName = "r1.png"))
        receiptRepository.save(Receipt(expense = e2, filePath = path2, originalName = "r2.png"))
        flushAndClear()

        val zipDownload = expenseReports.downloadReceiptsZip(report.id!!, tech)
        assertEquals("application/zip", zipDownload.contentType)
        assertEquals("receipts_${report.id}_Receipt_Zip__Test.zip", zipDownload.filename)

        val entries = mutableListOf<String>()
        ZipInputStream(ByteArrayInputStream(zipDownload.bytes)).use { zis ->
            while (true) {
                val entry = zis.nextEntry ?: break
                entries.add(entry.name)
                zis.closeEntry()
            }
        }
        assertEquals(listOf("2026-06-01_Cafe_Shop.png", "2026-06-01_Cafe_Shop_2.png"), entries)
    }

    @Test
    fun `exportReportPdf, exportReports, and exportReportExpenses produce valid files and enforce format and access`() {
        val tech = user("tech1")
        val tech2 = userRepository.save(User(username = "tech2_exp", displayName = "Tech 2", role = "technician", isActive = true))
        val report = makeReport("tech1", title = "Export Report")
        makeExpense("tech1", report, amountEur = BigDecimal("42.00"), date = "2026-06-01", merchant = "Hotel")
        flushAndClear()

        // PDF
        val pdfDownload = expenseReports.exportReportPdf(report.id!!, tech)
        assertEquals("application/pdf", pdfDownload.contentType)
        assertEquals("report_${report.id}_Export_Report.pdf", pdfDownload.filename)
        Loader.loadPDF(pdfDownload.bytes).use { doc -> assertTrue(doc.numberOfPages >= 1) }

        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> { expenseReports.exportReportPdf(report.id!!, tech2) }.statusCode,
        )

        // CSV + XLSX reports export
        val csvReports = expenseReports.exportReports("csv", null, false, null, tech)
        assertEquals("text/csv", csvReports.contentType)
        assertTrue(csvReports.filename.endsWith(".csv"))
        assertTrue(String(csvReports.bytes).contains("Export Report"))

        val xlsxReports = expenseReports.exportReports("xlsx", null, false, null, tech)
        assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxReports.contentType)
        XSSFWorkbook(ByteArrayInputStream(xlsxReports.bytes)).use { wb ->
            assertEquals("id", wb.getSheetAt(0).getRow(0).getCell(0).stringCellValue)
        }

        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> { expenseReports.exportReports("json", null, false, null, tech) }.statusCode,
        )

        // CSV + XLSX report expenses export
        val csvExpenses = expenseReports.exportReportExpenses(report.id!!, "csv", tech)
        assertTrue(String(csvExpenses.bytes).contains("Hotel"))
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> { expenseReports.exportReportExpenses(report.id!!, "csv", tech2) }.statusCode,
        )
    }

    @Test
    fun `previewImportOrder and importOrder delegate to EmailImportService and return projected ReportOut`() {
        val tech = user("tech1")
        val emailImportMock = mock(EmailImportService::class.java)
        val module = ExpenseReports(
            expenseReportRepository = expenseReportRepository,
            lifecycle = lifecycle,
            notificationAdapter = notificationAdapter,
            reportProjector = reportProjector,
            dailyAllowanceRatePort = dailyAllowanceRatePort,
            vehicleMileage = vehicleMileage,
            authorization = authorization,
            emailImportService = emailImportMock,
            idempotency = idempotency,
            pdfService = pdfService,
            storageService = storageService,
            exportService = exportService,
            transactionManager = transactionManager,
        )

        val preview = ImportOrderPreviewOut(
            title = "Order: 999",
            description = "Order nr: 999",
            dateFrom = "2026-06-01",
            dateTo = "2026-06-02",
            kundenauftrag = "999",
            kundeName = "Acme GmbH",
        )
        `when`(emailImportMock.previewOrderForUser(tech, "order text")).thenReturn(preview)
        assertEquals(preview, module.previewImportOrder("order text", tech))

        val imported = makeReport("tech1", title = "Order: 999")
        `when`(emailImportMock.importOrderForUser(tech, "order text")).thenReturn(imported)
        flushAndClear()

        val out = module.importOrder("order text", tech)
        assertEquals(imported.id, out.id)
        assertEquals("Order: 999", out.title)
    }
}
