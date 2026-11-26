package eu.nt.xpenses.report

import eu.nt.xpenses.dto.report.BulkStatusBody
import eu.nt.xpenses.dto.report.BulkStatusFailure
import eu.nt.xpenses.dto.report.BulkStatusResult
import eu.nt.xpenses.dto.report.ImportOrderPreviewOut
import eu.nt.xpenses.dto.report.ReportCreate
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.dto.report.ReportUpdate
import eu.nt.xpenses.mileage.VehicleMileage
import eu.nt.xpenses.model.AdvancePayment
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.MileageRecord
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.PagedResponse
import eu.nt.xpenses.report.lifecycle.AttachExpensesCommand
import eu.nt.xpenses.report.lifecycle.DeleteDraftReportCommand
import eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycle
import eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycleEvent
import eu.nt.xpenses.report.lifecycle.ReportLifecycleNotificationAdapter
import eu.nt.xpenses.report.lifecycle.RejectReportCommand
import eu.nt.xpenses.report.lifecycle.SubmitReportCommand
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.PdfService
import eu.nt.xpenses.services.SaveIdempotencyService
import eu.nt.xpenses.services.StorageService
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import tools.jackson.core.type.TypeReference
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Service
class ExpenseReports(
    private val expenseReportRepository: ExpenseReportRepository,
    private val lifecycle: ExpenseReportLifecycle,
    private val notificationAdapter: ReportLifecycleNotificationAdapter,
    private val reportProjector: ReportProjector,
    private val dailyAllowanceRatePort: DailyAllowanceRatePort,
    private val vehicleMileage: VehicleMileage,
    private val authorization: Authorization,
    private val emailImportService: EmailImportService,
    private val idempotency: SaveIdempotencyService,
    pdfService: PdfService,
    storageService: StorageService,
    exportService: ExportService,
    transactionManager: PlatformTransactionManager,
) {
    private val exporter = ReportExporter(pdfService, storageService, exportService)
    private val writeTx = TransactionTemplate(transactionManager)
    private val readTx = TransactionTemplate(transactionManager).apply { isReadOnly = true }
    private val reportType = object : TypeReference<ReportOut>() {}
    private val log = LoggerFactory.getLogger(ExpenseReports::class.java)

    fun listReports(
        status: String?,
        all: Boolean,
        userId: Int?,
        page: Int?,
        size: Int,
        actor: User,
    ): Any = readTx.execute {
        if (userId != null && userId != actor.id && !authorization.canViewAll(actor)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
        }

        if (page != null) {
            val targetUid: Int? = if (all && authorization.canViewAll(actor)) userId else (userId ?: actor.id)
            val pageable = PageRequest.of(page.coerceAtLeast(0), size.coerceIn(1, 100))
            val result = expenseReportRepository.findAllWithFiltersPaged(targetUid, status, pageable)
            PagedResponse(
                data = reportProjector.toReportOuts(result.content),
                page = result.number,
                size = result.size,
                totalElements = result.totalElements,
                totalPages = result.totalPages,
            )
        } else {
            val reports = queryReportsWithExpenses(status, all, userId, actor)
                .sortedWith(
                    compareBy<ExpenseReport> { if (it.status == "draft") 0 else 1 }
                        .thenByDescending { it.createdAt }
                        .thenByDescending { it.id ?: 0 },
                )
            reportProjector.toReportOuts(reports)
        }
    }

    fun createReport(
        body: ReportCreate,
        idempotencyKeyHeader: String?,
        actor: User,
    ): ReportOut {
        val key = idempotency.validateKey(idempotencyKeyHeader)
        val action = {
            val now = Instant.now()
            val report = ExpenseReport(
                user = actor,
                title = body.title.trim(),
                description = body.description?.trim()?.ifEmpty { null },
                dateFrom = body.dateFrom?.trim()?.ifEmpty { null },
                dateTo = body.dateTo?.trim()?.ifEmpty { null },
                currency = body.currency.uppercase(),
                status = "draft",
                kundenauftrag = body.kundenauftrag?.trim()?.ifEmpty { null },
                auftragsart = body.auftragsart?.trim()?.ifEmpty { null },
                positionstyp = body.positionstyp?.trim()?.ifEmpty { null },
                technplatzRaw = body.technplatzRaw?.trim()?.ifEmpty { null },
                technplatzLine = body.technplatzLine,
                kundeCode = body.kundeCode?.trim()?.ifEmpty { null },
                kundeName = body.kundeName?.trim()?.ifEmpty { null },
                adresse = body.adresse?.trim()?.ifEmpty { null },
                vorgang = body.vorgang?.trim()?.ifEmpty { null },
                arbeitsplatz = body.arbeitsplatz?.trim()?.ifEmpty { null },
                techniker = body.techniker?.trim()?.ifEmpty { null },
                createdAt = now,
                updatedAt = now,
            )
            val saved = expenseReportRepository.save(report)
            val finalReport = if (!body.expenseIds.isNullOrEmpty()) {
                lifecycle.attach(saved.id!!, AttachExpensesCommand(body.expenseIds), actor).report
            } else {
                saved
            }
            reportProjector.toReportOut(finalReport)
        }

        return if (key != null) {
            idempotency.execute(actor.id!!, "report-create", key, idempotency.hash(body), reportType) {
                action()
            }
        } else {
            writeTx.execute { action() }
        }
    }

    fun previewImportOrder(bodyText: String, actor: User): ImportOrderPreviewOut =
        emailImportService.previewOrderForUser(actor, bodyText)

    fun importOrder(bodyText: String, actor: User): ReportOut {
        val report = emailImportService.importOrderForUser(actor, bodyText)
        return toReportOut(report)
    }

    fun getReport(reportId: Int, actor: User): ReportOut = readTx.execute {
        val report = loadVisibleReport(reportId, actor)
        reportProjector.toReportOut(report)
    }

    fun updateReport(reportId: Int, body: ReportUpdate, actor: User): ReportOut = writeTx.execute {
        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }
        if (report.user?.id != actor.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can update a report")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft reports can be edited")
        }

        if (body.title != null) report.title = body.title
        if (body.description != null) report.description = body.description
        if (body.dateFrom != null) report.dateFrom = body.dateFrom
        if (body.dateTo != null) report.dateTo = body.dateTo
        if (body.currency != null) report.currency = body.currency.uppercase()
        if (body.kundenauftrag != null) report.kundenauftrag = body.kundenauftrag.ifBlank { null }
        if (body.auftragsart != null) report.auftragsart = body.auftragsart.ifBlank { null }
        if (body.positionstyp != null) report.positionstyp = body.positionstyp.ifBlank { null }
        if (body.technplatzRaw != null) report.technplatzRaw = body.technplatzRaw.ifBlank { null }
        if (body.kundeCode != null) report.kundeCode = body.kundeCode.ifBlank { null }
        if (body.kundeName != null) report.kundeName = body.kundeName.ifBlank { null }
        if (body.adresse != null) report.adresse = body.adresse.ifBlank { null }
        if (body.vorgang != null) report.vorgang = body.vorgang.ifBlank { null }
        if (body.arbeitsplatz != null) report.arbeitsplatz = body.arbeitsplatz.ifBlank { null }
        if (body.techniker != null) report.techniker = body.techniker.ifBlank { null }
        if (body.clearStartingOdometer) {
            report.startingOdometerKm = null
        } else if (body.startingOdometerKm != null) {
            report.startingOdometerKm = vehicleMileage.validateAndNormalizeOdometerKm(
                body.startingOdometerKm,
                "starting_odometer_km",
            )
        }

        report.updatedAt = Instant.now()
        val saved = expenseReportRepository.save(report)
        reportProjector.toReportOut(saved)
    }

    fun deleteDraft(reportId: Int, deleteExpenses: Boolean, actor: User) {
        lifecycle.deleteDraft(reportId, DeleteDraftReportCommand(deleteExpenses), actor)
    }

    fun attachExpenses(reportId: Int, expenseIds: List<Int>, actor: User): ReportOut {
        val outcome = lifecycle.attach(reportId, AttachExpensesCommand(expenseIds), actor)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    fun submitReport(reportId: Int, expenseIds: List<Int>?, actor: User): ReportOut {
        val outcome = lifecycle.submit(reportId, SubmitReportCommand(expenseIds), actor)
        try {
            vehicleMileage.advancePrimaryVehicleOdometer(reportId, outcome.report.startingOdometerKm)
        } catch (ex: Exception) {
            log.warn("Failed to advance vehicle odometer for report {}: {}", reportId, ex.message)
        }
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    fun recallReport(reportId: Int, actor: User): ReportOut {
        val outcome = lifecycle.recall(reportId, actor)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    fun approveReport(reportId: Int, actor: User): ReportOut {
        val outcome = lifecycle.approve(reportId, actor)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    fun rejectReport(reportId: Int, reason: String, actor: User): ReportOut {
        val outcome = lifecycle.reject(reportId, RejectReportCommand(reason), actor)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    fun payReport(reportId: Int, actor: User): ReportOut {
        val outcome = lifecycle.pay(reportId, actor)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    fun signReport(reportId: Int, actor: User): ReportOut {
        val outcome = lifecycle.sign(reportId, actor)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    /**
     * Bulk approve/reject. Each report is transitioned independently (its own
     * transaction) so partial failures don't roll back the whole batch; the
     * caller receives per-row results and can retry only the failed ids.
     */
    fun bulkStatus(body: BulkStatusBody, actor: User): BulkStatusResult {
        if (!authorization.canManage(actor)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        val action = body.action?.lowercase()
        if (action !in listOf("approve", "reject")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "action must be 'approve' or 'reject'")
        }
        val sharedReason = body.reason?.trim().orEmpty()
        if (action == "reject" && sharedReason.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A rejection reason is required")
        }

        val succeeded = mutableListOf<Int>()
        val failed = mutableListOf<BulkStatusFailure>()
        val events = mutableListOf<ExpenseReportLifecycleEvent>()

        for (id in body.ids.distinct()) {
            try {
                val outcome = if (action == "approve") {
                    lifecycle.approve(id, actor)
                } else {
                    lifecycle.reject(id, RejectReportCommand(sharedReason), actor)
                }
                succeeded.add(id)
                events.addAll(outcome.events)
            } catch (e: Exception) {
                failed.add(BulkStatusFailure(id, e.message))
            }
        }

        if (events.isNotEmpty()) notificationAdapter.dispatch(events)
        return BulkStatusResult(succeeded = succeeded, failed = failed)
    }

    fun exportReportPdf(reportId: Int, actor: User): ReportFileDownload {
        data class PdfInputs(
            val report: ExpenseReport,
            val expenses: List<Expense>,
            val advances: List<AdvancePayment>,
            val mileage: List<MileageRecord>,
            val signer: User?,
            val totals: ReportTotals,
        )

        val inputs = readTx.execute {
            val report = loadVisibleReport(reportId, actor)
            // Eagerly materialize lazy associations inside the read transaction so
            // PDF rendering and receipt storage I/O do not hold a DB connection.
            report.user?.displayName
            report.user?.email
            val signer = report.signer?.also { s ->
                s.displayName
                s.signaturePath
            }
            val expenses = report.expenses.sortedBy { it.date }.onEach { e ->
                e.category?.name
                e.receipts.size
            }
            val advances = report.advances.toList()
            val mileage = report.mileageRecords.toList()
            val totals = ReportTotals.calculate(
                dateFrom = report.dateFrom,
                dateTo = report.dateTo,
                expenses = expenses,
                advances = advances,
                mileage = mileage,
                dailyRate = dailyAllowanceRatePort.currentDailyAllowanceRate(),
            )
            PdfInputs(report, expenses, advances, mileage, signer, totals)
        }

        return exporter.buildPdfDownload(
            report = inputs.report,
            expenses = inputs.expenses,
            advances = inputs.advances,
            mileage = inputs.mileage,
            signer = inputs.signer,
            totals = inputs.totals,
        )
    }

    fun downloadReceiptsZip(reportId: Int, actor: User): ReportFileDownload {
        data class ZipInputs(
            val reportTitle: String,
            val entries: List<ReceiptZipEntry>,
        )

        val zipInputs = readTx.execute {
            val report = loadVisibleReport(reportId, actor)
            val entries = report.expenses.sortedBy { it.date }.flatMap { expense ->
                val namePart = expense.merchant ?: expense.description ?: "expense_${expense.id}"
                expense.receipts.map { receipt ->
                    ReceiptZipEntry(
                        filePath = receipt.filePath,
                        date = expense.date,
                        namePart = namePart,
                    )
                }
            }
            ZipInputs(report.title, entries)
        }

        return exporter.buildReceiptsZipDownload(reportId, zipInputs.reportTitle, zipInputs.entries)
    }

    fun exportReports(
        format: String,
        status: String?,
        all: Boolean,
        userId: Int?,
        actor: User,
    ): ReportFileDownload {
        exporter.validateTableFormat(format)
        val isoFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'")

        val rows = readTx.execute {
            if (userId != null && userId != actor.id && !authorization.canViewAll(actor)) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
            }

            val reports = queryReportsWithExpenses(status, all, userId, actor)
                .sortedByDescending { it.createdAt }
            reports.map { r ->
                buildMap<String, Any?> {
                    put("id", r.id)
                    put("title", r.title)
                    put("status", r.status)
                    put("date_from", r.dateFrom ?: "")
                    put("date_to", r.dateTo ?: "")
                    put("total_amount", r.totalAmount)
                    put("currency", r.currency)
                    put("submitted_at", r.submittedAt?.let { isoFmt.format(it.atZone(ZoneOffset.UTC)) } ?: "")
                    put("approved_at", r.approvedAt?.let { isoFmt.format(it.atZone(ZoneOffset.UTC)) } ?: "")
                    put("paid_at", r.paidAt?.let { isoFmt.format(it.atZone(ZoneOffset.UTC)) } ?: "")
                    put("user", r.user?.displayName ?: "")
                }
            }
        }

        return exporter.buildReportsTableDownload(rows, format)
    }

    fun exportReportExpenses(
        reportId: Int,
        format: String,
        actor: User,
    ): ReportFileDownload {
        exporter.validateTableFormat(format)

        val rows = readTx.execute {
            val report = expenseReportRepository.findByIdWithExpenses(reportId)
                .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found") }
            if (!authorization.canView(actor, report.user?.id)) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
            }

            report.expenses.sortedByDescending { it.date }.map { e ->
                buildMap<String, Any?> {
                    put("id", e.id)
                    put("date", e.date)
                    put("merchant", e.merchant ?: "")
                    put("description", e.description ?: "")
                    put("category", e.category?.name ?: "")
                    put("amount_original", e.amountOriginal)
                    put("currency", e.currencyOriginal)
                    put("amount_eur", e.amountEur)
                    put("fx_rate", e.fxRate)
                    put("tax_amount", e.taxAmount)
                    put("tax_rate", e.taxRate ?: "")
                    put("tax_amount_eur", e.taxAmountEur)
                    put("status", e.status)
                    put("report_id", reportId)
                }
            }
        }

        return exporter.buildReportExpensesTableDownload(reportId, rows, format)
    }

    private fun toReportOut(report: ExpenseReport): ReportOut =
        readTx.execute {
            val managed = report.id?.let { expenseReportRepository.findById(it).orElse(null) } ?: report
            reportProjector.toReportOut(managed)
        }

    private fun loadVisibleReport(reportId: Int, actor: User): ExpenseReport {
        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }
        if (!authorization.canView(actor, report.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your report")
        }
        return report
    }

    private fun queryReportsWithExpenses(
        status: String?,
        all: Boolean,
        userId: Int?,
        actor: User,
    ): List<ExpenseReport> =
        if (all && authorization.canViewAll(actor)) {
            if (userId != null) {
                if (status != null) expenseReportRepository.findAllByUserIdAndStatusWithExpenses(userId, status)
                else expenseReportRepository.findAllByUserIdWithExpenses(userId)
            } else {
                if (status != null) expenseReportRepository.findAllByStatusWithExpenses(status)
                else expenseReportRepository.findAllWithExpenses()
            }
        } else {
            val uid = userId ?: actor.id!!
            if (status != null) expenseReportRepository.findAllByUserIdAndStatusWithExpenses(uid, status)
            else expenseReportRepository.findAllByUserIdWithExpenses(uid)
        }
}
