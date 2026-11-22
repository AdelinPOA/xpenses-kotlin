package eu.nt.xpenses.report

import eu.nt.xpenses.model.AdvancePayment
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.MileageRecord
import eu.nt.xpenses.model.User
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.PdfService
import eu.nt.xpenses.services.StorageService
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.io.ByteArrayOutputStream
import java.time.LocalDate
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

data class ReportFileDownload(
    val filename: String,
    val contentType: String,
    val bytes: ByteArray,
)

internal data class ReceiptZipEntry(
    val filePath: String,
    val date: String,
    val namePart: String,
)

internal class ReportExporter(
    private val pdfService: PdfService,
    private val storageService: StorageService,
    private val exportService: ExportService,
) {
    private val log = LoggerFactory.getLogger(ReportExporter::class.java)

    fun validateTableFormat(format: String) {
        if (format !in listOf("csv", "xlsx")) {
            throw ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Unsupported format '$format'. Use 'csv' or 'xlsx'.",
            )
        }
    }

    fun buildPdfDownload(
        report: ExpenseReport,
        expenses: List<Expense>,
        advances: List<AdvancePayment>,
        mileage: List<MileageRecord>,
        signer: User?,
        totals: ReportTotals,
    ): ReportFileDownload {
        val pdfBytes = pdfService.generateReportPdf(
            report = report,
            expenses = expenses,
            advances = advances,
            mileage = mileage,
            signer = signer,
            totals = totals,
        )
        val filename = "report_${report.id}_${safeTitle(report.title)}.pdf"
        return ReportFileDownload(
            filename = filename,
            contentType = "application/pdf",
            bytes = pdfBytes,
        )
    }

    fun buildReceiptsZipDownload(
        reportId: Int,
        reportTitle: String,
        entries: List<ReceiptZipEntry>,
    ): ReportFileDownload {
        val zipStream = ByteArrayOutputStream()
        var addedCount = 0

        ZipOutputStream(zipStream).use { zos ->
            val seen = mutableMapOf<String, Int>()
            for (entry in entries) {
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

                    zos.putNextEntry(ZipEntry(arcName))
                    zos.write(bytes)
                    zos.closeEntry()
                    addedCount++
                } catch (e: Exception) {
                    log.warn("Failed to add receipt '{}' to zip for report {}: {}", entry.filePath, reportId, e.message)
                }
            }
        }

        if (addedCount == 0) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "No receipts found for this report")
        }

        val zipBytes = zipStream.toByteArray()
        val filename = "receipts_${reportId}_${safeTitle(reportTitle)}.zip"
        return ReportFileDownload(
            filename = filename,
            contentType = "application/zip",
            bytes = zipBytes,
        )
    }

    fun buildReportsTableDownload(rows: List<Map<String, Any?>>, format: String): ReportFileDownload {
        val columns = listOf(
            "id", "title", "status", "date_from", "date_to", "total_amount", "currency",
            "submitted_at", "approved_at", "paid_at", "user",
        )
        return buildTableDownload(rows, columns, format, "reports_${LocalDate.now()}")
    }

    fun buildReportExpensesTableDownload(
        reportId: Int,
        rows: List<Map<String, Any?>>,
        format: String,
    ): ReportFileDownload {
        val columns = listOf(
            "id", "date", "merchant", "description", "category",
            "amount_original", "currency", "amount_eur", "fx_rate",
            "tax_amount", "tax_rate", "tax_amount_eur", "status", "report_id",
        )
        return buildTableDownload(rows, columns, format, "report_${reportId}_expenses_${LocalDate.now()}")
    }

    private fun buildTableDownload(
        rows: List<Map<String, Any?>>,
        columns: List<String>,
        format: String,
        filenameBase: String,
    ): ReportFileDownload {
        val (bytes, contentType, ext) = when (format) {
            "xlsx" -> Triple(
                exportService.buildXlsx(rows, columns),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "xlsx",
            )
            else -> Triple(exportService.buildCsv(rows, columns), "text/csv", "csv")
        }
        return ReportFileDownload(
            filename = "$filenameBase.$ext",
            contentType = contentType,
            bytes = bytes,
        )
    }

    private fun safeTitle(title: String): String {
        val cleaned = title.filter { it.isLetterOrDigit() || it in listOf('-', '_', ' ') }.trim().replace(" ", "_")
        return if (cleaned.length > 40) cleaned.take(40) else cleaned
    }
}
