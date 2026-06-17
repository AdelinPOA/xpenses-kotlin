package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.EmailSettingsService
import eu.nt.xpenses.services.ExpenseMapper
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.PdfService
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
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
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
    private val emailSettingsService: EmailSettingsService,
    private val pdfService: PdfService,
    private val storageService: StorageService,
    private val exportService: ExportService,
    private val expenseMapper: ExpenseMapper,
    private val appSettingRepository: AppSettingRepository
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

        return if (page != null) {
            val total = reports.size
            val fromIndex = page * size
            val toIndex = minOf(fromIndex + size, total)
            val pageContent = if (fromIndex < total) reports.subList(fromIndex, toIndex) else emptyList()
            eu.nt.xpenses.models.PagedResponse(
                data = pageContent.map { mapReportToOut(it) },
                page = page,
                size = size,
                totalElements = total.toLong(),
                totalPages = if (size > 0) (total + size - 1) / size else 1
            )
        } else {
            reports.map { mapReportToOut(it) }
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
        return ResponseEntity.status(HttpStatus.CREATED).body(mapReportToOut(saved))
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

        return mapReportToOut(report)
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
        return mapReportToOut(saved)
    }

    @Transactional
    @DeleteMapping("/{reportId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteReport(
        @PathVariable reportId: Int,
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

        // Detach all expenses and reset to draft status
        val now = Instant.now()
        for (expense in report.expenses) {
            expense.report = null
            expense.status = "draft"
            expense.updatedAt = now
            expenseRepository.save(expense)
        }

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

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can modify report expenses")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft reports can be modified")
        }
        if (body.expenseIds.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one expense is required")
        }

        val expenses = expenseRepository.findAllById(body.expenseIds)
        val valid = expenses.filter { it.status == "draft" && it.user?.id == currentUser.id }
        
        val invalid = body.expenseIds.toSet() - valid.map { it.id!! }.toSet()
        if (invalid.isNotEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid, non-draft, or not-owned expense IDs: $invalid")
        }

        val now = Instant.now()
        for (exp in valid) {
            exp.report = report
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        report.updatedAt = now
        val saved = expenseReportRepository.save(report)
        return mapReportToOut(saved)
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

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can submit a report")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Report is not in draft status")
        }

        val now = Instant.now()

        // Attach first if IDs provided
        if (body != null && body.expenseIds.isNotEmpty()) {
            val expenses = expenseRepository.findAllById(body.expenseIds)
            val valid = expenses.filter { it.status == "draft" && it.user?.id == currentUser.id }
            for (exp in valid) {
                exp.report = report
                exp.updatedAt = now
                expenseRepository.save(exp)
            }
        }

        // Refresh report reference
        val updatedReport = expenseReportRepository.findById(reportId).get()
        if (updatedReport.expenses.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No expenses attached to this report")
        }

        // Set all expenses to submitted
        for (exp in updatedReport.expenses) {
            exp.status = "submitted"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val totalAmount = updatedReport.expenses.sumOf { it.amountEur }
        updatedReport.status = "submitted"
        updatedReport.submittedAt = now
        updatedReport.totalAmount = totalAmount
        updatedReport.updatedAt = now

        val saved = expenseReportRepository.save(updatedReport)

        // Notify managers and CFOs
        val approvers = userRepository.findAll().filter {
            it.role in listOf("manager", "chef_finance") && it.isActive
        }
        val subject = "New expense report submitted: ${saved.title}"
        val content = "${currentUser.displayName} has submitted a new expense report: ${saved.title}.\nTotal: ${String.format("%.2f", totalAmount)} ${saved.currency}."
        
        for (appr in approvers) {
            if (!appr.email.isNullOrEmpty() && appr.notificationsEnabled) {
                emailSettingsService.sendEmail(appr.email!!, subject, content)
            }
        }

        return mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/recall")
    fun recallReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can recall a report")
        }
        if (report.status != "submitted") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted reports can be recalled")
        }

        val now = Instant.now()
        report.status = "draft"
        report.submittedAt = null
        report.updatedAt = now

        for (exp in report.expenses) {
            exp.status = "draft"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val saved = expenseReportRepository.save(report)
        return mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/pay")
    fun payReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (currentUser.role != "chef_finance" && currentUser.role != "mod") {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only chef_finance or mod can perform payment")
        }

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.status != "approved") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only approved reports can be marked as paid")
        }

        val now = Instant.now()
        report.status = "paid"
        report.paidAt = now
        report.updatedAt = now

        for (exp in report.expenses) {
            exp.status = "paid"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val saved = expenseReportRepository.save(report)

        // Notify report owner
        val owner = saved.user
        if (owner != null && !owner.email.isNullOrEmpty() && owner.notificationsEnabled) {
            val subject = "Expense report paid: ${saved.title}"
            val content = "Your expense report \"${saved.title}\" has been marked as paid."
            emailSettingsService.sendEmail(owner.email!!, subject, content)
        }

        return mapReportToOut(saved)
    }

    @Transactional
    @PostMapping("/{reportId}/approve")
    fun approveReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ReportOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (currentUser.role !in listOf("manager", "chef_finance")) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.status != "submitted") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted reports can be approved")
        }
        if (report.user?.id == currentUser.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot approve your own report")
        }

        val now = Instant.now()
        report.status = "approved"
        report.approvedBy = currentUser
        report.approvedAt = now
        report.updatedAt = now

        for (exp in report.expenses) {
            exp.status = "approved"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val saved = expenseReportRepository.save(report)

        // Notify owner
        val owner = saved.user
        if (owner != null && !owner.email.isNullOrEmpty() && owner.notificationsEnabled) {
            val subject = "Expense report approved: ${saved.title}"
            val content = "Your expense report \"${saved.title}\" has been approved by ${currentUser.displayName}."
            emailSettingsService.sendEmail(owner.email!!, subject, content)
        }

        return mapReportToOut(saved)
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

        if (currentUser.role !in listOf("manager", "chef_finance")) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.status != "submitted") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted reports can be rejected")
        }
        if (report.user?.id == currentUser.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot reject your own report")
        }

        val reason = body?.reason ?: ""
        val now = Instant.now()
        
        report.status = "rejected"
        report.totalAmount = 0.0
        report.rejectedBy = currentUser
        report.rejectedAt = now
        report.rejectedReason = reason
        report.updatedAt = now

        // Keep expenses attached to report but set back to draft
        for (exp in report.expenses) {
            exp.status = "draft"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val saved = expenseReportRepository.save(report)

        // Notify owner
        val owner = saved.user
        if (owner != null && !owner.email.isNullOrEmpty() && owner.notificationsEnabled) {
            val subject = "Expense report rejected: ${saved.title}"
            val content = "Your expense report \"${saved.title}\" has been rejected by ${currentUser.displayName}.\nReason: $reason."
            emailSettingsService.sendEmail(owner.email!!, subject, content)
        }

        return mapReportToOut(saved)
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

        // Only allow signing on submitted or approved reports
        if (report.status !in listOf("submitted", "approved")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted or approved reports can be signed")
        }

        val now = Instant.now()
        report.signer = currentUser
        report.signedAt = now
        report.updatedAt = now

        val saved = expenseReportRepository.save(report)
        return mapReportToOut(saved)
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
                        // ignore missing/corrupt files
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

    private fun mapAdvanceToOut(adv: AdvancePayment): AdvancePaymentOut {
        return AdvancePaymentOut(
            id = adv.id!!,
            reportId = adv.report.id!!,
            userId = adv.user.id!!,
            status = adv.status,
            amountOriginal = adv.amountOriginal,
            currencyOriginal = adv.currencyOriginal,
            amountEur = adv.amountEur,
            fxRate = adv.fxRate,
            date = adv.date,
            description = adv.description,
            requestedAmount = adv.requestedAmount,
            requestedCurrency = adv.requestedCurrency,
            paidBy = adv.paidBy?.id,
            paidByName = adv.paidBy?.displayName,
            paidAt = adv.paidAt,
            rejectedBy = adv.rejectedBy?.id,
            rejectedByName = adv.rejectedBy?.displayName,
            rejectedAt = adv.rejectedAt,
            createdAt = adv.createdAt,
            updatedAt = adv.updatedAt
        )
    }

    private fun mapRecordToOut(m: MileageRecord): MileageRecordOut {
        val durationMins = Duration.between(m.startTime, m.endTime).toMillis() / 60000.0
        return MileageRecordOut(
            id = m.id!!,
            reportId = m.report.id!!,
            userId = m.user.id!!,
            origin = m.origin,
            destination = m.destination,
            distanceKm = m.distanceKm,
            rateBeforeTax = m.rateBeforeTax,
            rateAfterTax = m.rateAfterTax,
            amountBeforeTax = m.amountBeforeTax,
            amountEur = m.amountEur,
            startTime = m.startTime,
            endTime = m.endTime,
            description = m.description,
            createdAt = m.createdAt,
            updatedAt = m.updatedAt,
            durationMinutes = durationMins
        )
    }

    private fun getDailyAllowanceRate(): Double =
        appSettingRepository.findById("daily_allowance_rate").orElse(null)?.value?.toDoubleOrNull() ?: 50.0

    private fun calculateDailyAllowance(dateFrom: String?, dateTo: String?): Double {
        if (dateFrom.isNullOrEmpty() || dateTo.isNullOrEmpty()) return 0.0
        return try {
            val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
            val dFrom = java.time.LocalDate.parse(dateFrom.take(10), formatter)
            val dTo = java.time.LocalDate.parse(dateTo.take(10), formatter)
            val days = Duration.between(dFrom.atStartOfDay(), dTo.atStartOfDay()).toDays() + 1
            if (days > 0) days * getDailyAllowanceRate() else 0.0
        } catch (e: Exception) {
            0.0
        }
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
            if (userId != null) expenseReportRepository.findAllByUserIdWithExpenses(userId)
            else expenseReportRepository.findAllWithExpenses()
        } else {
            val targetUid = userId ?: currentUser.id!!
            expenseReportRepository.findAllByUserIdWithExpenses(targetUid)
        }

        if (status != null) reports = reports.filter { it.status == status }
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
                put("currency", r.currency ?: "EUR")
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
                put("tax_amount", e.taxAmount.toDouble())
                put("tax_rate", e.taxRate?.toDouble() ?: "")
                put("tax_amount_eur", e.taxAmountEur.toDouble())
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

    private fun mapReportToOut(report: ExpenseReport): ReportOut {
        val expensesOut = report.expenses.sortedBy { it.date }.map { expenseMapper.toExpenseOut(it) }
        val advancesOut = report.advances.sortedBy { it.date }.map { mapAdvanceToOut(it) }
        val mileageOut = report.mileageRecords.sortedBy { it.startTime }.map { mapRecordToOut(it) }

        val totalExpenses = expensesOut.sumOf { it.amountEur }
        val totalAdvances = advancesOut.filter { it.status == "paid" }.sumOf { it.amountEur }
        val totalMileage = mileageOut.sumOf { it.amountEur }
        val allowance = calculateDailyAllowance(report.dateFrom, report.dateTo)
        val totalReimbursable = totalExpenses + allowance + totalMileage - totalAdvances

        return ReportOut(
            id = report.id!!,
            userId = report.user?.id,
            userDisplayName = report.user?.displayName,
            title = report.title,
            description = report.description,
            dateFrom = report.dateFrom,
            dateTo = report.dateTo,
            status = report.status,
            submittedAt = report.submittedAt,
            paidAt = report.paidAt,
            approvedBy = report.approvedBy?.id,
            approvedAt = report.approvedAt,
            rejectedBy = report.rejectedBy?.id,
            rejectedAt = report.rejectedAt,
            rejectedReason = report.rejectedReason,
            signerId = report.signer?.id,
            signedAt = report.signedAt,
            totalAmount = report.totalAmount,
            currency = report.currency,
            createdAt = report.createdAt,
            updatedAt = report.updatedAt,
            expenses = expensesOut,
            advances = advancesOut,
            totalAdvances = totalAdvances,
            mileageRecords = mileageOut,
            totalMileageEur = totalMileage,
            dailyAllowance = allowance,
            totalReimbursable = totalReimbursable,
            kundenauftrag = report.kundenauftrag,
            auftragsart = report.auftragsart,
            positionstyp = report.positionstyp,
            technplatzRaw = report.technplatzRaw,
            technplatzLine = report.technplatzLine,
            kundeCode = report.kundeCode,
            kundeName = report.kundeName,
            adresse = report.adresse,
            vorgang = report.vorgang,
            arbeitsplatz = report.arbeitsplatz,
            techniker = report.techniker
        )
    }
}

data class RejectBody(
    val reason: String = ""
)

data class ReportCreate(
    @field:NotBlank val title: String,
    @field:Size(max = 1000) val description: String? = null,
    @JsonProperty("date_from") val dateFrom: String? = null,
    @JsonProperty("date_to") val dateTo: String? = null,
    val currency: String = "EUR"
)

data class ReportUpdate(
    val title: String? = null,
    @field:Size(max = 1000) val description: String? = null,
    @JsonProperty("date_from") val dateFrom: String? = null,
    @JsonProperty("date_to") val dateTo: String? = null,
    val currency: String? = null,
    val kundenauftrag: String? = null,
    val auftragsart: String? = null,
    val positionstyp: String? = null,
    @JsonProperty("technplatz_raw") val technplatzRaw: String? = null,
    @JsonProperty("kunde_code") val kundeCode: String? = null,
    @JsonProperty("kunde_name") val kundeName: String? = null,
    val adresse: String? = null,
    val vorgang: String? = null,
    val arbeitsplatz: String? = null,
    val techniker: String? = null
)

data class ReportSubmit(
    @JsonProperty("expense_ids") val expenseIds: List<Int> = emptyList()
)

data class ReportOut(
    val id: Int,
    @JsonProperty("user_id") val userId: Int?,
    @JsonProperty("user_display_name") val userDisplayName: String?,
    val title: String,
    val description: String?,
    @JsonProperty("date_from") val dateFrom: String?,
    @JsonProperty("date_to") val dateTo: String?,
    val status: String,
    @JsonProperty("submitted_at") val submittedAt: Instant?,
    @JsonProperty("paid_at") val paidAt: Instant?,
    @JsonProperty("approved_by") val approvedBy: Int?,
    @JsonProperty("approved_at") val approvedAt: Instant?,
    @JsonProperty("rejected_by") val rejectedBy: Int?,
    @JsonProperty("rejected_at") val rejectedAt: Instant?,
    @JsonProperty("rejected_reason") val rejectedReason: String?,
    @JsonProperty("signer_id") val signerId: Int?,
    @JsonProperty("signed_at") val signedAt: Instant?,
    @JsonProperty("total_amount") val totalAmount: Double,
    val currency: String,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant,
    val expenses: List<ExpenseOut> = emptyList(),
    val advances: List<AdvancePaymentOut> = emptyList(),
    @JsonProperty("total_advances") val totalAdvances: Double = 0.0,
    @JsonProperty("mileage_records") val mileageRecords: List<MileageRecordOut> = emptyList(),
    @JsonProperty("total_mileage_eur") val totalMileageEur: Double = 0.0,
    @JsonProperty("daily_allowance") val dailyAllowance: Double = 0.0,
    @JsonProperty("total_reimbursable") val totalReimbursable: Double = 0.0,
    // Delegation email import fields
    val kundenauftrag: String? = null,
    val auftragsart: String? = null,
    val positionstyp: String? = null,
    @JsonProperty("technplatz_raw") val technplatzRaw: String? = null,
    @JsonProperty("technplatz_line") val technplatzLine: Boolean = false,
    @JsonProperty("kunde_code") val kundeCode: String? = null,
    @JsonProperty("kunde_name") val kundeName: String? = null,
    val adresse: String? = null,
    val vorgang: String? = null,
    val arbeitsplatz: String? = null,
    val techniker: String? = null
)
