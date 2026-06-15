package eu.nt.xpenses.services

import org.apache.poi.ss.usermodel.FillPatternType
import org.apache.poi.ss.usermodel.IndexedColors
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.springframework.stereotype.Service
import java.io.ByteArrayOutputStream
import java.io.StringWriter
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

@Service
class ExportService {

    private val isoDate = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    private val isoDateTime = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'")

    fun buildCsv(rows: List<Map<String, Any?>>, columns: List<String>): ByteArray {
        val writer = StringWriter()
        writer.appendLine(columns.joinToString(",") { quoteField(it) })
        for (row in rows) {
            writer.appendLine(columns.joinToString(",") { col -> quoteField(formatValue(row[col])) })
        }
        return writer.toString().toByteArray(Charsets.UTF_8)
    }

    fun buildXlsx(rows: List<Map<String, Any?>>, columns: List<String>): ByteArray {
        val workbook = XSSFWorkbook()
        val sheet = workbook.createSheet("Export")

        val headerStyle = workbook.createCellStyle().apply {
            fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
            fillPattern = FillPatternType.SOLID_FOREGROUND
            val font = workbook.createFont().apply { bold = true }
            setFont(font)
        }
        val numberStyle = workbook.createCellStyle().apply {
            dataFormat = workbook.createDataFormat().getFormat("0.00")
        }
        val dateStyle = workbook.createCellStyle().apply {
            dataFormat = workbook.createDataFormat().getFormat("yyyy-mm-dd")
        }

        val headerRow = sheet.createRow(0)
        columns.forEachIndexed { i, col ->
            headerRow.createCell(i).apply {
                setCellValue(col)
                cellStyle = headerStyle
            }
        }

        rows.forEachIndexed { rowIdx, row ->
            val dataRow = sheet.createRow(rowIdx + 1)
            columns.forEachIndexed { colIdx, col ->
                val cell = dataRow.createCell(colIdx)
                when (val v = row[col]) {
                    null -> cell.setCellValue("")
                    is Number -> {
                        cell.setCellValue(v.toDouble())
                        cell.cellStyle = numberStyle
                    }
                    is LocalDate -> {
                        cell.setCellValue(v.format(isoDate))
                        cell.cellStyle = dateStyle
                    }
                    is LocalDateTime -> cell.setCellValue(v.format(isoDateTime))
                    is Boolean -> cell.setCellValue(v)
                    else -> cell.setCellValue(v.toString())
                }
            }
        }

        sheet.setAutoFilter(org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, columns.size - 1))
        columns.indices.forEach { sheet.autoSizeColumn(it) }

        return ByteArrayOutputStream().also { workbook.write(it); workbook.close() }.toByteArray()
    }

    private fun formatValue(v: Any?): String = when (v) {
        null -> ""
        is LocalDate -> v.format(isoDate)
        is LocalDateTime -> v.format(isoDateTime)
        is Double -> "%.2f".format(v)
        is Float -> "%.2f".format(v)
        else -> v.toString()
    }

    private fun quoteField(s: String): String {
        val escaped = s.replace("\"", "\"\"")
        return if (escaped.contains(',') || escaped.contains('"') || escaped.contains('\n')) "\"$escaped\"" else escaped
    }
}
