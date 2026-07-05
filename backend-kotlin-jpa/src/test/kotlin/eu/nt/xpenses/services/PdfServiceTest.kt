package eu.nt.xpenses.services

import eu.nt.xpenses.models.*
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
    private val pdfService = PdfService(
        storageService = storageService,
        appSettingRepository = appSettingRepository,
        companyName = "Test Company"
    )

    @Test
    fun `generateReportPdf should contain calculated totals for expenses and advances`() {
        val user = User(
            id = 1,
            username = "tech",
            displayName = "John Doe",
            email = "john@example.com",
            role = "technician",
            passwordHash = "hash"
        )
        val report = ExpenseReport(
            id = 123,
            user = user,
            title = "Business Trip to Paris",
            description = "Project meeting",
            status = "submitted",
            dateFrom = "2026-06-01",
            dateTo = "2026-06-02"
        )

        val expenses = listOf(
            Expense(
                id = 1,
                user = user,
                amountOriginal = BigDecimal("10.00"),
                currencyOriginal = "EUR",
                amountEur = BigDecimal("10.00"),
                fxRate = BigDecimal.ONE,
                date = "01.06.2026",
                category = Category(id = 1, name = "Food")
            ),
            Expense(
                id = 2,
                user = user,
                amountOriginal = BigDecimal("25.50"),
                currencyOriginal = "EUR",
                amountEur = BigDecimal("25.50"),
                fxRate = BigDecimal.ONE,
                date = "02.06.2026",
                category = Category(id = 2, name = "Transport")
            )
        )

        val advances = listOf(
            AdvancePayment(
                id = 1,
                user = user,
                report = report,
                amountOriginal = BigDecimal("50.00"),
                currencyOriginal = "EUR",
                amountEur = BigDecimal("50.00"),
                date = "31.05.2026",
                status = "paid",
                description = "Hotel deposit"
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
                description = "Taxi advance"
            )
        )

        `when`(appSettingRepository.findById("daily_allowance_rate")).thenReturn(Optional.empty())

        // Act
        val pdfBytes = pdfService.generateReportPdf(
            report = report,
            expenses = expenses,
            advances = advances,
            mileage = emptyList(),
            signer = null
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
    }
}
