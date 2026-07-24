package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.report.RejectBody
import eu.nt.xpenses.dto.report.ReportCreate
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.dto.report.ReportSubmit
import eu.nt.xpenses.dto.report.ReportUpdate
import eu.nt.xpenses.model.*
import eu.nt.xpenses.models.PagedResponse
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.mapper.ExpenseMapper
import eu.nt.xpenses.services.mapper.ReportMapper
import eu.nt.xpenses.services.ExpenseService
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.PdfService
import eu.nt.xpenses.services.ReportService
import eu.nt.xpenses.services.StorageService
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import org.springframework.transaction.annotation.Transactional
import jakarta.validation.Valid
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@RestController
@RequestMapping("/api/reports")
class ReportController(
    private val expenseReportRepository: ExpenseReportRepository,
    private val expenseRepository: ExpenseRepository,
    private val userRepository: UserRepository,
    private val pdfService: PdfService,
    private val storageService: StorageService,
    private val exportService: ExportService,
    private val expenseMapper: ExpenseMapper,
    private val reportMapper: ReportMapper,
    private val reportService: ReportService,
    private val expenseService: ExpenseService
) {
    private val log = LoggerFactory.getLogger(ReportController::class.java)

    @GetMapping
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
            if (currentUser.role !in listOf("chef_finance", "mod", "manager")) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
            }
        }

        val targetUid: Int? = if (all && currentUser.role in listOf("chef_finance", "mod", "manager")) userId else (userId ?: currentUser.id)

        return if (page != null) {
            val pageable = org.springframework.data.domain.PageRequest.of(page, size)
            val result = expenseReportRepository.findAllWithFiltersPaged(targetUid, status, pageable)
            PagedResponse(
                data = result.content.map { reportMapper.mapReportToOut(it) },
                page = result.number,
                size = result.size,
                totalElements = result.totalElements,
                totalPages = result.totalPages
            )
        } else {
            val reports = if (all && currentUser.role in listOf("chef_finance", "mod", "manager")) {
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
    @Transactional
    fun createReport(
        @Valid @RequestBody body: ReportCreate,
        request: HttpServletRequest
    ): ResponseEntity<ReportOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = ExpenseReport(
            user = currentUser,
            title = body.title,
            description = body.description,
            dateFrom = body.dateFrom,
            dateTo = body.dateTo,
            currency = body.currency.uppercase(),
            status = "draft",
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

        val saved = expenseReportRepository.save(report)
        return ResponseEntity.status(HttpStatus.CREATED).body(reportMapper.mapReportToOut(saved))
    }

    @GetMapping("/{reportId}")
    fun getReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (currentUser.role !in listOf("chef_finance", "mod", "manager") && report.user?.id != currentUser.id) {
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

        report.updatedAt = Instant.now()
        val saved = expenseReportRepository.save(report)
        return reportMapper.mapReportToOut(saved)
    }

    @Transactional
    @DeleteMapping("/{reportId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteReport(
        @PathVariable reportId: Int,
        @RequestParam(value = "delete_expenses", required = false, defaultValue = "false") deleteExpenses: Boolean,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can delete a report")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft reports can be deleted")
        }

        val now = Instant.now()
        val expensesList = report.expenses.toList()
        if (deleteExpenses) {
            for (expense in expensesList) {
                expenseService.deleteExpense(expense.id!!, currentUser)
            }
        } else {
            for (expense in expensesList) {
                expense.report = null
                expense.status = "draft"
                expense.updatedAt = now
                expenseRepository.save(expense)
            }
        }
        report.expenses.clear()
        expenseReportRepository.delete(report)
    }

    @Transactional
    @PostMapping("/{reportId}/attach")
    fun attachExpenses(
        @PathVariable reportId: Int,
        @RequestBody body: ReportSubmit,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val saved = reportService.attachExpenses(reportId, body.expenseIds, currentUser)
        return reportMapper.mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/submit")
    fun submitReport(
        @PathVariable reportId: Int,
        @RequestBody(required = false) body: ReportSubmit?,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val saved = reportService.submitReport(reportId, body?.expenseIds, currentUser)
        return reportMapper.mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/recall")
    fun recallReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val saved = reportService.recallReport(reportId, currentUser)
        return reportMapper.mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/pay")
    fun payReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val saved = reportService.payReport(reportId, currentUser)
        return reportMapper.mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/approve")
    fun approveReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val saved = reportService.approveReport(reportId, currentUser)
        return reportMapper.mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/reject")
    fun rejectReport(
        @PathVariable reportId: Int,
        @Valid @RequestBody(required = false) body: RejectBody?,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val reason = body?.reason ?: ""
        val saved = reportService.rejectReport(reportId, reason, currentUser)
        return reportMapper.mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/sign")
    fun signReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the report owner can sign")
        }

        if (currentUser.signaturePath.isNullOrEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No signature saved. Record your signature first.")
        }

        if (report.status !in listOf("submitted", "approved")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted or approved reports can be signed")
        }

        val now = Instant.now()
        report.signer = currentUser
        report.signedAt = now
        report.updatedAt = now

        val saved = expenseReportRepository.save(report)
        return reportMapper.mapReportToOut(saved)
    }

    @GetMapping("/{reportId}/export")
    fun exportReportPdf(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (currentUser.role !in listOf("chef_finance", "mod", "manager") && report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your report")
        }

        val pdfBytes = pdfService.generateReportPdf(
            report = report,
            expenses = report.expenses.sortedBy { it.date },
            advances = report.advances,
            mileage = report.mileageRecords,
            signer = report.signer
        )

        val safeTitle = report.title.filter { it.isLetterOrDigit() || it in listOf('-', '_', ' ') }.trim().replace(" ", "_")
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

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (currentUser.role !in listOf("chef_finance", "mod", "manager") && report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your report")
        }

        val zipStream = ByteArrayOutputStream()
        ZipOutputStream(zipStream).use { zos ->
            val seen = mutableMapOf<String, Int>()
            val expensesSorted = report.expenses.sortedBy { it.date }

            for (expense in expensesSorted) {
                for (receipt in expense.receipts) {
                    try {
                        val bytes = storageService.downloadFile(receipt.filePath)
                        val ext = receipt.filePath.substringAfterLast(".", "")

                        val date = expense.date
                        val namePart = expense.merchant ?: expense.description ?: "expense_${expense.id}"
                        val baseName = "${date}_$namePart".replace(" ", "_").replace("/", "-")
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
                    }
                }
            }
        }

        val zipBytes = zipStream.toByteArray()
        if (zipBytes.isEmpty()) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "No receipts found for this report")
        }

        val safeTitle = report.title.filter { it.isLetterOrDigit() || it in listOf('-', '_', ' ') }.trim().replace(" ", "_")
        val filename = "receipts_${reportId}_${if (safeTitle.length > 40) safeTitle.take(40) else safeTitle}.zip"

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/zip"))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .body(zipBytes)
    }

    @GetMapping("/export")
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
            if (currentUser.role !in listOf("chef_finance", "mod", "manager")) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
            }
        }

        var reports = if (all && currentUser.role in listOf("chef_finance", "mod", "manager")) {
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

        if (currentUser.role !in listOf("chef_finance", "mod", "manager") && report.user?.id != currentUser.id) {
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
