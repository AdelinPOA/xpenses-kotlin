package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.report.BulkStatusBody
import eu.nt.xpenses.dto.report.BulkStatusFailure
import eu.nt.xpenses.dto.report.BulkStatusResult
import eu.nt.xpenses.dto.report.ImportOrderIn
import eu.nt.xpenses.dto.report.ImportOrderPreviewOut
import eu.nt.xpenses.dto.report.RejectBody
import eu.nt.xpenses.dto.report.ReportCreate
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.dto.report.ReportSubmit
import eu.nt.xpenses.dto.report.ReportUpdate
import eu.nt.xpenses.model.*
import eu.nt.xpenses.models.PagedResponse
import eu.nt.xpenses.report.lifecycle.AttachExpensesCommand
import eu.nt.xpenses.report.lifecycle.DeleteDraftReportCommand
import eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycle
import eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycleEvent
import eu.nt.xpenses.report.lifecycle.ReportLifecycleNotificationAdapter
import eu.nt.xpenses.report.lifecycle.RejectReportCommand
import eu.nt.xpenses.report.lifecycle.SubmitReportCommand
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.MileageRecordRepository
import eu.nt.xpenses.repositories.UserVehicleRepository
import eu.nt.xpenses.services.mapper.ReportMapper
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.PdfService
import eu.nt.xpenses.services.SaveIdempotencyService
import eu.nt.xpenses.services.StorageService
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import tools.jackson.core.type.TypeReference
import jakarta.validation.Valid
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@RestController
@RequestMapping("/api/reports")
class ReportController(
    private val expenseReportRepository: ExpenseReportRepository,
    private val mileageRecordRepository: MileageRecordRepository,
    private val userVehicleRepository: UserVehicleRepository,
    private val pdfService: PdfService,
    private val storageService: StorageService,
    private val exportService: ExportService,
    private val reportMapper: ReportMapper,
    private val lifecycle: ExpenseReportLifecycle,
    private val notificationAdapter: ReportLifecycleNotificationAdapter,
    private val authorization: Authorization,
    private val emailImportService: EmailImportService,
    private val idempotency: SaveIdempotencyService,
    transactionManager: PlatformTransactionManager,
) {
    companion object {
        private val MIN_ODOMETER_KM = BigDecimal.ZERO
        private val MAX_ODOMETER_KM = BigDecimal("9999999.9")
    }
    private val reportType = object : TypeReference<ReportOut>() {}
    private val createTx = TransactionTemplate(transactionManager)
    private val readTx = TransactionTemplate(transactionManager).apply { isReadOnly = true }
    private val log = LoggerFactory.getLogger(ReportController::class.java)

    private fun toReportOut(report: ExpenseReport): ReportOut =
        readTx.execute {
            val managed = report.id?.let { expenseReportRepository.findById(it).orElse(null) } ?: report
            reportMapper.mapReportToOut(managed)
        }

    @GetMapping
    @Transactional(readOnly = true)
    fun listReports(
        @RequestParam(value = "status", required = false) status: String?,
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        @RequestParam(value = "user_id", required = false) userId: Int?,
        @RequestParam(value = "page", required = false) page: Int?,
        @RequestParam(value = "size", required = false, defaultValue = "20") size: Int,
        request: HttpServletRequest
    ): Any {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (userId != null && userId != currentUser.id) {
            if (!authorization.canViewAll(currentUser)) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
            }
        }

        val targetUid: Int? = if (all && authorization.canViewAll(currentUser)) userId else (userId ?: currentUser.id)

        return if (page != null) {
            val clampedPage = page.coerceAtLeast(0)
            val clampedSize = size.coerceIn(1, 100)
            val pageable = org.springframework.data.domain.PageRequest.of(clampedPage, clampedSize)
            val result = expenseReportRepository.findAllWithFiltersPaged(targetUid, status, pageable)
            PagedResponse(
                data = result.content.map { reportMapper.mapReportToOut(it) },
                page = result.number,
                size = result.size,
                totalElements = result.totalElements,
                totalPages = result.totalPages
            )
        } else {
            val reports = if (all && authorization.canViewAll(currentUser)) {
                if (userId != null) {
                    if (status != null) expenseReportRepository.findAllByUserIdAndStatusWithExpenses(userId, status)
                    else expenseReportRepository.findAllByUserIdWithExpenses(userId)
                } else {
                    if (status != null) expenseReportRepository.findAllByStatusWithExpenses(status)
                    else expenseReportRepository.findAllWithExpenses()
                }
            } else {
                val uid = userId ?: currentUser.id!!
                if (status != null) expenseReportRepository.findAllByUserIdAndStatusWithExpenses(uid, status)
                else expenseReportRepository.findAllByUserIdWithExpenses(uid)
            }
            reports.sortedByDescending { it.createdAt }.map { reportMapper.mapReportToOut(it) }
        }
    }

    @PostMapping
    fun createReport(
        @Valid @RequestBody body: ReportCreate,
        request: HttpServletRequest
    ): ResponseEntity<ReportOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val key = idempotency.validateKey(request.getHeader("Idempotency-Key"))
        val action = {
            val report = ExpenseReport(
                user = currentUser,
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
                createdAt = Instant.now(),
                updatedAt = Instant.now()
            )
            val saved = expenseReportRepository.save(report)
            val finalReport =
                if (!body.expenseIds.isNullOrEmpty()) {
                    lifecycle.attach(saved.id!!, AttachExpensesCommand(body.expenseIds), currentUser).report
                } else {
                    saved
                }
            reportMapper.mapReportToOut(finalReport)
        }
        val created =
            if (key != null) {
                idempotency.execute(currentUser.id!!, "report-create", key, idempotency.hash(body), reportType) {
                    action()
                }
            } else {
                createTx.execute { action() }
            }
        return ResponseEntity.status(HttpStatus.CREATED).body(created)
    }

    @PostMapping("/import-order/preview")
    fun previewImportOrder(
        @Valid @RequestBody body: ImportOrderIn,
        request: HttpServletRequest
    ): ImportOrderPreviewOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        return emailImportService.previewOrderForUser(currentUser, body.bodyText)
    }

    @PostMapping("/import-order")
    fun importOrder(
        @Valid @RequestBody body: ImportOrderIn,
        request: HttpServletRequest
    ): ResponseEntity<ReportOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = emailImportService.importOrderForUser(currentUser, body.bodyText)
        return ResponseEntity.status(HttpStatus.CREATED).body(toReportOut(report))
    }

    @GetMapping("/{reportId}")
    @Transactional(readOnly = true)
    fun getReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (!authorization.canView(currentUser, report.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your report")
        }

        return reportMapper.mapReportToOut(report)
    }

    @Transactional
    @PatchMapping("/{reportId}")
    fun updateReport(
        @PathVariable reportId: Int,
        @Valid @RequestBody body: ReportUpdate,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
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
            if (!isValidOdometerKm(body.startingOdometerKm)) {
                throw ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "starting_odometer_km must be between 0.0 and 9999999.9 with at most 1 decimal place"
                )
            }
            report.startingOdometerKm = body.startingOdometerKm.setScale(1, RoundingMode.HALF_UP)
        }

        report.updatedAt = Instant.now()
        val saved = expenseReportRepository.save(report)
        return reportMapper.mapReportToOut(saved)
    }

    @DeleteMapping("/{reportId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteReport(
        @PathVariable reportId: Int,
        @RequestParam(value = "delete_expenses", required = false, defaultValue = "false") deleteExpenses: Boolean,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        lifecycle.deleteDraft(reportId, DeleteDraftReportCommand(deleteExpenses), currentUser)
    }

    @PostMapping("/{reportId}/attach")
    fun attachExpenses(
        @PathVariable reportId: Int,
        @RequestBody body: ReportSubmit,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val outcome = lifecycle.attach(reportId, AttachExpensesCommand(body.expenseIds), currentUser)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    @PostMapping("/{reportId}/submit")
    fun submitReport(
        @PathVariable reportId: Int,
        @RequestBody(required = false) body: ReportSubmit?,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val outcome = lifecycle.submit(reportId, SubmitReportCommand(body?.expenseIds), currentUser)
        advancePrimaryVehicleOdometer(reportId, outcome.report.startingOdometerKm)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    private fun isValidOdometerKm(value: BigDecimal): Boolean =
        value.compareTo(MIN_ODOMETER_KM) >= 0 &&
            value.compareTo(MAX_ODOMETER_KM) <= 0 &&
            value.stripTrailingZeros().scale() <= 1

    private fun advancePrimaryVehicleOdometer(reportId: Int, startingOdometerKm: BigDecimal?) {
        if (startingOdometerKm == null) return
        createTx.execute {
            val sortedRecords = mileageRecordRepository.findAllByReportId(reportId)
                .sortedWith(compareBy<MileageRecord>({ it.startTime }, { it.id ?: Int.MAX_VALUE }))
            val primaryVehicleId = sortedRecords.firstOrNull()?.vehicle?.id ?: return@execute
            val primaryVehicle = userVehicleRepository.findById(primaryVehicleId).orElse(null) ?: return@execute
            val totalPrimaryKm = sortedRecords
                .filter { it.vehicle?.id == primaryVehicleId }
                .fold(BigDecimal.ZERO) { acc, r -> acc.add(BigDecimal.valueOf(r.distanceKm)) }
            val endingOdometer = startingOdometerKm
                .add(totalPrimaryKm)
                .setScale(1, RoundingMode.HALF_UP)
            if (endingOdometer.compareTo(MAX_ODOMETER_KM) <= 0 &&
                (primaryVehicle.lastOdometerKm == null || endingOdometer.compareTo(primaryVehicle.lastOdometerKm) > 0)
            ) {
                primaryVehicle.lastOdometerKm = endingOdometer
                primaryVehicle.updatedAt = Instant.now()
                userVehicleRepository.save(primaryVehicle)
            }
        }
    }

    @PostMapping("/{reportId}/recall")
    fun recallReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val outcome = lifecycle.recall(reportId, currentUser)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    @PostMapping("/{reportId}/pay")
    fun payReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val outcome = lifecycle.pay(reportId, currentUser)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    @PostMapping("/{reportId}/approve")
    fun approveReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val outcome = lifecycle.approve(reportId, currentUser)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    @PostMapping("/{reportId}/reject")
    fun rejectReport(
        @PathVariable reportId: Int,
        @Valid @RequestBody(required = false) body: RejectBody?,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val reason = body?.reason ?: ""
        val outcome = lifecycle.reject(reportId, RejectReportCommand(reason), currentUser)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    /**
     * Bulk approve/reject. Each report is transitioned independently (its own
     * transaction) so partial failures don't roll back the whole batch; the
     * caller receives per-row results and can retry only the failed ids.
     */
    @PostMapping("/bulk-status")
    fun bulkStatus(
        @Valid @RequestBody body: BulkStatusBody,
        request: HttpServletRequest
    ): BulkStatusResult {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (!authorization.canManage(currentUser)) {
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
                    lifecycle.approve(id, currentUser)
                } else {
                    lifecycle.reject(id, RejectReportCommand(sharedReason), currentUser)
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

    @PostMapping("/{reportId}/sign")
    fun signReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val outcome = lifecycle.sign(reportId, currentUser)
        notificationAdapter.dispatch(outcome.events)
        return toReportOut(outcome.report)
    }

    @GetMapping("/{reportId}/export")
    fun exportReportPdf(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        data class PdfInputs(
            val report: ExpenseReport,
            val expenses: List<Expense>,
            val advances: List<AdvancePayment>,
            val mileage: List<MileageRecord>,
            val signer: User?
        )

        val inputs = readTx.execute {
            val report = expenseReportRepository.findById(reportId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
            }
            if (!authorization.canView(currentUser, report.user?.id)) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your report")
            }
            // Eagerly materialize lazy associations inside the read transaction so
            // PDF rendering and receipt storage I/O do not hold a DB connection.
            report.user?.displayName
            report.user?.email
            val signer = report.signer?.also { s -> s.displayName; s.signaturePath }
            val expenses = report.expenses.sortedBy { it.date }.onEach { e ->
                e.category?.name
                e.receipts.size
            }
            val advances = report.advances.toList()
            val mileage = report.mileageRecords.toList()
            PdfInputs(report, expenses, advances, mileage, signer)
        }

        val pdfBytes = pdfService.generateReportPdf(
            report = inputs.report,
            expenses = inputs.expenses,
            advances = inputs.advances,
            mileage = inputs.mileage,
            signer = inputs.signer
        )

        val safeTitle = inputs.report.title.filter { it.isLetterOrDigit() || it in listOf('-', '_', ' ') }.trim().replace(" ", "_")
        val filename = "report_${reportId}_${if (safeTitle.length > 40) safeTitle.take(40) else safeTitle}.pdf"

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .body(pdfBytes)
    }

    @GetMapping("/{reportId}/receipts-zip")
    fun downloadReceiptsZip(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        data class ReceiptZipEntry(
            val filePath: String,
            val date: String,
            val namePart: String
        )
        data class ZipInputs(
            val reportTitle: String,
            val entries: List<ReceiptZipEntry>
        )

        val zipInputs = readTx.execute {
            val report = expenseReportRepository.findById(reportId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
            }
            if (!authorization.canView(currentUser, report.user?.id)) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your report")
            }
            val entries = report.expenses.sortedBy { it.date }.flatMap { expense ->
                val namePart = expense.merchant ?: expense.description ?: "expense_${expense.id}"
                expense.receipts.map { receipt ->
                    ReceiptZipEntry(
                        filePath = receipt.filePath,
                        date = expense.date,
                        namePart = namePart
                    )
                }
            }
            ZipInputs(report.title, entries)
        }

        val zipStream = ByteArrayOutputStream()
        ZipOutputStream(zipStream).use { zos ->
            val seen = mutableMapOf<String, Int>()

            for (entry in zipInputs.entries) {
                try {
                    val bytes = storageService.downloadFile(entry.filePath)
                    val ext = entry.filePath.substringAfterLast(".", "")

                    val safeNamePart = entry.namePart
                        .replace(Regex("[^a-zA-Z0-9._-]"), "_")
                        .take(60)
                        .ifBlank { "receipt" }
                    val safeDate = entry.date.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                    val baseName = "${safeDate}_$safeNamePart"
                    var arcName = if (ext.isNotEmpty()) "$baseName.$ext" else baseName

                    val count = seen[arcName]
                    if (count != null) {
                        seen[arcName] = count + 1
                        arcName = if (ext.isNotEmpty()) "${baseName}_${count + 1}.$ext" else "${baseName}_${count + 1}"
                    } else {
                        seen[arcName] = 1
                    }

                    val zipEntry = ZipEntry(arcName)
                    zos.putNextEntry(zipEntry)
                    zos.write(bytes)
                    zos.closeEntry()
                } catch (e: Exception) {
                    log.warn("Failed to add receipt '{}' to zip for report {}: {}", entry.filePath, reportId, e.message)
                }
            }
        }

        val zipBytes = zipStream.toByteArray()
        if (zipBytes.isEmpty()) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "No receipts found for this report")
        }

        val safeTitle = zipInputs.reportTitle.filter { it.isLetterOrDigit() || it in listOf('-', '_', ' ') }.trim().replace(" ", "_")
        val filename = "receipts_${reportId}_${if (safeTitle.length > 40) safeTitle.take(40) else safeTitle}.zip"

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/zip"))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .body(zipBytes)
    }

    @GetMapping("/export")
    @Transactional(readOnly = true)
    fun exportReports(
        @RequestParam(value = "format", required = false, defaultValue = "csv") format: String,
        @RequestParam(value = "status", required = false) status: String?,
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        @RequestParam(value = "user_id", required = false) userId: Int?,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        if (format !in listOf("csv", "xlsx")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported format '$format'. Use 'csv' or 'xlsx'.")
        }

        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (userId != null && userId != currentUser.id) {
            if (!authorization.canViewAll(currentUser)) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
            }
        }

        var reports = if (all && authorization.canViewAll(currentUser)) {
            if (userId != null) {
                if (status != null) expenseReportRepository.findAllByUserIdAndStatusWithExpenses(userId, status)
                else expenseReportRepository.findAllByUserIdWithExpenses(userId)
            } else {
                if (status != null) expenseReportRepository.findAllByStatusWithExpenses(status)
                else expenseReportRepository.findAllWithExpenses()
            }
        } else {
            val targetUid = userId ?: currentUser.id!!
            if (status != null) expenseReportRepository.findAllByUserIdAndStatusWithExpenses(targetUid, status)
            else expenseReportRepository.findAllByUserIdWithExpenses(targetUid)
        }
        reports = reports.sortedByDescending { it.createdAt }

        val isoFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'")
        val columns = listOf("id", "title", "status", "date_from", "date_to", "total_amount", "currency",
            "submitted_at", "approved_at", "paid_at", "user")

        val rows = reports.map { r ->
            buildMap {
                put("id", r.id)
                put("title", r.title)
                put("status", r.status)
                put("date_from", r.dateFrom ?: "")
                put("date_to", r.dateTo ?: "")
                put("total_amount", r.totalAmount)
                put("currency", r.currency)
                put("submitted_at", r.submittedAt?.let { isoFmt.format(it.atZone(java.time.ZoneOffset.UTC)) } ?: "")
                put("approved_at", r.approvedAt?.let { isoFmt.format(it.atZone(java.time.ZoneOffset.UTC)) } ?: "")
                put("paid_at", r.paidAt?.let { isoFmt.format(it.atZone(java.time.ZoneOffset.UTC)) } ?: "")
                put("user", r.user?.displayName ?: "")
            }
        }

        val today = LocalDate.now()
        val (bytes, contentType, ext) = when (format) {
            "xlsx" -> Triple(
                exportService.buildXlsx(rows, columns),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "xlsx"
            )
            else -> Triple(exportService.buildCsv(rows, columns), "text/csv", "csv")
        }

        val headers = HttpHeaders().apply {
            set(HttpHeaders.CONTENT_TYPE, contentType)
            contentDisposition = ContentDisposition.attachment().filename("reports_$today.$ext").build()
        }
        return ResponseEntity(bytes, headers, HttpStatus.OK)
    }

    @GetMapping("/{reportId}/export-csv")
    @Transactional(readOnly = true)
    fun exportReportExpenses(
        @PathVariable reportId: Int,
        @RequestParam(value = "format", required = false, defaultValue = "csv") format: String,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        if (format !in listOf("csv", "xlsx")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported format '$format'. Use 'csv' or 'xlsx'.")
        }

        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = expenseReportRepository.findByIdWithExpenses(reportId)
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found") }

        if (!authorization.canView(currentUser, report.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
        }

        val columns = listOf("id", "date", "merchant", "description", "category",
            "amount_original", "currency", "amount_eur", "fx_rate",
            "tax_amount", "tax_rate", "tax_amount_eur", "status", "report_id")

        val expenses = report.expenses.sortedByDescending { it.date }
        val rows = expenses.map { e ->
            buildMap {
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

        val today = LocalDate.now()
        val (bytes, contentType, ext) = when (format) {
            "xlsx" -> Triple(
                exportService.buildXlsx(rows, columns),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "xlsx"
            )
            else -> Triple(exportService.buildCsv(rows, columns), "text/csv", "csv")
        }

        val headers = HttpHeaders().apply {
            set(HttpHeaders.CONTENT_TYPE, contentType)
            contentDisposition = ContentDisposition.attachment()
                .filename("report_${reportId}_expenses_$today.$ext").build()
        }
        return ResponseEntity(bytes, headers, HttpStatus.OK)
    }
}
