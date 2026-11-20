package eu.nt.xpenses.services

import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.MileageRecord
import org.apache.poi.ss.usermodel.BorderStyle
import org.apache.poi.ss.usermodel.FillPatternType
import org.apache.poi.ss.usermodel.HorizontalAlignment
import org.apache.poi.ss.usermodel.IndexedColors
import org.apache.poi.ss.usermodel.PrintSetup
import org.apache.poi.ss.usermodel.VerticalAlignment
import org.apache.poi.ss.util.CellRangeAddress
import org.apache.poi.xssf.usermodel.XSSFCellStyle
import org.apache.poi.xssf.usermodel.XSSFSheet
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Service
class TripSheetExportService(
    @Value("\${company.name:Newtech Automation}")
    private val companyName: String = "Newtech Automation"
) {

    companion object {
        private val BUCHAREST_ZONE: ZoneId = ZoneId.of("Europe/Bucharest")
        private val TIME_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
        private val DATE_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")

        private val ROMANIAN_MONTHS = arrayOf(
            "Ianuarie",
            "Februarie",
            "Martie",
            "Aprilie",
            "Mai",
            "Iunie",
            "Iulie",
            "August",
            "Septembrie",
            "Octombrie",
            "Noiembrie",
            "Decembrie"
        )

        private val INVALID_SHEET_CHARS = Regex("[:\\\\/?*\\[\\]]")
        private val FORMULA_INJECTION_CHARS = charArrayOf('=', '+', '-', '@', '\t', '\r')
        private val COLUMN_WIDTHS_CHARS = intArrayOf(8, 8, 12, 8, 12, 25, 22, 26, 13, 14, 14, 16)
    }

    private data class SheetGroupKey(
        val vehicleKey: String,
        val yearMonth: YearMonth
    )

    private class WorkbookStyles(workbook: XSSFWorkbook) {
        private val dataFormat = workbook.createDataFormat()

        val companyHeader: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.LEFT
            verticalAlignment = VerticalAlignment.CENTER
            setFont(workbook.createFont().apply {
                bold = true
                fontHeightInPoints = 12
            })
        }

        val reportSubtitle: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.LEFT
            verticalAlignment = VerticalAlignment.CENTER
            setFont(workbook.createFont().apply {
                italic = true
                fontHeightInPoints = 10
                color = IndexedColors.GREY_50_PERCENT.index
            })
        }

        val sheetTitle: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            setFont(workbook.createFont().apply {
                bold = true
                fontHeightInPoints = 14
            })
        }

        val metaLabel: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.LEFT
            verticalAlignment = VerticalAlignment.CENTER
            setFont(workbook.createFont().apply { bold = true })
        }

        val metaValue: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.LEFT
            verticalAlignment = VerticalAlignment.CENTER
        }

        val metaNumber: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.RIGHT
            verticalAlignment = VerticalAlignment.CENTER
            dataFormat = this@WorkbookStyles.dataFormat.getFormat("#,##0.0")
            setFont(workbook.createFont().apply { bold = true })
        }

        val tableHeader: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            wrapText = true
            fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
            fillPattern = FillPatternType.SOLID_FOREGROUND
            applyThinBorders(this)
            setFont(workbook.createFont().apply { bold = true })
        }

        val dataCenter: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            applyThinBorders(this)
        }

        val dataLeft: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.LEFT
            verticalAlignment = VerticalAlignment.CENTER
            wrapText = true
            applyThinBorders(this)
        }

        val dataInt: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            dataFormat = this@WorkbookStyles.dataFormat.getFormat("0")
            applyThinBorders(this)
        }

        val dataOdometer: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.RIGHT
            verticalAlignment = VerticalAlignment.CENTER
            dataFormat = this@WorkbookStyles.dataFormat.getFormat("#,##0.0")
            applyThinBorders(this)
        }

        val dataDistance: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.RIGHT
            verticalAlignment = VerticalAlignment.CENTER
            dataFormat = this@WorkbookStyles.dataFormat.getFormat("0.0")
            applyThinBorders(this)
        }

        val totalLabel: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.LEFT
            verticalAlignment = VerticalAlignment.CENTER
            applyThinBorders(this)
            setFont(workbook.createFont().apply { bold = true })
        }

        val totalOdometer: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.RIGHT
            verticalAlignment = VerticalAlignment.CENTER
            dataFormat = this@WorkbookStyles.dataFormat.getFormat("#,##0.0")
            applyThinBorders(this)
            setFont(workbook.createFont().apply { bold = true })
        }

        val totalDistance: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.RIGHT
            verticalAlignment = VerticalAlignment.CENTER
            dataFormat = this@WorkbookStyles.dataFormat.getFormat("0.0")
            applyThinBorders(this)
            setFont(workbook.createFont().apply { bold = true })
        }

        val totalBlank: XSSFCellStyle = workbook.createCellStyle().apply {
            applyThinBorders(this)
        }

        val signatureBold: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.LEFT
            verticalAlignment = VerticalAlignment.CENTER
            setFont(workbook.createFont().apply { bold = true })
        }

        val signatureLine: XSSFCellStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.LEFT
            verticalAlignment = VerticalAlignment.CENTER
        }

        private fun applyThinBorders(style: XSSFCellStyle) {
            style.borderTop = BorderStyle.THIN
            style.borderBottom = BorderStyle.THIN
            style.borderLeft = BorderStyle.THIN
            style.borderRight = BorderStyle.THIN
        }
    }

    fun buildTripSheet(report: ExpenseReport, records: List<MileageRecord>): ByteArray {
        require(records.isNotEmpty()) { "Report has no mileage records" }

        val sorted = records.sortedWith(compareBy<MileageRecord>({ it.startTime }, { it.id ?: Int.MAX_VALUE }))
        val primaryVehicleKey = vehicleGroupKey(sorted.first())

        val grouped: Map<SheetGroupKey, List<MileageRecord>> = sorted.groupBy { rec ->
            val ym = YearMonth.from(rec.startTime.atZone(BUCHAREST_ZONE))
            SheetGroupKey(vehicleGroupKey(rec), ym)
        }

        val distinctVehicles = grouped.keys.map { it.vehicleKey }.distinct()
        val distinctYears = grouped.keys.map { it.yearMonth.year }.distinct()
        val multiVehicle = distinctVehicles.size > 1
        val multiYear = distinctYears.size > 1

        var runningOdometer: BigDecimal? = report.startingOdometerKm
        val usedSheetNames = mutableSetOf<String>()

        return XSSFWorkbook().use { workbook ->
            val styles = WorkbookStyles(workbook)

            for ((groupKey, groupRecords) in grouped) {
                val monthName = romanianMonth(groupKey.yearMonth.monthValue)
                val monthLabel = if (multiYear) "$monthName ${groupKey.yearMonth.year}" else monthName
                val rawSheetName = if (multiVehicle) "$monthLabel - ${groupKey.vehicleKey}" else monthLabel
                val safeSheetName = uniqueSafeSheetName(rawSheetName, usedSheetNames)

                val sheetStartOdometer: BigDecimal? =
                    if (groupKey.vehicleKey == primaryVehicleKey && runningOdometer != null) {
                        val current = runningOdometer
                        val groupDistance = groupRecords.fold(BigDecimal.ZERO) { acc, r ->
                            acc.add(BigDecimal.valueOf(r.distanceKm))
                        }
                        runningOdometer = current.add(groupDistance)
                        current
                    } else {
                        null
                    }

                val sheet = workbook.createSheet(safeSheetName)
                populateSheet(
                    sheet = sheet,
                    styles = styles,
                    report = report,
                    monthName = monthName,
                    groupRecords = groupRecords,
                    startOdometer = sheetStartOdometer
                )
            }

            ByteArrayOutputStream().use { out ->
                workbook.write(out)
                out.toByteArray()
            }
        }
    }

    private fun populateSheet(
        sheet: XSSFSheet,
        styles: WorkbookStyles,
        report: ExpenseReport,
        monthName: String,
        groupRecords: List<MileageRecord>,
        startOdometer: BigDecimal?
    ) {
        val firstRecord = groupRecords.first()
        val driverName = report.user?.displayName ?: firstRecord.user.displayName
        val vehicleMakeModel = groupRecords.firstNotNullOfOrNull { it.vehicleMakeModel?.trim()?.takeIf(String::isNotEmpty) }
        val vehiclePlate = groupRecords.firstNotNullOfOrNull { it.vehiclePlate?.trim()?.takeIf(String::isNotEmpty) }
        val vehicleCategory = groupRecords.firstNotNullOfOrNull { it.vehicleCategory?.trim()?.takeIf(String::isNotEmpty) } ?: "M1"
        val vehicleFuelType = groupRecords.firstNotNullOfOrNull { it.vehicleFuelType?.trim()?.takeIf(String::isNotEmpty) }
        val lastDataExcelRow = 11 + groupRecords.size

        // Row 1 (idx 0): Company name
        val row1 = sheet.createRow(0)
        row1.createCell(0).apply {
            setCellValue(sanitizeCellText(companyName))
            cellStyle = styles.companyHeader
        }
        sheet.addMergedRegion(CellRangeAddress(0, 0, 0, 11))

        // Row 2 (idx 1): Report title + optional kundenauftrag
        val row2 = sheet.createRow(1)
        val subtitle = buildString {
            append("Raport: ")
            append(report.title)
            if (!report.kundenauftrag.isNullOrBlank()) {
                append(" · ")
                append(report.kundenauftrag)
            }
        }
        row2.createCell(0).apply {
            setCellValue(sanitizeCellText(subtitle))
            cellStyle = styles.reportSubtitle
        }
        sheet.addMergedRegion(CellRangeAddress(1, 1, 0, 11))

        // Row 3 (idx 2): Blank spacer
        sheet.createRow(2)

        // Row 4 (idx 3): Sheet title
        val row4 = sheet.createRow(3)
        row4.heightInPoints = 22f
        row4.createCell(0).apply {
            setCellValue("Foaie de parcurs pentru autovehicule")
            cellStyle = styles.sheetTitle
        }
        sheet.addMergedRegion(CellRangeAddress(3, 3, 0, 11))

        // Row 5 (idx 4): Luna | Auto | Kilometraj la plecare
        val row5 = sheet.createRow(4)
        row5.createCell(0).apply {
            setCellValue("Luna")
            cellStyle = styles.metaLabel
        }
        sheet.addMergedRegion(CellRangeAddress(4, 4, 0, 1))
        row5.createCell(2).apply {
            setCellValue(monthName.uppercase(Locale.ROOT))
            cellStyle = styles.metaValue
        }
        sheet.addMergedRegion(CellRangeAddress(4, 4, 2, 4))
        row5.createCell(5).apply {
            setCellValue("Auto")
            cellStyle = styles.metaLabel
        }
        row5.createCell(6).apply {
            setCellValue(formatVehicleDisplay(vehicleMakeModel, vehiclePlate))
            cellStyle = styles.metaValue
        }
        sheet.addMergedRegion(CellRangeAddress(4, 4, 6, 7))
        row5.createCell(8).apply {
            setCellValue("Kilometraj la plecare")
            cellStyle = styles.metaLabel
        }
        sheet.addMergedRegion(CellRangeAddress(4, 4, 8, 10))
        row5.createCell(11).apply {
            if (startOdometer != null) {
                setCellValue(startOdometer.toDouble())
            }
            cellStyle = styles.metaNumber
        }

        // Row 6 (idx 5): Șofer | Categorie auto | Kilometraj la sosire
        val row6 = sheet.createRow(5)
        row6.createCell(0).apply {
            setCellValue("Șofer")
            cellStyle = styles.metaLabel
        }
        sheet.addMergedRegion(CellRangeAddress(5, 5, 0, 1))
        row6.createCell(2).apply {
            setCellValue(sanitizeCellText(driverName))
            cellStyle = styles.metaValue
        }
        sheet.addMergedRegion(CellRangeAddress(5, 5, 2, 4))
        row6.createCell(5).apply {
            setCellValue("Categorie auto")
            cellStyle = styles.metaLabel
        }
        row6.createCell(6).apply {
            setCellValue(sanitizeCellText(vehicleCategory))
            cellStyle = styles.metaValue
        }
        sheet.addMergedRegion(CellRangeAddress(5, 5, 6, 7))
        row6.createCell(8).apply {
            setCellValue("Kilometraj la sosire")
            cellStyle = styles.metaLabel
        }
        sheet.addMergedRegion(CellRangeAddress(5, 5, 8, 10))
        row6.createCell(11).apply {
            if (startOdometer != null) {
                cellFormula = "L5+L7"
            }
            cellStyle = styles.metaNumber
        }

        // Row 7 (idx 6): Tip combustibil | Total kilometri
        val row7 = sheet.createRow(6)
        row7.createCell(5).apply {
            setCellValue("Tip combustibil")
            cellStyle = styles.metaLabel
        }
        row7.createCell(6).apply {
            setCellValue(fuelTypeLabel(vehicleFuelType))
            cellStyle = styles.metaValue
        }
        sheet.addMergedRegion(CellRangeAddress(6, 6, 6, 7))
        row7.createCell(8).apply {
            setCellValue("Total kilometri")
            cellStyle = styles.metaLabel
        }
        sheet.addMergedRegion(CellRangeAddress(6, 6, 8, 10))
        row7.createCell(11).apply {
            cellFormula = "SUM(L12:L$lastDataExcelRow)"
            cellStyle = styles.metaNumber
        }

        // Row 8 (idx 7): Norma proprie de consum
        val row8 = sheet.createRow(7)
        row8.createCell(5).apply {
            setCellValue("Norma proprie de consum")
            cellStyle = styles.metaLabel
        }
        row8.createCell(6).apply {
            setCellValue(formatFuelConsumption(firstRecord.fuelConsumptionLitersPer100Km))
            cellStyle = styles.metaValue
        }
        sheet.addMergedRegion(CellRangeAddress(7, 7, 6, 7))

        // Row 9 (idx 8): Blank spacer
        sheet.createRow(8)

        // Rows 10-11 (idx 9-10): 2-row merged table header
        val headerRow1 = sheet.createRow(9)
        val headerRow2 = sheet.createRow(10)
        for (col in 0..11) {
            headerRow1.createCell(col).cellStyle = styles.tableHeader
            headerRow2.createCell(col).cellStyle = styles.tableHeader
        }
        headerRow1.getCell(0).setCellValue("Nr. Crt.")
        headerRow1.getCell(1).setCellValue("La plecare")
        headerRow1.getCell(3).setCellValue("La sosire")
        headerRow1.getCell(5).setCellValue("Ruta")
        headerRow1.getCell(9).setCellValue("Kilometraj")

        headerRow2.getCell(1).setCellValue("Ora")
        headerRow2.getCell(2).setCellValue("Data")
        headerRow2.getCell(3).setCellValue("Ora")
        headerRow2.getCell(4).setCellValue("Data")
        headerRow2.getCell(5).setCellValue("Plecat de la")
        headerRow2.getCell(6).setCellValue("Sosit la")
        headerRow2.getCell(7).setCellValue("Scop")
        headerRow2.getCell(8).setCellValue("Dus / Întors")
        headerRow2.getCell(9).setCellValue("La plecare")
        headerRow2.getCell(10).setCellValue("La sosire")
        headerRow2.getCell(11).setCellValue("Nr. Km. parcurși")

        sheet.addMergedRegion(CellRangeAddress(9, 10, 0, 0))
        sheet.addMergedRegion(CellRangeAddress(9, 9, 1, 2))
        sheet.addMergedRegion(CellRangeAddress(9, 9, 3, 4))
        sheet.addMergedRegion(CellRangeAddress(9, 9, 5, 8))
        sheet.addMergedRegion(CellRangeAddress(9, 9, 9, 11))

        // Rows 12 .. 11+N (idx 11 .. 10+N): Trip rows
        groupRecords.forEachIndexed { idx, rec ->
            val rowIdx = 11 + idx
            val excelRow = rowIdx + 1
            val row = sheet.createRow(rowIdx)

            val startLocal = rec.startTime.atZone(BUCHAREST_ZONE)
            val endLocal = rec.endTime.atZone(BUCHAREST_ZONE)

            row.createCell(0).apply {
                setCellValue((idx + 1).toDouble())
                cellStyle = styles.dataInt
            }
            row.createCell(1).apply {
                setCellValue(startLocal.format(TIME_FMT))
                cellStyle = styles.dataCenter
            }
            row.createCell(2).apply {
                setCellValue(startLocal.format(DATE_FMT))
                cellStyle = styles.dataCenter
            }
            row.createCell(3).apply {
                setCellValue(endLocal.format(TIME_FMT))
                cellStyle = styles.dataCenter
            }
            row.createCell(4).apply {
                setCellValue(endLocal.format(DATE_FMT))
                cellStyle = styles.dataCenter
            }
            row.createCell(5).apply {
                setCellValue(sanitizeCellText(rec.origin))
                cellStyle = styles.dataLeft
            }
            row.createCell(6).apply {
                setCellValue(sanitizeCellText(rec.destination))
                cellStyle = styles.dataLeft
            }
            row.createCell(7).apply {
                setCellValue(sanitizeCellText(rec.description))
                cellStyle = styles.dataLeft
            }
            row.createCell(8).apply {
                setCellValue(if (rec.roundTrip) "x" else "")
                cellStyle = styles.dataCenter
            }
            row.createCell(9).apply {
                if (startOdometer != null) {
                    cellFormula = if (idx == 0) "L5" else "K${excelRow - 1}"
                }
                cellStyle = styles.dataOdometer
            }
            row.createCell(10).apply {
                if (startOdometer != null) {
                    cellFormula = "J$excelRow+L$excelRow"
                }
                cellStyle = styles.dataOdometer
            }
            row.createCell(11).apply {
                setCellValue(rec.distanceKm)
                cellStyle = styles.dataDistance
            }
        }

        // Total row (12+N, idx 11+N)
        val totalRowIdx = 11 + groupRecords.size
        val totalRow = sheet.createRow(totalRowIdx)
        for (col in 0..11) {
            totalRow.createCell(col).cellStyle = styles.totalBlank
        }
        totalRow.getCell(1).apply {
            setCellValue("TOTAL")
            cellStyle = styles.totalLabel
        }
        totalRow.getCell(10).apply {
            if (startOdometer != null) {
                cellFormula = "L6"
            }
            cellStyle = styles.totalOdometer
        }
        totalRow.getCell(11).apply {
            cellFormula = "SUM(L12:L$lastDataExcelRow)"
            cellStyle = styles.totalDistance
        }

        // Blank spacer row (13+N, idx 12+N)
        sheet.createRow(totalRowIdx + 1)

        // Signature footer (14+N and 15+N, idx 13+N and 14+N)
        val sigRow1Idx = totalRowIdx + 2
        val sigRow2Idx = totalRowIdx + 3
        val sigRow1 = sheet.createRow(sigRow1Idx)
        val sigRow2 = sheet.createRow(sigRow2Idx)

        val approverName = report.approvedBy?.displayName ?: report.signer?.displayName
        val approverLabel = if (!approverName.isNullOrBlank()) {
            "Aprobat: ${sanitizeCellText(approverName)}"
        } else {
            "Aprobat:"
        }

        sigRow1.createCell(1).apply {
            setCellValue("Șofer: ${sanitizeCellText(driverName)}")
            cellStyle = styles.signatureBold
        }
        sigRow1.createCell(7).apply {
            setCellValue(approverLabel)
            cellStyle = styles.signatureBold
        }
        sigRow2.createCell(1).apply {
            setCellValue("Semnătură: ________________________")
            cellStyle = styles.signatureLine
        }
        sigRow2.createCell(7).apply {
            setCellValue("Semnătură: ________________________")
            cellStyle = styles.signatureLine
        }

        sheet.addMergedRegion(CellRangeAddress(sigRow1Idx, sigRow1Idx, 1, 4))
        sheet.addMergedRegion(CellRangeAddress(sigRow1Idx, sigRow1Idx, 7, 11))
        sheet.addMergedRegion(CellRangeAddress(sigRow2Idx, sigRow2Idx, 1, 4))
        sheet.addMergedRegion(CellRangeAddress(sigRow2Idx, sigRow2Idx, 7, 11))

        // Column widths & A4 Landscape print setup
        COLUMN_WIDTHS_CHARS.forEachIndexed { col, widthChars ->
            sheet.setColumnWidth(col, widthChars * 256)
        }
        sheet.fitToPage = true
        sheet.printSetup.landscape = true
        sheet.printSetup.paperSize = PrintSetup.A4_PAPERSIZE
        sheet.printSetup.fitWidth = 1
        sheet.printSetup.fitHeight = 0
    }

    private fun vehicleGroupKey(record: MileageRecord): String =
        record.vehiclePlate?.trim()?.takeIf { it.isNotEmpty() } ?: "UNASSIGNED"

    private fun romanianMonth(month: Int): String =
        ROMANIAN_MONTHS.getOrElse(month - 1) { month.toString() }

    private fun fuelTypeLabel(fuelType: String?): String = when (fuelType?.trim()?.lowercase(Locale.ROOT)) {
        "petrol" -> "Benzină"
        "diesel" -> "Diesel"
        "hybrid" -> "Hibrid"
        "electric" -> "Electric"
        "lpg" -> "GPL"
        else -> "-"
    }

    private fun formatVehicleDisplay(makeModel: String?, plate: String?): String {
        val raw = when {
            makeModel != null && plate != null -> "$makeModel - $plate"
            plate != null -> plate
            makeModel != null -> makeModel
            else -> return "-"
        }
        return sanitizeCellText(raw)
    }

    private fun formatFuelConsumption(litersPer100Km: BigDecimal?): String {
        if (litersPer100Km == null) return "-"
        val litersPerKm = litersPer100Km.divide(BigDecimal(100), 4, RoundingMode.HALF_UP)
            .stripTrailingZeros()
            .toPlainString()
            .replace('.', ',')
        return "$litersPerKm (L/km)"
    }

    private fun sanitizeCellText(value: String?): String {
        if (value.isNullOrEmpty()) return ""
        val trimmed = value.trimStart()
        return if (value[0] in FORMULA_INJECTION_CHARS || (trimmed.isNotEmpty() && trimmed[0] in FORMULA_INJECTION_CHARS)) {
            "'$value"
        } else {
            value
        }
    }

    private fun uniqueSafeSheetName(raw: String, usedLowercase: MutableSet<String>): String {
        val cleaned = raw
            .replace(INVALID_SHEET_CHARS, "-")
            .trim()
            .trim('\'')
            .ifEmpty { "Foaie" }
        val base = cleaned.take(31).trimEnd('\'').ifEmpty { "Foaie" }

        var candidate = base
        var counter = 2
        while (!usedLowercase.add(candidate.lowercase(Locale.ROOT))) {
            val suffix = " ($counter)"
            val maxBaseLen = (31 - suffix.length).coerceAtLeast(1)
            candidate = base.take(maxBaseLen).trimEnd('\'') + suffix
            counter++
        }
        return candidate
    }
}
