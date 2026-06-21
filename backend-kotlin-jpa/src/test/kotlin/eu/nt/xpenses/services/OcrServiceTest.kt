package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.models.Expense
import eu.nt.xpenses.models.OcrComparison
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.*
import java.math.BigDecimal
import java.time.Instant
import java.util.Optional

class OcrServiceTest {

    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val expenseRepository = mock(ExpenseRepository::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val cryptoService = mock(CryptoService::class.java)
    private val objectMapper = ObjectMapper()

    private val ocrService = OcrService(
        appSettingRepository,
        categoryRepository,
        expenseRepository,
        ocrComparisonRepository,
        cryptoService,
        objectMapper
    )

    private val fakeBytes = "receipt image content".toByteArray()
    private val filename = "receipt.jpg"
    private lateinit var sha256: String

    @BeforeEach
    fun setup() {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(fakeBytes)
        sha256 = hashBytes.joinToString("") { "%02x".format(it) }

        // Mock config: EasyOCR is enabled
        val setting = AppSetting(
            key = "ocr_config",
            value = """{"provider":"easyocr","ocr_enabled":true}""",
            updatedAt = Instant.now()
        )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))
        `when`(categoryRepository.findAllByIsActiveTrue()).thenReturn(emptyList())
    }

    @Test
    fun `scanReceipt should hit cache when matching hash exists`() {
        val cachedComparison = OcrComparison(
            id = 10,
            receiptFilename = "old.jpg",
            provider = "easyocr",
            sha256 = sha256,
            easyocrAmount = BigDecimal("45.50"),
            easyocrDate = "2024-02-15",
            easyocrMerchant = "Starbucks",
            createdAt = Instant.now()
        )

        // Mock repository lookup
        `when`(ocrComparisonRepository.findBestCachedComparison(sha256))
            .thenReturn(listOf(cachedComparison))

        // Mock saving the duplicated comparison
        `when`(ocrComparisonRepository.save(any(OcrComparison::class.java))).thenAnswer {
            val saved = it.arguments[0] as OcrComparison
            saved.id = 11 // Mock generated ID
            saved
        }

        // Execute scan
        val result = ocrService.scanReceipt(fakeBytes, filename)

        // Verify result matches cache
        assertEquals(45.50, result["amount"])
        assertEquals("2024-02-15", result["date"])
        assertEquals("Starbucks", result["merchant"])
        assertEquals(11, result["comparison_id"])

        // Verify duplication logic
        verify(ocrComparisonRepository).save(any(OcrComparison::class.java))
    }

    @Test
    fun `scanReceipt should resolve currency and raw text from linked expense when hit cache`() {
        val expense = Expense(
            id = 5,
            amountOriginal = 15.0,
            currencyOriginal = "RON",
            amountEur = 3.0,
            fxRate = 0.20,
            taxAmount = BigDecimal("2.4"),
            taxRate = BigDecimal("19.0"),
            date = "2024-03-01",
            merchant = "KFC",
            description = "Lunch meeting",
            rawOcrText = "KFC ROMANIA TOTAL 15.00 RON",
            status = "draft"
        )
        val cachedComparison = OcrComparison(
            id = 20,
            receiptFilename = "receipt_old.jpg",
            provider = "easyocr",
            sha256 = sha256,
            easyocrAmount = BigDecimal("15.00"),
            easyocrDate = "2024-03-01",
            easyocrMerchant = "KFC",
            expense = expense,
            createdAt = Instant.now()
        )

        // Mock repository lookup
        `when`(ocrComparisonRepository.findBestCachedComparison(sha256))
            .thenReturn(listOf(cachedComparison))

        // Mock saving the duplicated comparison
        `when`(ocrComparisonRepository.save(any(OcrComparison::class.java))).thenAnswer {
            val saved = it.arguments[0] as OcrComparison
            saved.id = 21
            saved
        }

        // Execute scan
        val result = ocrService.scanReceipt(fakeBytes, filename)

        // Verify metadata fields retrieved from linked expense
        assertEquals(15.0, result["amount"])
        assertEquals("RON", result["currency"])
        assertEquals(2.4, result["tax_amount"])
        assertEquals(19.0, result["tax_rate"])
        assertEquals("KFC", result["merchant"])
        assertEquals("Lunch meeting", result["description"])
        assertEquals("KFC ROMANIA TOTAL 15.00 RON", result["raw_text"])
        assertEquals(21, result["comparison_id"])
    }
}
