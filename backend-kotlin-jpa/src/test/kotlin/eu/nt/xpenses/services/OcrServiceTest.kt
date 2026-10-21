package eu.nt.xpenses.services

import eu.nt.xpenses.dto.settings.OCRConfigUpdate
import eu.nt.xpenses.dto.settings.OCRProviderUpdate
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
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.jacksonMapperBuilder
import java.time.Instant
import java.util.Optional

class OcrServiceTest {
    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val categoryRepository = mock(CategoryRepository::class.java)
    private val ocrComparisonRepository = mock(OcrComparisonRepository::class.java)
    private val ocrResultCacheRepository = mock(OcrResultCacheRepository::class.java)
    private val cryptoService = mock(CryptoService::class.java)
    private val compatibleClient = mock(OpenAiCompatibleClient::class.java)
    private val objectMapper = jacksonMapperBuilder().build()
    private val transactionManager = mock(PlatformTransactionManager::class.java)
    private val transactionTemplate = TransactionTemplate(transactionManager)

    private val ocrService =
        OcrService(
            appSettingRepository,
            categoryRepository,
            ocrComparisonRepository,
            ocrResultCacheRepository,
            cryptoService,
            objectMapper,
            transactionTemplate,
            compatibleClient,
        )

    private val fakeBytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) + "receipt image content".toByteArray()
    private val filename = "receipt.jpg"
    private lateinit var sha256: String

    @BeforeEach
    fun setup() {
        doReturn(mock(TransactionStatus::class.java)).`when`(transactionManager).getTransaction(any())
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        sha256 = digest.digest(fakeBytes).joinToString("") { "%02x".format(it) }

        val setting =
            AppSetting(
                key = "ocr_config",
                value = """{"provider":"gemini-3.1-flash-lite","ocr_enabled":true,"gemini_api_key":"test-key"}""",
                updatedAt = Instant.now(),
            )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))
        `when`(categoryRepository.findAllByIsActiveTrue()).thenReturn(emptyList())
        `when`(cryptoService.decrypt(anyString(), anyString())).thenAnswer { it.arguments[0] }
        `when`(cryptoService.encrypt(anyString(), anyString())).thenReturn("opaque-encrypted-value")
        `when`(
            ocrResultCacheRepository.findBySha256AndProviderAndModelAndContractVersion(
                anyString(),
                anyString(),
                anyString(),
                anyString(),
            ),
        ).thenReturn(Optional.empty())
        `when`(ocrComparisonRepository.save(any(OcrComparison::class.java))).thenAnswer {
            val saved = it.arguments[0] as OcrComparison
            saved.id = (saved.id ?: 10)
            saved
        }
    }

    private fun geminiResult(
        amount: Double?,
        merchant: String?,
        date: String?,
    ): Map<String, Any?> =
        mapOf(
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
            "warnings" to emptyList<String>(),
        )

    @Test
    fun `legacy Gemini settings migrate into the compatible provider catalog`() {
        val config = ocrService.getOcrConfig()

        assertEquals("https://generativelanguage.googleapis.com/v1beta/openai", config.providers.single().baseUrl)
        assertEquals("test-key", config.providers.single().apiKey)
        assertEquals("gemini-31-flash-lite", config.receiptModelChain.first())
        assertEquals(4, config.receiptModelChain.size)
        assertEquals(listOf("gemini-31-flash-lite"), config.delegationModelChain)
        assertTrue(config.models.all { it.active && it.tested })
    }

    @Test
    fun `legacy encrypted credentials survive migration and catalog save read roundtrip`() {
        val realCrypto = CryptoService("jwt-secret-for-test", "different-encryption-secret-for-test")
        var stored =
            AppSetting(
                key = "ocr_config",
                value =
                    objectMapper.writeValueAsString(
                        OCRConfig(
                            geminiApiKey = realCrypto.encrypt("synthetic-private-key", "xpenses-gemini-ocr-pw"),
                        ),
                    ),
            )
        // Legacy persisted configuration does not contain a catalog.
        stored.value =
            objectMapper.readTree(stored.value).let { root ->
                (root as tools.jackson.databind.node.ObjectNode).remove(
                    listOf("providers", "models", "receipt_model_chain", "delegation_model_chain"),
                )
                root.toString()
            }
        `when`(appSettingRepository.findById("ocr_config")).thenAnswer { Optional.of(stored) }
        doAnswer { invocation ->
            stored = invocation.arguments[0] as AppSetting
            stored
        }.`when`(appSettingRepository).save(any(AppSetting::class.java))
        val service =
            OcrService(
                appSettingRepository,
                categoryRepository,
                ocrComparisonRepository,
                ocrResultCacheRepository,
                realCrypto,
                objectMapper,
                transactionTemplate,
                compatibleClient,
            )

        val migrated = service.getOcrConfig()
        assertEquals("synthetic-private-key", migrated.providers.single().apiKey)
        assertTrue(migrated.providers.single().apiKeySet)
        service.saveOcrConfig(migrated)

        assertFalse(stored.value.contains("synthetic-private-key"))
        assertEquals(
            "synthetic-private-key",
            service
                .getOcrConfig()
                .providers
                .single()
                .apiKey,
        )
        assertTrue(
            service
                .getOcrConfig()
                .providers
                .single()
                .apiKeySet,
        )
    }

    @Test
    fun `successful model label is bounded to comparison database column length`() {
        val setting =
            AppSetting(
                "ocr_config",
                """{
            "providers":[{"id":"p","name":"A very long compatible provider display name exceeding normal sizes","base_url":"https://8.8.8.8/v1"}],
            "models":[{"id":"m","provider_id":"p","model_id":"a-long-model-identifier-also-exceeding-fifty-characters","display_name":"Vision","active":true,"tested":true}],
            "receipt_model_chain":["m"]
        }""",
            )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))
        doReturn(objectMapper.writeValueAsString(geminiResult(12.5, "Shop", "2024-05-01")))
            .`when`(
                compatibleClient,
            ).complete(
                any(OCRProviderConfig::class.java) ?: OCRProviderConfig("p", "p", "https://8.8.8.8/v1"),
                anyString(),
                anyString(),
                any<Any?>(),
            )

        ocrService.scanReceipt(fakeBytes, filename)

        val label = org.mockito.ArgumentCaptor.forClass(String::class.java)
        verify(ocrComparisonRepository).updateGeminiResult(eq(10), any(), anyString(), eq("Shop"), isNull(), isNull(), label.capture())
        assertEquals(50, label.value.length)
    }

    @Test
    fun `saving provider credentials stores only encrypted key material`() {
        val config = ocrService.getOcrConfig()
        val updated =
            config.copy(
                providers = config.providers.map { it.copy(apiKey = "new-private-key") },
                models = config.models.map { it.copy(active = false, tested = false) },
            )

        ocrService.saveOcrConfig(updated)

        val saved = org.mockito.ArgumentCaptor.forClass(AppSetting::class.java)
        verify(appSettingRepository).save(saved.capture())
        assertFalse(saved.value.value.contains("new-private-key"), saved.value.value)
        assertTrue(saved.value.value.contains("opaque-encrypted-value"))
    }

    @Test
    fun `saving an active model without a successful test is rejected`() {
        val config = ocrService.getOcrConfig()
        val untested =
            config.copy(
                models =
                    config.models.mapIndexed { index, model ->
                        model.copy(active = index == 0, tested = false)
                    },
            )

        assertThrows(IllegalArgumentException::class.java) { ocrService.saveOcrConfig(untested) }
    }

    @Test
    fun `model activation test marks an inactive model tested only after extracting expected receipt data`() {
        val setting =
            AppSetting(
                key = "ocr_config",
                value = """{
                "ocr_enabled": true,
                "providers": [{"id":"provider-1","name":"Provider One","base_url":"https://8.8.8.8/v1","api_key":""}],
                "models": [{"id":"model-1","provider_id":"provider-1","model_id":"vision-v2","display_name":"Vision V2","active":false,"tested":false}],
                "receipt_model_chain": ["model-1"],
                "delegation_model_chain": ["model-1"]
            }""",
                updatedAt = Instant.now(),
            )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))
        `when`(compatibleClient.validateBaseUrl(anyString())).thenReturn(java.net.URI("https://8.8.8.8/v1/chat/completions"))
        val resultJson = objectMapper.writeValueAsString(geminiResult(12.34, "Test Shop", "2025-01-15"))
        `when`(
            compatibleClient.complete(
                any(OCRProviderConfig::class.java) ?: OCRProviderConfig("provider", "provider", "https://api.example.com/v1"),
                anyString(),
                anyString(),
                any<Any?>(),
            ),
        ).thenReturn(resultJson)
        var savedSetting: AppSetting? = null
        doAnswer { invocation ->
            savedSetting = invocation.arguments[0] as AppSetting
            savedSetting
        }.`when`(appSettingRepository).save(any(AppSetting::class.java))

        val result = ocrService.testModel("model-1")

        assertEquals(true, result["success"])
        val savedModels = objectMapper.readTree(requireNotNull(savedSetting).value)["models"]
        assertTrue(savedModels[0]["tested"].asBoolean())
        assertFalse(savedModels[0]["active"].asBoolean())
    }

    private fun inactiveModelSetting(tested: Boolean = false) =
        AppSetting(
            "ocr_config",
            """{
        "ocr_enabled":true,
        "providers":[{"id":"p","name":"Provider","base_url":"https://8.8.8.8/v1"}],
        "models":[{"id":"m","provider_id":"p","model_id":"vision","display_name":"Vision","active":false,"tested":$tested}],
        "receipt_model_chain":[],"delegation_model_chain":[]
    }""",
        )

    @Test
    fun `settings patch retains latest stored key when blank key is submitted`() {
        val config = objectMapper.readValue(inactiveModelSetting(tested = true).value, OCRConfig::class.java)
        val stored =
            AppSetting(
                "ocr_config",
                objectMapper.writeValueAsString(
                    config.copy(providers = config.providers.map { it.copy(apiKey = "latest-rotated-key") }),
                ),
            )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(stored))
        val update =
            OCRConfigUpdate(
                ocrEnabled = false,
                providers = listOf(OCRProviderUpdate("p", "Renamed provider", "https://8.8.8.8/v1", "")),
            )

        ocrService.updateOcrConfig(update)

        verify(appSettingRepository).acquireOcrConfigLock()
        verify(cryptoService).encrypt("latest-rotated-key", "xpenses-ai-provider-p")
        val saved = org.mockito.ArgumentCaptor.forClass(AppSetting::class.java)
        verify(appSettingRepository).save(saved.capture())
        val json = objectMapper.readTree(saved.value.value)
        assertFalse(json["ocr_enabled"].asBoolean())
        assertEquals("Renamed provider", json["providers"][0]["name"].asText())
        assertTrue(json["models"][0]["tested"].asBoolean())
    }

    @Test
    fun `successful test merges only tested flag without overwriting settings changed during provider request`() {
        var stored = inactiveModelSetting()
        `when`(appSettingRepository.findById("ocr_config")).thenAnswer { Optional.of(stored) }
        doAnswer { invocation ->
            stored = invocation.arguments[0] as AppSetting
            stored
        }.`when`(appSettingRepository).save(any(AppSetting::class.java))
        doAnswer {
            val newer =
                ocrService.getOcrConfig().copy(
                    ocrEnabled = false,
                    delegationModelChain = listOf("m"),
                    models = ocrService.getOcrConfig().models.map { it.copy(displayName = "Renamed while testing") },
                )
            stored = AppSetting("ocr_config", objectMapper.writeValueAsString(newer))
            objectMapper.writeValueAsString(geminiResult(12.34, "Test Shop", "2025-01-15"))
        }.`when`(
            compatibleClient,
        ).complete(
            any(OCRProviderConfig::class.java) ?: OCRProviderConfig("p", "p", "https://8.8.8.8/v1"),
            anyString(),
            anyString(),
            any<Any?>(),
        )

        assertEquals(true, ocrService.testModel("m")["success"])

        val current = ocrService.getOcrConfig()
        assertFalse(current.ocrEnabled)
        assertEquals(listOf("m"), current.delegationModelChain)
        assertEquals("Renamed while testing", current.models.single().displayName)
        assertTrue(current.models.single().tested)
        verify(appSettingRepository).acquireOcrConfigLock()
    }

    @Test
    fun `test result is discarded when provider credential changes during request`() {
        var stored = inactiveModelSetting()
        `when`(appSettingRepository.findById("ocr_config")).thenAnswer { Optional.of(stored) }
        doAnswer {
            val newer =
                ocrService.getOcrConfig().copy(
                    providers = ocrService.getOcrConfig().providers.map { it.copy(apiKey = "rotated-key") },
                )
            stored = AppSetting("ocr_config", objectMapper.writeValueAsString(newer))
            objectMapper.writeValueAsString(geminiResult(12.34, "Test Shop", "2025-01-15"))
        }.`when`(
            compatibleClient,
        ).complete(
            any(OCRProviderConfig::class.java) ?: OCRProviderConfig("p", "p", "https://8.8.8.8/v1"),
            anyString(),
            anyString(),
            any<Any?>(),
        )

        val response = ocrService.testModel("m")

        assertEquals(false, response["success"])
        assertEquals(
            "rotated-key",
            ocrService
                .getOcrConfig()
                .providers
                .single()
                .apiKey,
        )
        assertFalse(
            ocrService
                .getOcrConfig()
                .models
                .single()
                .tested,
        )
        verify(appSettingRepository, never()).save(any(AppSetting::class.java))
    }

    @Test
    fun `failed retest revokes previous successful test and redacts provider errors`() {
        var stored = inactiveModelSetting(tested = true)
        `when`(appSettingRepository.findById("ocr_config")).thenAnswer { Optional.of(stored) }
        doAnswer { invocation ->
            stored = invocation.arguments[0] as AppSetting
            stored
        }.`when`(appSettingRepository).save(any(AppSetting::class.java))
        doThrow(IllegalStateException("provider echoed secret-api-key"))
            .`when`(
                compatibleClient,
            ).complete(
                any(OCRProviderConfig::class.java) ?: OCRProviderConfig("p", "p", "https://8.8.8.8/v1"),
                anyString(),
                anyString(),
                any<Any?>(),
            )

        val response = ocrService.testModel("m")

        assertEquals(false, response["success"])
        assertFalse(response.toString().contains("secret-api-key"))
        assertFalse(
            ocrService
                .getOcrConfig()
                .models
                .single()
                .tested,
        )
        assertFalse(
            ocrService
                .getOcrConfig()
                .models
                .single()
                .active,
        )
    }

    @Test
    fun `catalog save refuses deletion of existing models`() {
        val config = ocrService.getOcrConfig()
        assertThrows(IllegalArgumentException::class.java) {
            ocrService.saveOcrConfig(config.copy(models = config.models.dropLast(1), receiptModelChain = emptyList()))
        }
    }

    @Test
    fun `OCR settings expose configurable providers models and independent model chains`() {
        val setting =
            AppSetting(
                key = "ocr_config",
                value = """{
                "ocr_enabled": true,
                "providers": [{"id":"provider-1","name":"Provider One","base_url":"https://api.example.com/v1","api_key":"encrypted-key"}],
                "models": [
                    {"id":"model-1","provider_id":"provider-1","model_id":"vision-v2","display_name":"Vision V2","active":true,"tested":true},
                    {"id":"model-2","provider_id":"provider-1","model_id":"text-v2","display_name":"Text V2","active":true,"tested":true}
                ],
                "receipt_model_chain": ["model-1"],
                "delegation_model_chain": ["model-2"]
            }""",
                updatedAt = Instant.now(),
            )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))

        val config = ocrService.getOcrConfig()
        val serialized = objectMapper.valueToTree<tools.jackson.databind.JsonNode>(config)

        assertEquals("https://api.example.com/v1", serialized["providers"][0]["base_url"].asText())
        assertEquals("encrypted-key", serialized["providers"][0]["api_key"].asText())
        assertEquals("vision-v2", serialized["models"][0]["model_id"].asText())
        assertEquals("model-1", serialized["receipt_model_chain"][0].asText())
        assertEquals("model-2", serialized["delegation_model_chain"][0].asText())
    }

    @Test
    fun `delegation model chain falls back independently from receipt chain`() {
        val setting =
            AppSetting(
                key = "ocr_config",
                value = """{
                "ocr_enabled": true,
                "providers": [{"id":"provider-1","name":"Provider One","base_url":"https://8.8.8.8/v1","api_key":""}],
                "models": [
                    {"id":"receipt-model","provider_id":"provider-1","model_id":"vision-v2","display_name":"Vision V2","active":true,"tested":true},
                    {"id":"email-primary","provider_id":"provider-1","model_id":"email-v1","display_name":"Email V1","active":true,"tested":true},
                    {"id":"email-fallback","provider_id":"provider-1","model_id":"email-v2","display_name":"Email V2","active":true,"tested":true}
                ],
                "receipt_model_chain": ["receipt-model"],
                "delegation_model_chain": ["email-primary","email-fallback"]
            }""",
                updatedAt = Instant.now(),
            )
        `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))
        val attempted = mutableListOf<String>()
        doAnswer { invocation ->
            val modelId = invocation.arguments[1] as String
            attempted.add(modelId)
            if (attempted.size == 1) "not-json" else "{\"date_from\":\"2025-01-01\",\"date_to\":\"2025-01-02\"}"
        }.`when`(compatibleClient).complete(
            any(OCRProviderConfig::class.java) ?: OCRProviderConfig("provider", "provider", "https://api.example.com/v1"),
            anyString(),
            anyString(),
            any<Any?>(),
        )

        val response =
            ocrService.runModelChain(
                ocrService.getOcrConfig().delegationModelChain,
                "Parse delegation email",
                "synthetic email",
            ) { content -> runCatching { objectMapper.readTree(content)["date_from"].asText() }.getOrNull() == "2025-01-01" }

        assertEquals(listOf("email-v1", "email-v2"), attempted)
        assertTrue(response?.contains("2025-01-01") == true)
    }

    @Test
    fun `scanReceipt reuses cache without calling provider and creates new comparison`() {
        val cachedPayload = geminiResult(45.50, "Starbucks", "2024-02-15")
        val cached =
            OcrResultCache(
                id = 7,
                sha256 = sha256,
                provider = OcrService.CACHE_PROVIDER,
                model = "unused-cache-identity",
                contractVersion = OcrService.CACHE_CONTRACT_VERSION,
                resultJson = objectMapper.writeValueAsString(cachedPayload),
            )
        `when`(
            ocrResultCacheRepository.findBySha256AndProviderAndModelAndContractVersion(
                anyString(),
                anyString(),
                anyString(),
                anyString(),
            ),
        ).thenReturn(Optional.of(cached))

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
        val result = geminiResult(12.5, "Test Merchant", "2024-05-01")
        `when`(
            compatibleClient.complete(
                any(OCRProviderConfig::class.java) ?: OCRProviderConfig("provider", "provider", "https://api.example.com/v1"),
                anyString(),
                anyString(),
                any<Any?>(),
            ),
        ).thenReturn(objectMapper.writeValueAsString(result))

        val response = ocrService.scanReceipt(fakeBytes, filename)

        assertEquals(12.5, response["amount"])
        verify(ocrResultCacheRepository).save(any(OcrResultCache::class.java))
        verify(ocrComparisonRepository).updateGeminiResult(
            eq(10),
            any(),
            eq("2024-05-01"),
            eq("Test Merchant"),
            isNull(),
            isNull(),
            eq("Google Gemini/gemini-3.1-flash-lite"),
        )
    }

    @Test
    fun `receipt OCR falls back in configured order when a model returns unusable JSON`() {
        val attemptedModels = mutableListOf<String>()
        val unusable = objectMapper.writeValueAsString(geminiResult(null, null, null))
        val usable = objectMapper.writeValueAsString(geminiResult(12.5, "Fallback Shop", "2024-05-01"))
        doAnswer { invocation ->
            val modelId = invocation.arguments[1] as String
            attemptedModels.add(modelId)
            if (attemptedModels.size == 1) unusable else usable
        }.`when`(compatibleClient).complete(
            any(OCRProviderConfig::class.java) ?: OCRProviderConfig("provider", "provider", "https://api.example.com/v1"),
            anyString(),
            anyString(),
            any<Any?>(),
        )

        val result = ocrService.scanReceipt(fakeBytes, filename)

        assertEquals(listOf("gemini-3.1-flash-lite", "gemini-3.5-flash"), attemptedModels)
        assertEquals(12.5, result["amount"])
        assertEquals("Fallback Shop", result["merchant"])
        assertEquals("gemini-3.5-flash", result["model_used"])
    }

    @Test
    fun `receipt OCR falls back when a result omits required currency`() {
        val attemptedModels = mutableListOf<String>()
        val missingCurrency =
            geminiResult(12.5, "Incomplete Shop", "2024-05-01").toMutableMap().apply {
                this["currency"] = null
            }
        val valid = geminiResult(12.5, "Fallback Shop", "2024-05-01")
        doAnswer { invocation ->
            val modelId = invocation.arguments[1] as String
            attemptedModels.add(modelId)
            objectMapper.writeValueAsString(if (attemptedModels.size == 1) missingCurrency else valid)
        }.`when`(compatibleClient).complete(
            any(OCRProviderConfig::class.java) ?: OCRProviderConfig("provider", "provider", "https://api.example.com/v1"),
            anyString(),
            anyString(),
            any<Any?>(),
        )

        val result = ocrService.scanReceipt(fakeBytes, filename)

        assertEquals(listOf("gemini-3.1-flash-lite", "gemini-3.5-flash"), attemptedModels)
        assertEquals("Fallback Shop", result["merchant"])
        assertEquals("EUR", result["currency"])
    }

    @Test
    fun `provider failures are recorded but not cached`() {
        `when`(
            compatibleClient.complete(
                any(OCRProviderConfig::class.java) ?: OCRProviderConfig("provider", "provider", "https://api.example.com/v1"),
                anyString(),
                anyString(),
                any<Any?>(),
            ),
        ).thenThrow(RuntimeException("provider echoed secret-api-key"))

        val result = ocrService.scanReceipt(fakeBytes, filename)

        assertNull(result["amount"])
        assertNotNull(result["provider_error"])
        assertFalse(result.toString().contains("secret-api-key"))
        verify(compatibleClient, times(4)).complete(
            any(OCRProviderConfig::class.java) ?: OCRProviderConfig("provider", "provider", "https://api.example.com/v1"),
            anyString(),
            anyString(),
            any<Any?>(),
        )
        verify(ocrResultCacheRepository, never()).save(any(OcrResultCache::class.java))
        verify(ocrComparisonRepository).updateGeminiResult(eq(10), isNull(), isNull(), isNull(), isNull(), any(), isNull())
    }

    @Test
    fun `scanReceipt rejects files with invalid magic bytes without calling provider`() {
        val badBytes = "plain text without magic bytes".toByteArray()
        val result = ocrService.scanReceipt(badBytes, "bad.jpg")

        assertNull(result["amount"])
        assertEquals("Unsupported or invalid file format detected via magic bytes", result["provider_error"])
        verify(ocrResultCacheRepository, never()).acquireScanLock(anyString())
    }
}
