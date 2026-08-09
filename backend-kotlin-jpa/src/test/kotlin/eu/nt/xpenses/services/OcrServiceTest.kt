package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.model.Category
import eu.nt.xpenses.model.OcrComparison
import eu.nt.xpenses.model.OcrResultCache
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrResultCacheRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.ArgumentMatchers.eq
import org.mockito.ArgumentMatchers.isNull
import org.mockito.Mockito.*
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.Optional

class OcrServiceTest {

    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val ocrResultCacheRepository = mock(OcrResultCacheRepository::class.java)
    private val cryptoService = mock(CryptoService::class.java)
    private val objectMapper = ObjectMapper().registerKotlinModule()
    private val transactionManager = mock(PlatformTransactionManager::class.java)
    private val transactionTemplate = TransactionTemplate(transactionManager)

    private val ocrService = OcrService(
        appSettingRepository,
        categoryRepository,
        ocrComparisonRepository,
        ocrResultCacheRepository,
        cryptoService,
        objectMapper,
        transactionTemplate
    )

    private val fakeBytes = "receipt image content".toByteArray()
    private val filename = "receipt.jpg"
    private lateinit var sha256: String

    @BeforeEach
    fun setup() {
        doReturn(mock(TransactionStatus::class.java)).`when`(transactionManager).getTransaction(any())
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        sha256 = digest.digest(fakeBytes).joinToString("") { "%02x".format(it) }

        val setting = AppSetting(
            key = "ocr_config",
            value = """{"provider":"gemini-3.1-flash-lite","ocr_enabled":true,"gemini_api_key":"test-key"}""",
            updatedAt = Instant.now()
        )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))
        `when`(categoryRepository.findAllByIsActiveTrue()).thenReturn(emptyList())
        `when`(cryptoService.decrypt(anyString(), anyString())).thenAnswer { it.arguments[0] }
        `when`(ocrResultCacheRepository.findBySha256AndProviderAndModelAndContractVersion(
            anyString(), anyString(), anyString(), anyString()
        )).thenReturn(Optional.empty())
        `when`(ocrComparisonRepository.save(any(OcrComparison::class.java))).thenAnswer {
            val saved = it.arguments[0] as OcrComparison
            saved.id = (saved.id ?: 10)
            saved
        }
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
    fun `scanReceipt reuses cache without calling provider and creates new comparison`() {
        val cachedPayload = geminiResult(45.50, "Starbucks", "2024-02-15")
        val cached = OcrResultCache(
            id = 7,
            sha256 = sha256,
            provider = OcrService.CACHE_PROVIDER,
            model = "gemini-3.1-flash-lite",
            contractVersion = OcrService.CACHE_CONTRACT_VERSION,
            resultJson = objectMapper.writeValueAsString(cachedPayload)
        )
        `when`(ocrResultCacheRepository.findBySha256AndProviderAndModelAndContractVersion(
            sha256, OcrService.CACHE_PROVIDER, "gemini-3.1-flash-lite", OcrService.CACHE_CONTRACT_VERSION
        )).thenReturn(Optional.of(cached))

        val result = ocrService.scanReceipt(fakeBytes, filename)

        assertEquals(45.5, result["amount"])
        assertEquals("2024-02-15", result["date"])
        assertEquals("Starbucks", result["merchant"])
        assertEquals(10, result["comparison_id"])
        verify(ocrResultCacheRepository).save(cached)
        verify(ocrComparisonRepository).save(any(OcrComparison::class.java))
        verify(ocrComparisonRepository, never()).findBestCachedComparison(anyString())
    }

    @Test
    fun `successful provider result is cached`() {
        val spyService = spy(ocrService)
        val result = geminiResult(12.5, "Test Merchant", "2024-05-01")
        doReturn(result).`when`(spyService).scanGemini(
            fakeBytes, filename, "test-key", emptyList(), "gemini-3.1-flash-lite"
        )

        val response = spyService.scanReceipt(fakeBytes, filename)

        assertEquals(12.5, response["amount"])
        verify(ocrResultCacheRepository).save(any(OcrResultCache::class.java))
        verify(ocrComparisonRepository).updateGeminiResult(eq(10), any(), eq("2024-05-01"), eq("Test Merchant"), isNull(), isNull())
    }

    @Test
    fun `provider failures are recorded but not cached`() {
        val spyService = spy(ocrService)
        for (tier in OcrService.GEMINI_FALLBACK_CHAIN) {
            doThrow(RuntimeException("tier $tier exhausted"))
                .`when`(spyService).scanGemini(fakeBytes, filename, "test-key", emptyList(), tier)
        }

        val result = spyService.scanReceipt(fakeBytes, filename)

        assertNull(result["amount"])
        assertNotNull(result["provider_error"])
        verify(ocrResultCacheRepository, never()).save(any(OcrResultCache::class.java))
        verify(ocrComparisonRepository).updateGeminiResult(eq(10), isNull(), isNull(), isNull(), isNull(), any())
    }
}
