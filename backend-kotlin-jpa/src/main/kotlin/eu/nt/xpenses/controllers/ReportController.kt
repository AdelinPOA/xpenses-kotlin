package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.report.BulkStatusBody
import eu.nt.xpenses.dto.report.BulkStatusResult
import eu.nt.xpenses.dto.report.ImportOrderIn
import eu.nt.xpenses.dto.report.ImportOrderPreviewOut
import eu.nt.xpenses.dto.report.RejectBody
import eu.nt.xpenses.dto.report.ReportCreate
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.dto.report.ReportSubmit
import eu.nt.xpenses.dto.report.ReportUpdate
import eu.nt.xpenses.model.User
import eu.nt.xpenses.report.ExpenseReports
import eu.nt.xpenses.report.ReportFileDownload
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/reports")
class ReportController(
    private val expenseReports: ExpenseReports,
) {
    private fun requireCurrentUser(request: HttpServletRequest): User =
        request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

    private fun toDownloadResponse(download: ReportFileDownload): ResponseEntity<ByteArray> {
        val headers = HttpHeaders().apply {
            set(HttpHeaders.CONTENT_TYPE, download.contentType)
            contentDisposition = ContentDisposition.attachment().filename(download.filename).build()
        }
        return ResponseEntity(download.bytes, headers, HttpStatus.OK)
    }

    @GetMapping
    fun listReports(
        @RequestParam(value = "status", required = false) status: String?,
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        @RequestParam(value = "user_id", required = false) userId: Int?,
        @RequestParam(value = "page", required = false) page: Int?,
        @RequestParam(value = "size", required = false, defaultValue = "20") size: Int,
        request: HttpServletRequest,
    ): Any =
        expenseReports.listReports(status, all, userId, page, size, requireCurrentUser(request))

    @PostMapping
    fun createReport(
        @Valid @RequestBody body: ReportCreate,
        request: HttpServletRequest,
    ): ResponseEntity<ReportOut> =
        ResponseEntity.status(HttpStatus.CREATED).body(
            expenseReports.createReport(
                body = body,
                idempotencyKeyHeader = request.getHeader("Idempotency-Key"),
                actor = requireCurrentUser(request),
            )
        )

    @PostMapping("/import-order/preview")
    fun previewImportOrder(
        @Valid @RequestBody body: ImportOrderIn,
        request: HttpServletRequest,
    ): ImportOrderPreviewOut =
        expenseReports.previewImportOrder(body.bodyText, requireCurrentUser(request))

    @PostMapping("/import-order")
    fun importOrder(
        @Valid @RequestBody body: ImportOrderIn,
        request: HttpServletRequest,
    ): ResponseEntity<ReportOut> =
        ResponseEntity.status(HttpStatus.CREATED).body(
            expenseReports.importOrder(body.bodyText, requireCurrentUser(request))
        )

    @GetMapping("/{reportId}")
    fun getReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.getReport(reportId, requireCurrentUser(request))

    @PatchMapping("/{reportId}")
    fun updateReport(
        @PathVariable reportId: Int,
        @Valid @RequestBody body: ReportUpdate,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.updateReport(reportId, body, requireCurrentUser(request))

    @DeleteMapping("/{reportId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteReport(
        @PathVariable reportId: Int,
        @RequestParam(value = "delete_expenses", required = false, defaultValue = "false") deleteExpenses: Boolean,
        request: HttpServletRequest,
    ) {
        expenseReports.deleteDraft(reportId, deleteExpenses, requireCurrentUser(request))
    }

    @PostMapping("/{reportId}/attach")
    fun attachExpenses(
        @PathVariable reportId: Int,
        @RequestBody body: ReportSubmit,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.attachExpenses(reportId, body.expenseIds, requireCurrentUser(request))

    @PostMapping("/{reportId}/submit")
    fun submitReport(
        @PathVariable reportId: Int,
        @RequestBody(required = false) body: ReportSubmit?,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.submitReport(reportId, body?.expenseIds, requireCurrentUser(request))

    @PostMapping("/{reportId}/recall")
    fun recallReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.recallReport(reportId, requireCurrentUser(request))

    @PostMapping("/{reportId}/pay")
    fun payReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.payReport(reportId, requireCurrentUser(request))

    @PostMapping("/{reportId}/approve")
    fun approveReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.approveReport(reportId, requireCurrentUser(request))

    @PostMapping("/{reportId}/reject")
    fun rejectReport(
        @PathVariable reportId: Int,
        @Valid @RequestBody(required = false) body: RejectBody?,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.rejectReport(reportId, body?.reason ?: "", requireCurrentUser(request))

    @PostMapping("/bulk-status")
    fun bulkStatus(
        @Valid @RequestBody body: BulkStatusBody,
        request: HttpServletRequest,
    ): BulkStatusResult =
        expenseReports.bulkStatus(body, requireCurrentUser(request))

    @PostMapping("/{reportId}/sign")
    fun signReport(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): ReportOut =
        expenseReports.signReport(reportId, requireCurrentUser(request))

    @GetMapping("/{reportId}/export")
    fun exportReportPdf(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> =
        toDownloadResponse(expenseReports.exportReportPdf(reportId, requireCurrentUser(request)))

    @GetMapping("/{reportId}/receipts-zip")
    fun downloadReceiptsZip(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> =
        toDownloadResponse(expenseReports.downloadReceiptsZip(reportId, requireCurrentUser(request)))

    @GetMapping("/export")
    fun exportReports(
        @RequestParam(value = "format", required = false, defaultValue = "csv") format: String,
        @RequestParam(value = "status", required = false) status: String?,
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        @RequestParam(value = "user_id", required = false) userId: Int?,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> =
        toDownloadResponse(expenseReports.exportReports(format, status, all, userId, requireCurrentUser(request)))

    @GetMapping("/{reportId}/export-csv")
    fun exportReportExpenses(
        @PathVariable reportId: Int,
        @RequestParam(value = "format", required = false, defaultValue = "csv") format: String,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> =
        toDownloadResponse(expenseReports.exportReportExpenses(reportId, format, requireCurrentUser(request)))
}
