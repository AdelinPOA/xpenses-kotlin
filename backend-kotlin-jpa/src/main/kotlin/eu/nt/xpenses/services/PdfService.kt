package eu.nt.xpenses.services

import com.lowagie.text.*
import com.lowagie.text.pdf.*
import com.lowagie.text.pdf.draw.DottedLineSeparator
import eu.nt.xpenses.models.*
import org.apache.pdfbox.Loader
import org.apache.pdfbox.pdmodel.PDDocument
import org.springframework.stereotype.Service
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.DecimalFormat
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Service
class PdfService(
    private val storageService: StorageService
) {
    private val decimalFormat = DecimalFormat("###,##0.00")
    private val dateFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy").withZone(ZoneId.of("UTC"))
    private val dateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.of("UTC"))

    fun generateReportPdf(
        report: ExpenseReport,
        expenses: List<Expense>,
        advances: List<AdvancePayment>,
        mileage: List<MileageRecord>,
        signer: User?
    ): ByteArray {
        val mainPdfBytes = buildMainPdf(report, expenses, advances, mileage, signer)

        // Find all PDF receipts
        val pdfReceipts = mutableListOf<ByteArray>()
        for (expense in expenses) {
            for (receipt in expense.receipts) {
                if (receipt.filePath.endsWith(".pdf", ignoreCase = true)) {
                    try {
                        val pdfBytes = storageService.downloadFile(receipt.filePath)
                        pdfReceipts.add(pdfBytes)
                    } catch (e: Exception) {
                        // ignore missing/corrupt files
                    }
                }
            }
        }

        return if (pdfReceipts.isNotEmpty()) {
            mergePdfFiles(mainPdfBytes, pdfReceipts)
        } else {
            mainPdfBytes
        }
    }

    private fun buildMainPdf(
        report: ExpenseReport,
        expenses: List<Expense>,
        advances: List<AdvancePayment>,
        mileage: List<MileageRecord>,
        signer: User?
    ): ByteArray {
        val outputStream = ByteArrayOutputStream()
        val document = Document(PageSize.A4, 36f, 36f, 36f, 36f)
        val writer = PdfWriter.getInstance(document, outputStream)
        document.open()

        val fontTitle = Font(Font.HELVETICA, 20f, Font.BOLD, java.awt.Color(30, 41, 59))
        val fontHeader = Font(Font.HELVETICA, 9f, Font.BOLD, java.awt.Color.WHITE)
        val fontBold = Font(Font.HELVETICA, 9f, Font.BOLD, java.awt.Color(30, 41, 59))
        val fontBody = Font(Font.HELVETICA, 9f, Font.NORMAL, java.awt.Color(50, 50, 50))
        val fontSmall = Font(Font.HELVETICA, 8f, Font.NORMAL, java.awt.Color(80, 80, 80))
        val fontCaption = Font(Font.HELVETICA, 8f, Font.NORMAL, java.awt.Color(100, 100, 100))

        // --- Logo & Header ---
        val headerTable = PdfPTable(2)
        headerTable.widthPercentage = 100f
        headerTable.setWidths(floatArrayOf(50f, 50f))

        // Left side: Company Name
        val leftCell = PdfPCell()
        leftCell.border = Rectangle.NO_BORDER
        
        // Try to draw logo
        val logoFile = File("/app/backend-kotlin-jpa/src/main/resources/company_logo.png")
        if (logoFile.exists()) {
            try {
                val logoImg = Image.getInstance(logoFile.absolutePath)
                logoImg.scaleToFit(80f, 80f)
                leftCell.addElement(logoImg)
                leftCell.addElement(Paragraph(" ", fontSmall))
            } catch (e: Exception) {}
        }
        leftCell.addElement(Paragraph("Newtech Automation", Font(Font.HELVETICA, 12f, Font.BOLD, java.awt.Color(30, 41, 59))))
        headerTable.addCell(leftCell)

        // Right side: Report Title & Total
        val rightCell = PdfPCell()
        rightCell.border = Rectangle.NO_BORDER
        rightCell.horizontalAlignment = Element.ALIGN_RIGHT
        
        val pTitle = Paragraph("Expense Report", fontTitle)
        pTitle.alignment = Element.ALIGN_RIGHT
        rightCell.addElement(pTitle)

        val pId = Paragraph("#${report.id}", fontCaption)
        pId.alignment = Element.ALIGN_RIGHT
        rightCell.addElement(pId)

        val pStatus = Paragraph(report.status.uppercase(), fontCaption)
        pStatus.alignment = Element.ALIGN_RIGHT
        rightCell.addElement(pStatus)

        rightCell.addElement(Paragraph(" ", fontSmall))

        val totalEur = expenses.sumOf { it.amountEur }
        val pTotalLabel = Paragraph("Total", fontCaption)
        pTotalLabel.alignment = Element.ALIGN_RIGHT
        rightCell.addElement(pTotalLabel)

        val pTotalVal = Paragraph("€${formatAmount(totalEur)}", Font(Font.HELVETICA, 22f, Font.BOLD, java.awt.Color(30, 41, 59)))
        pTotalVal.alignment = Element.ALIGN_RIGHT
        rightCell.addElement(pTotalVal)

        headerTable.addCell(rightCell)
        document.add(headerTable)
        document.add(Paragraph(" ", fontSmall))

        // Line separator
        val line = Paragraph()
        line.add(Chunk(DottedLineSeparator()))
        document.add(line)
        document.add(Paragraph(" ", fontSmall))

        // --- Report metadata ---
        val metaTable = PdfPTable(2)
        metaTable.widthPercentage = 100f
        metaTable.setWidths(floatArrayOf(50f, 50f))

        val metaLeft = PdfPCell()
        metaLeft.border = Rectangle.NO_BORDER
        metaLeft.addElement(Paragraph("Report Title", fontCaption))
        metaLeft.addElement(Paragraph(report.title, fontBold))
        if (!report.description.isNullOrEmpty()) {
            metaLeft.addElement(Paragraph(report.description, fontSmall))
        }
        metaLeft.addElement(Paragraph(" ", fontSmall))
        metaLeft.addElement(Paragraph("Submitted By", fontCaption))
        metaLeft.addElement(Paragraph(report.user?.displayName ?: "Unknown", fontBold))
        metaLeft.addElement(Paragraph(report.user?.email ?: "", fontSmall))
        metaTable.addCell(metaLeft)

        val metaRight = PdfPCell()
        metaRight.border = Rectangle.NO_BORDER
        if (!report.dateFrom.isNullOrEmpty() || !report.dateTo.isNullOrEmpty()) {
            metaRight.addElement(Paragraph("Report Duration", fontCaption))
            val dFrom = report.dateFrom ?: ""
            val dTo = report.dateTo ?: ""
            metaRight.addElement(Paragraph("$dFrom - $dTo", fontBold))
        }
        metaTable.addCell(metaRight)
        document.add(metaTable)
        document.add(Paragraph(" ", fontBody))

        // --- Expense Summary table ---
        document.add(Paragraph("EXPENSE SUMMARY", fontBold))
        document.add(Paragraph(" ", fontSmall))

        val expTable = PdfPTable(5)
        expTable.widthPercentage = 100f
        expTable.setWidths(floatArrayOf(8f, 37f, 20f, 15f, 20f))

        val headers = listOf("S.No", "Expense Details", "Category", "Amount", "Amount (EUR)")
        for (h in headers) {
            val cell = PdfPCell(Phrase(h, fontHeader))
            cell.backgroundColor = java.awt.Color(30, 41, 59)
            cell.setPadding(6f)
            cell.horizontalAlignment = if (h == "Amount" || h == "Amount (EUR)") Element.ALIGN_RIGHT else Element.ALIGN_LEFT
            expTable.addCell(cell)
        }

        for ((idx, e) in expenses.withIndex()) {
            val cellNo = PdfPCell(Phrase("${idx + 1}.", fontBody))
            cellNo.setPadding(5f)
            expTable.addCell(cellNo)

            val detailsText = if (!e.merchant.isNullOrEmpty()) {
                "${e.date}\nMerchant: ${e.merchant}"
            } else {
                e.date
            }
            val cellDetails = PdfPCell(Phrase(detailsText, fontBody))
            cellDetails.setPadding(5f)
            expTable.addCell(cellDetails)

            val cellCat = PdfPCell(Phrase(e.category?.name ?: "—", fontBody))
            cellCat.setPadding(5f)
            expTable.addCell(cellCat)

            val amtText = "${formatCurrencySymbol(e.currencyOriginal)}${formatAmount(e.amountOriginal)}"
            val fxRateText = if (e.currencyOriginal != "EUR" && e.fxRate != 1.0) {
                "\n1 ${e.currencyOriginal} = ${e.fxRate} EUR"
            } else ""
            val cellAmt = PdfPCell(Phrase("$amtText$fxRateText", fontSmall))
            cellAmt.setPadding(5f)
            cellAmt.horizontalAlignment = Element.ALIGN_RIGHT
            expTable.addCell(cellAmt)

            val cellAmtEur = PdfPCell(Phrase("€${formatAmount(e.amountEur)}", fontBody))
            cellAmtEur.setPadding(5f)
            cellAmtEur.horizontalAlignment = Element.ALIGN_RIGHT
            expTable.addCell(cellAmtEur)
        }
        document.add(expTable)
        document.add(Paragraph(" ", fontBody))

        // --- Advance Payments table ---
        val paidAdvances = advances.filter { it.status == "paid" }
        if (paidAdvances.isNotEmpty()) {
            document.add(Paragraph("ADVANCE PAYMENTS", fontBold))
            document.add(Paragraph(" ", fontSmall))

            val advTable = PdfPTable(5)
            advTable.widthPercentage = 100f
            advTable.setWidths(floatArrayOf(8f, 22f, 35f, 15f, 20f))

            val advHeaders = listOf("S.No", "Date", "Description", "Amount", "Amount (EUR)")
            for (h in advHeaders) {
                val cell = PdfPCell(Phrase(h, fontHeader))
                cell.backgroundColor = java.awt.Color(30, 41, 59)
                cell.setPadding(6f)
                cell.horizontalAlignment = if (h == "Amount" || h == "Amount (EUR)") Element.ALIGN_RIGHT else Element.ALIGN_LEFT
                advTable.addCell(cell)
            }

            for ((idx, a) in paidAdvances.withIndex()) {
                val cellNo = PdfPCell(Phrase("${idx + 1}.", fontBody))
                cellNo.setPadding(5f)
                advTable.addCell(cellNo)

                val cellDate = PdfPCell(Phrase(a.date, fontBody))
                cellDate.setPadding(5f)
                advTable.addCell(cellDate)

                val cellDesc = PdfPCell(Phrase(a.description ?: "—", fontBody))
                cellDesc.setPadding(5f)
                advTable.addCell(cellDesc)

                val amtText = "${formatCurrencySymbol(a.currencyOriginal)}${formatAmount(a.amountOriginal)}"
                val cellAmt = PdfPCell(Phrase(amtText, fontBody))
                cellAmt.setPadding(5f)
                cellAmt.horizontalAlignment = Element.ALIGN_RIGHT
                advTable.addCell(cellAmt)

                val cellAmtEur = PdfPCell(Phrase("€${formatAmount(a.amountEur)}", fontBody))
                cellAmtEur.setPadding(5f)
                cellAmtEur.horizontalAlignment = Element.ALIGN_RIGHT
                advTable.addCell(cellAmtEur)
            }
            document.add(advTable)
            document.add(Paragraph(" ", fontBody))
        }

        // --- Mileage Records table ---
        if (mileage.isNotEmpty()) {
            document.add(Paragraph("MILEAGE", fontBold))
            document.add(Paragraph(" ", fontSmall))

            val milTable = PdfPTable(9)
            milTable.widthPercentage = 100f
            milTable.setWidths(floatArrayOf(6f, 16f, 10f, 22f, 8f, 9f, 10f, 9f, 10f))

            val milHeaders = listOf("S.No", "Date/Time", "Duration", "Route", "km", "Rate BT", "Gross (€)", "Rate AT", "Net (€)")
            for (h in milHeaders) {
                val cell = PdfPCell(Phrase(h, fontHeader))
                cell.backgroundColor = java.awt.Color(30, 41, 59)
                cell.setPadding(4f)
                cell.horizontalAlignment = if (h in listOf("km", "Rate BT", "Gross (€)", "Rate AT", "Net (€)")) Element.ALIGN_RIGHT else Element.ALIGN_LEFT
                milTable.addCell(cell)
            }

            var totalKm = 0.0
            var totalGross = 0.0
            var totalNet = 0.0
            var totalDurationMin = 0L

            for ((idx, m) in mileage.withIndex()) {
                totalKm += m.distanceKm
                totalGross += m.amountBeforeTax
                totalNet += m.amountEur
                val duration = Duration.between(m.startTime, m.endTime)
                totalDurationMin += duration.toMinutes()

                val durationStr = formatDuration(duration)

                val cellNo = PdfPCell(Phrase("${idx + 1}.", fontBody))
                cellNo.setPadding(4f)
                milTable.addCell(cellNo)

                val cellDate = PdfPCell(Phrase(dateTimeFormatter.format(m.startTime), fontSmall))
                cellDate.setPadding(4f)
                milTable.addCell(cellDate)

                val cellDur = PdfPCell(Phrase(durationStr, fontSmall))
                cellDur.setPadding(4f)
                milTable.addCell(cellDur)

                val routeText = "${m.origin} → ${m.destination}"
                val cellRoute = PdfPCell(Phrase(routeText, fontSmall))
                cellRoute.setPadding(4f)
                milTable.addCell(cellRoute)

                val cellKm = PdfPCell(Phrase(String.format("%.1f", m.distanceKm), fontBody))
                cellKm.setPadding(4f)
                cellKm.horizontalAlignment = Element.ALIGN_RIGHT
                milTable.addCell(cellKm)

                val cellRateBt = PdfPCell(Phrase(String.format("%.2f", m.rateBeforeTax), fontSmall))
                cellRateBt.setPadding(4f)
                cellRateBt.horizontalAlignment = Element.ALIGN_RIGHT
                milTable.addCell(cellRateBt)

                val cellGross = PdfPCell(Phrase("€${formatAmount(m.amountBeforeTax)}", fontSmall))
                cellGross.setPadding(4f)
                cellGross.horizontalAlignment = Element.ALIGN_RIGHT
                milTable.addCell(cellGross)

                val cellRateAt = PdfPCell(Phrase(String.format("%.2f", m.rateAfterTax), fontSmall))
                cellRateAt.setPadding(4f)
                cellRateAt.horizontalAlignment = Element.ALIGN_RIGHT
                milTable.addCell(cellRateAt)

                val cellNet = PdfPCell(Phrase("€${formatAmount(m.amountEur)}", fontBody))
                cellNet.setPadding(4f)
                cellNet.horizontalAlignment = Element.ALIGN_RIGHT
                milTable.addCell(cellNet)
            }

            // Total row
            val cellBlank1 = PdfPCell()
            cellBlank1.border = Rectangle.BOX
            milTable.addCell(cellBlank1)

            val cellBlank2 = PdfPCell()
            cellBlank2.border = Rectangle.BOX
            milTable.addCell(cellBlank2)

            val totalDurStr = "${totalDurationMin / 60}h ${String.format("%02d", totalDurationMin % 60)}m"
            val cellTotalDur = PdfPCell(Phrase(totalDurStr, fontBold))
            cellTotalDur.setPadding(4f)
            milTable.addCell(cellTotalDur)

            val cellTotalLabel = PdfPCell(Phrase("TOTAL", fontBold))
            cellTotalLabel.setPadding(4f)
            milTable.addCell(cellTotalLabel)

            val cellTotalKm = PdfPCell(Phrase(String.format("%.1f", totalKm), fontBold))
            cellTotalKm.setPadding(4f)
            cellTotalKm.horizontalAlignment = Element.ALIGN_RIGHT
            milTable.addCell(cellTotalKm)

            val cellBlank3 = PdfPCell()
            cellBlank3.border = Rectangle.BOX
            milTable.addCell(cellBlank3)

            val cellTotalGross = PdfPCell(Phrase("€${formatAmount(totalGross)}", fontBold))
            cellTotalGross.setPadding(4f)
            cellTotalGross.horizontalAlignment = Element.ALIGN_RIGHT
            milTable.addCell(cellTotalGross)

            val cellBlank4 = PdfPCell()
            cellBlank4.border = Rectangle.BOX
            milTable.addCell(cellBlank4)

            val cellTotalNet = PdfPCell(Phrase("€${formatAmount(totalNet)}", fontBold))
            cellTotalNet.setPadding(4f)
            cellTotalNet.horizontalAlignment = Element.ALIGN_RIGHT
            milTable.addCell(cellTotalNet)

            document.add(milTable)
            document.add(Paragraph(" ", fontBody))
        }

        // --- Currency summary ---
        val byCurrency = expenses.groupBy { it.currencyOriginal }
        if (byCurrency.keys.size > 1 || (byCurrency.keys.size == 1 && byCurrency.keys.first() != "EUR")) {
            document.add(Paragraph("REPORT SUMMARY BY CURRENCY", fontBold))
            document.add(Paragraph(" ", fontSmall))

            val curTable = PdfPTable(byCurrency.keys.size + 1)
            curTable.widthPercentage = 100f
            val widths = FloatArray(byCurrency.keys.size + 1)
            widths[0] = 30f
            for (i in 1..byCurrency.keys.size) widths[i] = 70f / byCurrency.keys.size
            curTable.setWidths(widths)

            val cellHeader = PdfPCell(Phrase("TOTAL", fontHeader))
            cellHeader.backgroundColor = java.awt.Color(30, 41, 59)
            cellHeader.setPadding(5f)
            curTable.addCell(cellHeader)

            val sortedCurrencies = byCurrency.keys.sorted()
            for (c in sortedCurrencies) {
                val cell = PdfPCell(Phrase(c, fontHeader))
                cell.backgroundColor = java.awt.Color(30, 41, 59)
                cell.setPadding(5f)
                cell.horizontalAlignment = Element.ALIGN_RIGHT
                curTable.addCell(cell)
            }

            // Row 1: Total original
            val cellOrigLabel = PdfPCell(Phrase("Total Expense Amount", fontBody))
            cellOrigLabel.setPadding(5f)
            curTable.addCell(cellOrigLabel)
            for (c in sortedCurrencies) {
                val sumOrig = byCurrency[c]!!.sumOf { it.amountOriginal }
                val cell = PdfPCell(Phrase(formatAmount(sumOrig), fontBody))
                cell.setPadding(5f)
                cell.horizontalAlignment = Element.ALIGN_RIGHT
                curTable.addCell(cell)
            }

            // Row 2: Reimbursable EUR
            val cellReimbLabel = PdfPCell(Phrase("Total Reimbursable (EUR)", fontBold))
            cellReimbLabel.setPadding(5f)
            curTable.addCell(cellReimbLabel)
            for (c in sortedCurrencies) {
                val sumEur = byCurrency[c]!!.sumOf { it.amountEur }
                val cell = PdfPCell(Phrase("€${formatAmount(sumEur)}", fontBold))
                cell.setPadding(5f)
                cell.horizontalAlignment = Element.ALIGN_RIGHT
                curTable.addCell(cell)
            }

            document.add(curTable)
            document.add(Paragraph(" ", fontBody))
        }

        // --- Report Summary block ---
        document.add(Paragraph("REPORT SUMMARY", fontBold))
        document.add(Paragraph(" ", fontSmall))

        val totalAdv = advances.filter { it.status == "paid" }.sumOf { it.amountEur }
        val allowance = calculateDailyAllowance(report.dateFrom, report.dateTo)
        val totalMil = mileage.sumOf { it.amountEur }
        val totalReimbursable = totalEur + allowance + totalMil - totalAdv

        val summaryTable = PdfPTable(6)
        summaryTable.widthPercentage = 100f
        summaryTable.setWidths(floatArrayOf(20f, 5f, 20f, 20f, 15f, 20f))

        val sumCells = listOf(
            Pair("Total Expense", "€${formatAmount(totalEur)}"),
            Pair("Daily Allowance", "€${formatAmount(allowance)}"),
            Pair("Mileage", "€${formatAmount(totalMil)}"),
            Pair("Non Reimbursable", "€0.00"),
            Pair("Advance Received", "€${formatAmount(totalAdv)}"),
            Pair("Total Reimbursable", "€${formatAmount(totalReimbursable)}")
        )

        for ((idx, p) in sumCells.withIndex()) {
            val cellLabel = PdfPCell()
            cellLabel.border = Rectangle.NO_BORDER
            cellLabel.horizontalAlignment = Element.ALIGN_CENTER
            cellLabel.addElement(Paragraph(p.first, fontCaption))
            cellLabel.addElement(Paragraph(p.second, fontBold))
            summaryTable.addCell(cellLabel)

            if (idx < sumCells.size - 1) {
                val op = when(idx) {
                    0 -> "+"
                    1 -> "+"
                    2 -> "-"
                    3 -> "-"
                    else -> "="
                }
                val cellOp = PdfPCell()
                cellOp.border = Rectangle.NO_BORDER
                cellOp.horizontalAlignment = Element.ALIGN_CENTER
                cellOp.addElement(Paragraph(" ", fontCaption))
                cellOp.addElement(Paragraph(op, fontBold))
                summaryTable.addCell(cellOp)
            }
        }
        document.add(summaryTable)
        document.add(Paragraph(" ", fontBody))

        // --- Signature ---
        document.add(Paragraph(" ", fontBody))
        document.add(Paragraph("Submitted By", fontBold))
        
        if (signer != null && !signer.signaturePath.isNullOrEmpty() && File(signer.signaturePath!!).exists()) {
            try {
                val sigImg = Image.getInstance(signer.signaturePath)
                sigImg.scaleToFit(120f, 45f)
                document.add(sigImg)
            } catch (e: Exception) {
                document.add(Paragraph(" ", fontBody))
            }
            val signedAtText = if (report.signedAt != null) {
                " — signed ${dateTimeFormatter.format(report.signedAt)}"
            } else ""
            document.add(Paragraph("${signer.displayName}$signedAtText", fontBody))
        } else {
            document.add(Paragraph(" ", fontBody))
            document.add(Paragraph(" ", fontBody))
            document.add(Paragraph("___________________________", fontBody))
            document.add(Paragraph(report.user?.displayName ?: "Unknown", fontBody))
        }

        document.add(Paragraph(" ", fontSmall))
        document.add(Paragraph("Generated on ${dateTimeFormatter.format(Instant.now())} UTC", fontCaption))

        // --- Receipt images pages (2 per row) ---
        val imageReceipts = mutableListOf<String>()
        val imgExtensions = setOf("jpg", "jpeg", "png", "webp", "gif")
        for (expense in expenses) {
            for (receipt in expense.receipts) {
                val ext = receipt.filePath.substringAfterLast(".", "").lowercase()
                if (ext in imgExtensions) {
                    imageReceipts.add(receipt.filePath)
                }
            }
        }

        if (imageReceipts.isNotEmpty()) {
            document.newPage()
            document.add(Paragraph("ATTACHED RECEIPTS", fontBold))
            document.add(Paragraph(" ", fontSmall))

            val imgTable = PdfPTable(2)
            imgTable.widthPercentage = 100f
            imgTable.setWidths(floatArrayOf(50f, 50f))

            for (rPath in imageReceipts) {
                try {
                    val localPath = storageService.getLocalPath(rPath)
                    val file = File(localPath)
                    if (file.exists()) {
                        val img = Image.getInstance(file.absolutePath)
                        img.scaleToFit(240f, 320f)
                        
                        val cell = PdfPCell()
                        cell.border = Rectangle.BOX
                        cell.borderColor = java.awt.Color(226, 232, 240)
                        cell.setPadding(10f)
                        cell.horizontalAlignment = Element.ALIGN_CENTER
                        cell.verticalAlignment = Element.ALIGN_MIDDLE
                        cell.addElement(img)
                        
                        // Add short caption
                        cell.addElement(Paragraph(file.name, fontSmall))
                        imgTable.addCell(cell)
                    }
                } catch (e: Exception) {
                    val cell = PdfPCell(Phrase("[Image Load Error: $rPath]", fontSmall))
                    imgTable.addCell(cell)
                }
            }

            // Fill empty cell if odd number of images
            if (imageReceipts.size % 2 != 0) {
                val emptyCell = PdfPCell()
                emptyCell.border = Rectangle.NO_BORDER
                imgTable.addCell(emptyCell)
            }

            document.add(imgTable)
        }

        document.close()
        return outputStream.toByteArray()
    }

    private fun mergePdfFiles(mainPdfBytes: ByteArray, pdfFiles: List<ByteArray>): ByteArray {
        val destination = PDDocument()
        try {
            Loader.loadPDF(mainPdfBytes).use { source ->
                for (page in source.pages) {
                    destination.importPage(page)
                }
            }
            for (pdfBytes in pdfFiles) {
                try {
                    Loader.loadPDF(pdfBytes).use { source ->
                        for (page in source.pages) {
                            destination.importPage(page)
                        }
                    }
                } catch (e: Exception) {
                    // ignore malformed PDFs
                }
            }
            val outStream = ByteArrayOutputStream()
            destination.save(outStream)
            return outStream.toByteArray()
        } finally {
            destination.close()
        }
    }

    private fun formatAmount(amount: Double): String {
        return decimalFormat.format(amount)
    }

    private fun formatCurrencySymbol(currency: String): String {
        return when (currency.uppercase()) {
            "EUR" -> "€"
            "USD" -> "$"
            "GBP" -> "£"
            else -> "$currency "
        }
    }

    private fun formatDuration(duration: Duration): String {
        val mins = duration.toMinutes()
        val h = mins / 60
        val m = mins % 60
        return "${h}h ${String.format("%02d", m)}m"
    }

    private fun calculateDailyAllowance(dateFrom: String?, dateTo: String?): Double {
        if (dateFrom.isNullOrEmpty() || dateTo.isNullOrEmpty()) return 0.0
        return try {
            val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
            val dFrom = java.time.LocalDate.parse(dateFrom.take(10), formatter)
            val dTo = java.time.LocalDate.parse(dateTo.take(10), formatter)
            val days = Duration.between(dFrom.atStartOfDay(), dTo.atStartOfDay()).toDays() + 1
            if (days > 0) days * 50.0 else 0.0
        } catch (e: Exception) {
            0.0
        }
    }
}
