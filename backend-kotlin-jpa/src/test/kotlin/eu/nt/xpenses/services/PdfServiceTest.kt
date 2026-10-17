package eu.nt.xpenses.services

import eu.nt.xpenses.model.*
import eu.nt.xpenses.repositories.AppSettingRepository
import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.math.BigDecimal
import java.util.Optional

class PdfServiceTest {
    private val storageService = mock(StorageService::class.java)
    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val pdfService =
        PdfService(
            storageService = storageService,
            appSettingRepository = appSettingRepository,
            companyName = "Test Company",
        )

    @Test
    fun `generateReportPdf should contain calculated totals for expenses and advances`() {
        val user =
            User(
                id = 1,
                username = "tech",
                displayName = "John Doe",
                email = "john@example.com",
                role = "technician",
                passwordHash = "hash",
            )
        val report =
            ExpenseReport(
                id = 123,
                user = user,
                title = "Business Trip to Paris",
                description = "Project meeting",
                status = "submitted",
                dateFrom = "2026-06-01",
                dateTo = "2026-06-02",
                kundenauftrag = "0007038319",
                kundeName = "PJSC CARLSBERG UKRAINE",
                vorgang = "0240 DEJR-N-INB",
                arbeitsplatz = "ER_MT 1049",
            )

        val expenses =
            listOf(
                Expense(
                    id = 1,
                    user = user,
                    amountOriginal = BigDecimal("10.00"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("10.00"),
                    fxRate = BigDecimal.ONE,
                    date = "01.06.2026",
                    category = Category(id = 1, name = "Food"),
                ),
                Expense(
                    id = 2,
                    user = user,
                    amountOriginal = BigDecimal("25.50"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("25.50"),
                    fxRate = BigDecimal.ONE,
                    date = "02.06.2026",
                    category = Category(id = 2, name = "Transport"),
                ),
            )

        val advances =
            listOf(
                AdvancePayment(
                    id = 1,
                    user = user,
                    report = report,
                    amountOriginal = BigDecimal("50.00"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("50.00"),
                    date = "31.05.2026",
                    status = "paid",
                    description = "Hotel deposit",
                ),
                AdvancePayment(
                    id = 2,
                    user = user,
                    report = report,
                    amountOriginal = BigDecimal("100.00"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("100.00"),
                    date = "31.05.2026",
                    status = "paid",
                    description = "Taxi advance",
                ),
            )

        `when`(appSettingRepository.findById("daily_allowance_rate")).thenReturn(Optional.empty())

        // Act
        val pdfBytes =
            pdfService.generateReportPdf(
                report = report,
                expenses = expenses,
                advances = advances,
                mileage = emptyList(),
                signer = null,
            )

        // Assert
        assertNotNull(pdfBytes)
        assertTrue(pdfBytes.isNotEmpty())

        // Extract text from the generated PDF using PDFBox
        val doc = Loader.loadPDF(pdfBytes)
        val stripper = PDFTextStripper()
        val text = stripper.getText(doc)
        doc.close()

        // Verify Expense Summary Total row is present
        // Total of expenses: €35.50
        assertTrue(text.contains("35.50"), "PDF text should contain the Expense Summary total: 35.50")

        // Verify Advance Payments Total row is present
        // Total of advances: €150.00
        assertTrue(text.contains("150.00"), "PDF text should contain the Advance Payments total: 150.00")

        // Verify both tables have "TOTAL" text in them
        assertTrue(text.contains("TOTAL"), "PDF text should contain TOTAL labels")

        // Verify Delegation Details are printed
        assertTrue(text.contains("Delegation Details"), "PDF text should contain Delegation Details section")
        assertTrue(text.contains("Customer: PJSC CARLSBERG UKRAINE"), "PDF text should contain Customer name")
        assertTrue(text.contains("Order nr: 0007038319"), "PDF text should contain order number with an English label")
        assertTrue(text.indexOf("Order nr:") < text.indexOf("Customer:"), "Order nr must be the first delegation detail")
        assertTrue(text.contains("Operation: 0240 DEJR-N-INB"), "PDF text should contain operation")
        assertTrue(text.contains("Work Center: ER_MT 1049"), "PDF text should contain work center")

        // Verify Report Summary labels are updated
        assertTrue(text.contains("Total Advances"), "PDF text should contain 'Total Advances' label")
        assertTrue(text.contains("Reimbursable"), "PDF text should contain 'Reimbursable' label")

        // Verify negative reimbursable value (35.50 + 100.00 + 0.00 - 150.00 = -14.50)
        assertTrue(text.contains("-14.50") || text.contains("-€14.50"), "PDF text should contain negative reimbursable: -14.50")
    }

    @Test
    fun `generateReportPdf should contain positive reimbursable amount when expenses exceed advances`() {
        val user =
            User(
                id = 1,
                username = "tech",
                displayName = "John Doe",
                email = "john@example.com",
                role = "technician",
                passwordHash = "hash",
            )
        val report =
            ExpenseReport(
                id = 124,
                user = user,
                title = "Trip",
                status = "submitted",
                dateFrom = "2026-06-01",
                dateTo = "2026-06-02",
            )

        val expenses =
            listOf(
                Expense(
                    id = 1,
                    user = user,
                    amountOriginal = BigDecimal("200.00"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("200.00"),
                    fxRate = BigDecimal.ONE,
                    date = "01.06.2026",
                    category = Category(id = 1, name = "Hotel"),
                ),
            )

        val advances =
            listOf(
                AdvancePayment(
                    id = 1,
                    user = user,
                    report = report,
                    amountOriginal = BigDecimal("50.00"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("50.00"),
                    date = "31.05.2026",
                    status = "paid",
                ),
            )

        `when`(appSettingRepository.findById("daily_allowance_rate")).thenReturn(Optional.empty())

        // Act
        val pdfBytes =
            pdfService.generateReportPdf(
                report = report,
                expenses = expenses,
                advances = advances,
                mileage = emptyList(),
                signer = null,
            )

        // Assert
        val doc = Loader.loadPDF(pdfBytes)
        val stripper = PDFTextStripper()
        val text = stripper.getText(doc)
        doc.close()

        // Verify positive reimbursable value (200.00 + 100.00 + 0.00 - 50.00 = 250.00)
        assertTrue(text.contains("250.00"), "PDF text should contain positive reimbursable: 250.00")
    }
}
