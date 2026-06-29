package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.models.Category
import eu.nt.xpenses.models.Expense
import eu.nt.xpenses.models.OcrComparison
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.ArgumentMatchers.eq
import org.mockito.ArgumentMatchers.isNull
import org.mockito.Mockito.*
import java.math.BigDecimal
import java.time.Instant
import java.util.Optional

class OcrServiceTest {

    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val cryptoService = mock(CryptoService::class.java)
    private val objectMapper = ObjectMapper().registerKotlinModule()

    private val ocrService = OcrService(
        appSettingRepository,
        categoryRepository,
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

        val setting = AppSetting(
            key = "ocr_config",
            value = """{"provider":"gemini-3.1-flash-lite","ocr_enabled":true,"gemini_api_key":"test-key"}""",
            updatedAt = Instant.now()
        )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))
        `when`(categoryRepository.findAllByIsActiveTrue()).thenReturn(emptyList())
        `when`(cryptoService.decrypt(anyString(), anyString())).thenAnswer { it.arguments[0] }
    }

    private fun geminiResult(amount: Double?, merchant: String?, date: String?): Map<String, Any?> = mapOf(
        "amount" to amount,
        "currency" to "EUR",
        "tax_amount" to null,
        "tax_rate" to null,
        "date" to date,
        "merchant" to merchant,
        "category_id" to null,
        "description" to "Scanned receipt",
        "raw_text" to "",
        "confidence" to 1.0,
        "warnings" to emptyList<String>()
    )

    @Test
    fun `scanReceipt should hit cache when matching hash exists`() {
        val cachedComparison = OcrComparison(
            id = 10,
            receiptFilename = "old.jpg",
            provider = "gemini-3.1-flash-lite",
            sha256 = sha256,
            geminiAmount = BigDecimal("45.50"),
            geminiDate = "2024-02-15",
            geminiMerchant = "Starbucks",
            createdAt = Instant.now()
        )

        `when`(ocrComparisonRepository.findBestCachedComparison(sha256))
            .thenReturn(listOf(cachedComparison))

        `when`(ocrComparisonRepository.save(any(OcrComparison::class.java))).thenAnswer {
            val saved = it.arguments[0] as OcrComparison
            saved.id = 11 // Mock generated ID
            saved
        }

        val result = ocrService.scanReceipt(fakeBytes, filename)

        assertEquals(45.50, result["amount"])
        assertEquals("2024-02-15", result["date"])
        assertEquals("Starbucks", result["merchant"])
        assertEquals(11, result["comparison_id"])

        verify(ocrComparisonRepository).save(any(OcrComparison::class.java))
    }

    @Test
    fun `scanReceipt should resolve currency and raw text from linked expense when hit cache`() {
        val expense = Expense(
            id = 5,
            amountOriginal = BigDecimal("15.00"),
            currencyOriginal = "RON",
            amountEur = BigDecimal("3.00"),
            fxRate = BigDecimal("0.20"),
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
            provider = "gemini-3.1-flash-lite",
            sha256 = sha256,
            geminiAmount = BigDecimal("15.00"),
            geminiDate = "2024-03-01",
            geminiMerchant = "KFC",
            expense = expense,
            createdAt = Instant.now()
        )

        `when`(ocrComparisonRepository.findBestCachedComparison(sha256))
            .thenReturn(listOf(cachedComparison))

        `when`(ocrComparisonRepository.save(any(OcrComparison::class.java))).thenAnswer {
            val saved = it.arguments[0] as OcrComparison
            saved.id = 21
            saved
        }

        val result = ocrService.scanReceipt(fakeBytes, filename)

        assertEquals(15.0, result["amount"])
        assertEquals("RON", result["currency"])
        assertEquals(2.4, result["tax_amount"])
        assertEquals(19.0, result["tax_rate"])
        assertEquals("KFC", result["merchant"])
        assertEquals("Lunch meeting", result["description"])
        assertEquals("KFC ROMANIA TOTAL 15.00 RON", result["raw_text"])
        assertEquals(21, result["comparison_id"])
    }

    @Test
    fun `scanReceipt falls back to the next Gemini model tier when the first one fails`() {
        `when`(ocrComparisonRepository.findBestCachedComparison(sha256)).thenReturn(emptyList())
        `when`(ocrComparisonRepository.save(any(OcrComparison::class.java))).thenAnswer {
            val saved = it.arguments[0] as OcrComparison
            saved.id = 30
            saved
        }

        val spyService = spy(ocrService)
        val categories = emptyList<Category>()
        doThrow(RuntimeException("rate limited"))
            .`when`(spyService).scanGemini(fakeBytes, filename, "test-key", categories, "gemini-3.1-flash-lite")
        doReturn(geminiResult(12.5, "Test Merchant", "2024-05-01"))
            .`when`(spyService).scanGemini(fakeBytes, filename, "test-key", categories, "gemini-3.5-flash")

        val result = spyService.scanReceipt(fakeBytes, filename)

        assertEquals(12.5, result["amount"])
        assertEquals("Test Merchant", result["merchant"])
        verify(spyService).scanGemini(fakeBytes, filename, "test-key", categories, "gemini-3.1-flash-lite")
        verify(spyService).scanGemini(fakeBytes, filename, "test-key", categories, "gemini-3.5-flash")
        verify(spyService, never()).scanGemini(fakeBytes, filename, "test-key", categories, "gemini-3-flash")
    }

    @Test
    fun `scanReceipt persists the last error when all Gemini model tiers are exhausted`() {
        `when`(ocrComparisonRepository.findBestCachedComparison(sha256)).thenReturn(emptyList())
        `when`(ocrComparisonRepository.save(any(OcrComparison::class.java))).thenAnswer {
            val saved = it.arguments[0] as OcrComparison
            saved.id = 40
            saved
        }

        val spyService = spy(ocrService)
        val categories = emptyList<Category>()
        for (tier in OcrService.GEMINI_FALLBACK_CHAIN) {
            doThrow(RuntimeException("tier $tier exhausted"))
                .`when`(spyService).scanGemini(fakeBytes, filename, "test-key", categories, tier)
        }

        val result = spyService.scanReceipt(fakeBytes, filename)

        assertNull(result["amount"])
        assertNotNull(result["provider_error"])
        for (tier in OcrService.GEMINI_FALLBACK_CHAIN) {
            verify(spyService).scanGemini(fakeBytes, filename, "test-key", categories, tier)
        }
        verify(ocrComparisonRepository).updateGeminiResult(eq(40), isNull(), isNull(), isNull(), isNull(), any())
    }
}
