package eu.nt.xpenses.services

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.dto.settings.OCRConfigUpdate
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.model.Category
import eu.nt.xpenses.model.OcrComparison
import eu.nt.xpenses.model.OcrResultCache
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrResultCacheRepository
import org.apache.pdfbox.Loader
import org.apache.pdfbox.rendering.PDFRenderer
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.awt.Color
import java.awt.Font
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.time.Instant
import java.util.Base64
import java.util.regex.Pattern
import javax.imageio.ImageIO

data class OCRProviderConfig(
    val id: String,
    val name: String,
    @JsonProperty("base_url") val baseUrl: String,
    @JsonProperty("api_key") var apiKey: String = "",
    @JsonProperty("api_key_set") var apiKeySet: Boolean = false,
)

data class OCRModelConfig(
    val id: String,
    @JsonProperty("provider_id") val providerId: String,
    @JsonProperty("model_id") val modelId: String,
    @JsonProperty("display_name") val displayName: String,
    var active: Boolean = false,
    var tested: Boolean = false,
)

data class OCRConfig(
    // Legacy fields are retained only to deserialize and migrate pre-catalog settings.
    var provider: String = "gemini-3.1-flash-lite",
    @JsonProperty("ocr_enabled") var ocrEnabled: Boolean = true,
    @JsonProperty("gemini_api_key") var geminiApiKey: String = "",
    @JsonProperty("password_set") var passwordSet: Boolean = false,
    val providers: List<OCRProviderConfig> = emptyList(),
    val models: List<OCRModelConfig> = emptyList(),
    @JsonProperty("receipt_model_chain") val receiptModelChain: List<String> = emptyList(),
    @JsonProperty("delegation_model_chain") val delegationModelChain: List<String> = emptyList(),
)

@Service
class OcrService(
    private val appSettingRepository: AppSettingRepository,
    private val categoryRepository: CategoryRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val ocrResultCacheRepository: OcrResultCacheRepository,
    private val cryptoService: CryptoService,
    private val objectMapper: ObjectMapper,
    private val transactionTemplate: TransactionTemplate,
    private val compatibleClient: OpenAiCompatibleClient,
) {
    private val log = LoggerFactory.getLogger(OcrService::class.java)

    companion object {
        const val CACHE_PROVIDER = "ai-compatible"
        const val CACHE_CONTRACT_VERSION = "2"

        private const val GEMINI_PROVIDER_ID = "google-gemini"
        private const val GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
        private val DEFAULT_GEMINI_MODELS =
            listOf(
                Triple("gemini-31-flash-lite", "gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite"),
                Triple("gemini-35-flash", "gemini-3.5-flash", "Gemini 3.5 Flash"),
                Triple("gemini-3-flash", "gemini-3-flash-preview", "Gemini 3 Flash"),
                Triple("gemini-25-flash", "gemini-2.5-flash", "Gemini 2.5 Flash"),
            )

        fun isValidOcrContent(bytes: ByteArray): Boolean {
            if (bytes.size < 4) return false
            val headerHex = bytes.take(8).joinToString("") { "%02X".format(it) }
            val isJpeg = headerHex.startsWith("FFD8FF")
            val isPng = headerHex.startsWith("89504E47")
            val isPdf = headerHex.startsWith("25504446")
            val isWebp = headerHex.startsWith("52494646") && bytes.size >= 12 && String(bytes.sliceArray(8..11)) == "WEBP"
            return isJpeg || isPng || isPdf || isWebp
        }
    }

    fun getOcrConfig(): OCRConfig {
        val setting = appSettingRepository.findById("ocr_config").orElse(null) ?: return defaultOcrConfig()
        return try {
            val root = objectMapper.readTree(setting.value)
            val parsed = objectMapper.treeToValue(root, OCRConfig::class.java)
            // Migration already decrypts the legacy token with its original key context.
            // Catalog tokens alone use the provider-specific context below.
            if (!root.has("providers")) return migrateLegacyConfig(parsed)
            val config = parsed
            val providers =
                config.providers.map { provider ->
                    val encryptedKey = provider.apiKey
                    if (encryptedKey.isBlank()) {
                        provider.copy(apiKey = "", apiKeySet = false)
                    } else {
                        try {
                            provider.copy(
                                apiKey = cryptoService.decrypt(encryptedKey, providerKeyInfo(provider.id)),
                                apiKeySet = true,
                            )
                        } catch (_: Exception) {
                            provider.copy(apiKey = "", apiKeySet = false)
                        }
                    }
                }
            config.copy(providers = providers, geminiApiKey = "", passwordSet = false)
        } catch (e: Exception) {
            log.warn("Unable to read OCR configuration; using defaults ({})", e.javaClass.simpleName)
            defaultOcrConfig()
        }
    }

    fun updateOcrConfig(update: OCRConfigUpdate): OCRConfig =
        transactionTemplate.execute {
            appSettingRepository.acquireOcrConfigLock()
            val previous = getOcrConfig()
            val updated =
                previous.copy(
                    provider = "",
                    geminiApiKey = "",
                    passwordSet = false,
                    ocrEnabled = update.ocrEnabled ?: previous.ocrEnabled,
                    providers =
                        update.providers?.map { input ->
                            val old = previous.providers.firstOrNull { it.id == input.id }
                            val key = input.apiKey?.takeUnless { it.isBlank() || it == "••••••••" } ?: old?.apiKey.orEmpty()
                            OCRProviderConfig(input.id, input.name, input.baseUrl, key, key.isNotBlank())
                        } ?: previous.providers,
                    models =
                        update.models?.map { input ->
                            val old = previous.models.firstOrNull { it.id == input.id }
                            OCRModelConfig(input.id, input.providerId, input.modelId, input.displayName, input.active, old?.tested == true)
                        } ?: previous.models,
                    receiptModelChain = update.receiptModelChain ?: previous.receiptModelChain,
                    delegationModelChain = update.delegationModelChain ?: previous.delegationModelChain,
                )
            validateConfig(updated)
            saveOcrConfigLocked(updated, previous)
            getOcrConfig()
        } ?: throw IllegalStateException("Unable to save OCR configuration")

    fun saveOcrConfig(config: OCRConfig) {
        validateConfig(config)
        transactionTemplate.executeWithoutResult {
            appSettingRepository.acquireOcrConfigLock()
            saveOcrConfigLocked(config, getOcrConfig())
        }
    }

    private fun saveOcrConfigLocked(
        config: OCRConfig,
        previous: OCRConfig,
    ) {
        require(config.providers.map { it.id }.containsAll(previous.providers.map { it.id })) {
            "Existing providers must be retained for historical references"
        }
        require(config.models.map { it.id }.containsAll(previous.models.map { it.id })) {
            "Deactivate existing models instead of deleting them"
        }
        val incomingProviders =
            config.providers.map { provider ->
                val old = previous.providers.firstOrNull { it.id == provider.id }
                val key = if (provider.apiKey.isBlank() && old != null) old.apiKey else provider.apiKey
                val changed = old != null && (old.baseUrl != provider.baseUrl || old.apiKey != key)
                provider.copy(apiKey = key, apiKeySet = key.isNotBlank()) to changed
            }
        val changedProviderIds = incomingProviders.filter { it.second }.map { it.first.id }.toSet()
        val providers = incomingProviders.map { it.first }
        val models =
            config.models.map { model ->
                val previousModel = previous.models.firstOrNull { it.id == model.id }
                val sameDefinition =
                    previousModel?.let {
                        it.providerId == model.providerId && it.modelId == model.modelId
                    } == true
                val providerChanged = model.providerId in changedProviderIds
                val tested = model.tested && previousModel?.tested == true && sameDefinition && !providerChanged
                val requiresRetest = previousModel != null && (!sameDefinition || providerChanged)
                model.copy(active = model.active && !requiresRetest, tested = tested)
            }
        val configToSave =
            config.copy(
                provider = "",
                geminiApiKey = "",
                passwordSet = false,
                providers = providers,
                models = models,
            )
        validateConfig(configToSave)
        persistOcrConfig(configToSave)
    }

    private fun persistOcrConfig(config: OCRConfig) {
        val encrypted =
            config.copy(
                providers =
                    config.providers.map { provider ->
                        provider.copy(
                            apiKey =
                                if (provider.apiKey.isBlank()) {
                                    ""
                                } else {
                                    cryptoService.encrypt(
                                        provider.apiKey,
                                        providerKeyInfo(provider.id),
                                    )
                                },
                            apiKeySet = false,
                        )
                    },
            )
        appSettingRepository.save(
            AppSetting("ocr_config", objectMapper.writeValueAsString(encrypted), Instant.now()),
        )
    }

    fun testModel(modelId: String): Map<String, Any> {
        val config = getOcrConfig()
        val model =
            config.models.firstOrNull { it.id == modelId }
                ?: return mapOf("success" to false, "message" to "Model not found")
        val provider =
            config.providers.firstOrNull { it.id == model.providerId }
                ?: return mapOf("success" to false, "message" to "Model provider not found")
        if (model.active) return mapOf("success" to false, "message" to "Deactivate the model before testing it")
        // Provider I/O deliberately runs without a configuration lock or transaction.
        val passed =
            try {
                val result = scanModel(syntheticReceipt(), "synthetic-receipt.png", provider, model, emptyList())
                val amount = (result["amount"] as? Number)?.toDouble()
                amount != null && amount.isFinite() && kotlin.math.abs(amount - 12.34) <= 0.02 &&
                    (result["merchant"] as? String).orEmpty().contains("test shop", ignoreCase = true) &&
                    result["date"] == "2025-01-15" && result["currency"] == "EUR"
            } catch (_: Exception) {
                log.warn("OCR model test failed for model {}", modelId)
                false
            }
        val applied =
            transactionTemplate.execute {
                appSettingRepository.acquireOcrConfigLock()
                val current = getOcrConfig()
                val currentModel = current.models.firstOrNull { it.id == modelId }
                val currentProvider = current.providers.firstOrNull { it.id == model.providerId }
                // A successful test must apply only to the exact definition and credential tested.
                if (currentModel == null || currentProvider == null || currentModel.active ||
                    currentModel.providerId != model.providerId || currentModel.modelId != model.modelId ||
                    currentProvider.baseUrl != provider.baseUrl || currentProvider.apiKey != provider.apiKey
                ) {
                    return@execute false
                }
                val updated =
                    current.copy(
                        models =
                            current.models.map {
                                if (it.id == modelId) it.copy(tested = passed, active = false) else it
                            },
                    )
                persistOcrConfig(updated)
                true
            } == true
        if (!applied) return mapOf("success" to false, "message" to "Model configuration changed during testing; test it again")
        return if (passed) {
            mapOf("success" to true, "message" to "Model passed the synthetic receipt test")
        } else {
            mapOf("success" to false, "message" to "Model did not return the expected synthetic receipt data")
        }
    }

    private fun providerKeyInfo(providerId: String) = "xpenses-ai-provider-$providerId"

    private fun defaultOcrConfig(apiKey: String = ""): OCRConfig {
        val configured = apiKey.isNotBlank()
        val models =
            DEFAULT_GEMINI_MODELS.map { (id, modelId, displayName) ->
                OCRModelConfig(id, GEMINI_PROVIDER_ID, modelId, displayName, active = configured, tested = configured)
            }
        val chain = models.map { it.id }
        return OCRConfig(
            providers = listOf(OCRProviderConfig(GEMINI_PROVIDER_ID, "Google Gemini", GEMINI_BASE_URL, apiKey, apiKey.isNotBlank())),
            models = models,
            receiptModelChain = chain,
            delegationModelChain = listOf(chain.first()),
        )
    }

    private fun migrateLegacyConfig(legacy: OCRConfig): OCRConfig {
        val apiKey =
            if (legacy.geminiApiKey.isBlank()) {
                ""
            } else {
                runCatching {
                    cryptoService.decrypt(legacy.geminiApiKey, "xpenses-gemini-ocr-pw")
                }.getOrDefault("")
            }
        val migrated = defaultOcrConfig(apiKey)
        val selectedModel =
            when (legacy.provider) {
                "gemini" -> "gemini-25-flash"
                "gemini-3-flash" -> "gemini-3-flash"
                "gemini-3.5-flash" -> "gemini-35-flash"
                "gemini-2.5-flash" -> "gemini-25-flash"
                else -> "gemini-31-flash-lite"
            }
        val receiptChain = listOf(selectedModel) + migrated.models.map { it.id }.filterNot { it == selectedModel }
        return migrated.copy(
            ocrEnabled = legacy.ocrEnabled,
            provider = "",
            geminiApiKey = "",
            passwordSet = apiKey.isNotBlank(),
            receiptModelChain = receiptChain,
            delegationModelChain = listOf(selectedModel),
        )
    }

    private fun validateConfig(config: OCRConfig) {
        require(
            config.providers
                .map { it.id }
                .distinct()
                .size == config.providers.size,
        ) { "Provider IDs must be unique" }
        require(
            config.models
                .map { it.id }
                .distinct()
                .size == config.models.size,
        ) { "Model IDs must be unique" }
        config.providers.forEach { provider ->
            require(provider.id.isNotBlank() && provider.name.isNotBlank()) { "Provider ID and name are required" }
            compatibleClient.validateBaseUrl(provider.baseUrl)
        }
        val providers = config.providers.map { it.id }.toSet()
        config.models.forEach { model ->
            require(model.id.isNotBlank() && model.modelId.isNotBlank() && model.displayName.isNotBlank()) {
                "Model ID, provider model ID, and display name are required"
            }
            require(model.providerId in providers) { "Every model must reference a configured provider" }
            require(!model.active || model.tested) { "A model must pass its test before activation" }
        }
        val modelIds = config.models.map { it.id }.toSet()
        (config.receiptModelChain + config.delegationModelChain).forEach { id ->
            require(id in modelIds) { "Model chains may only reference configured models" }
        }
        require(
            config.receiptModelChain.distinct().size == config.receiptModelChain.size,
        ) { "Receipt model chain cannot contain duplicates" }
        require(config.delegationModelChain.distinct().size == config.delegationModelChain.size) {
            "Delegation model chain cannot contain duplicates"
        }
    }

    private fun syntheticReceipt(): ByteArray {
        val image = BufferedImage(640, 300, BufferedImage.TYPE_INT_RGB)
        val graphics = image.createGraphics()
        graphics.color = Color.WHITE
        graphics.fillRect(0, 0, image.width, image.height)
        graphics.color = Color.BLACK
        graphics.font = Font("SansSerif", Font.BOLD, 30)
        graphics.drawString("SYNTHETIC RECEIPT", 30, 60)
        graphics.font = Font("SansSerif", Font.PLAIN, 25)
        graphics.drawString("TEST SHOP", 30, 115)
        graphics.drawString("TOTAL EUR 12.34", 30, 170)
        graphics.drawString("DATE 2025-01-15", 30, 225)
        graphics.dispose()
        return ByteArrayOutputStream().use { output ->
            ImageIO.write(image, "png", output)
            output.toByteArray()
        }
    }

    /**
     * The provider call intentionally runs outside a database transaction.
     * Only cache/comparison state transitions use short TransactionTemplate scopes.
     */
    fun scanReceipt(
        fileBytes: ByteArray,
        filename: String,
    ): Map<String, Any?> {
        val config = getOcrConfig()
        if (!config.ocrEnabled) {
            return emptyResult(listOf("OCR is disabled in settings"))
        }
        if (!isValidOcrContent(fileBytes)) {
            log.warn("Rejected OCR scan for {}: unsupported or invalid magic bytes", filename)
            return errorResult("Unsupported or invalid file format detected via magic bytes")
        }

        val models = orderedModels(config, config.receiptModelChain)
        if (models.isEmpty()) return errorResult("No tested, active receipt OCR models are configured")
        val categories = categoryRepository.findAllByIsActiveTrue()
        val sha256 = sha256(fileBytes)
        val cacheModel = cacheIdentity(config, models)
        val comparisonProvider = comparisonProvider(config, models.first())

        val preparation =
            transactionTemplate.execute {
                val cacheLockKey = "$sha256|$CACHE_PROVIDER|$cacheModel|$CACHE_CONTRACT_VERSION"
                ocrResultCacheRepository.acquireScanLock(cacheLockKey)

                val cachedResult =
                    ocrResultCacheRepository
                        .findBySha256AndProviderAndModelAndContractVersion(
                            sha256,
                            CACHE_PROVIDER,
                            cacheModel,
                            CACHE_CONTRACT_VERSION,
                        ).orElse(null)

                val cachedPreparation =
                    if (cachedResult != null) {
                        val cachedPayload =
                            try {
                                objectMapper
                                    .readValue(cachedResult.resultJson, Map::class.java)
                                    .toStringKeyedMap()
                            } catch (e: Exception) {
                                log.warn("Ignoring unreadable OCR cache entry {}: {}", cachedResult.id, e.message)
                                null
                            }

                        if (cachedPayload != null) {
                            val normalized = normalizeCachedResult(cachedPayload, categories)
                            cachedResult.lastUsedAt = Instant.now()
                            ocrResultCacheRepository.save(cachedResult)
                            val savedComparison = saveComparisonFromResult(filename, comparisonProvider, sha256, normalized)
                            ScanPreparation(
                                sha256 = sha256,
                                cacheModel = cacheModel,
                                comparisonId = savedComparison.id,
                                cachedResult = normalized,
                            )
                        } else {
                            null
                        }
                    } else {
                        null
                    }

                cachedPreparation ?: run {
                    val comparison =
                        OcrComparison(
                            receiptFilename = filename,
                            provider = comparisonProvider,
                            sha256 = sha256,
                            createdAt = Instant.now(),
                        )
                    val savedComparison =
                        try {
                            ocrComparisonRepository.save(comparison)
                        } catch (e: Exception) {
                            log.warn("Failed to pre-save OCR comparison record: {}", e.message)
                            null
                        }
                    ScanPreparation(
                        sha256 = sha256,
                        cacheModel = cacheModel,
                        comparisonId = savedComparison?.id,
                        cachedResult = null,
                    )
                }
            } ?: throw IllegalStateException("Unable to prepare OCR scan")

        preparation.cachedResult?.let { cached ->
            log.info("OCR result cache hit for hash: {}", sha256)
            return cached.toMutableMap().apply {
                preparation.comparisonId?.let { put("comparison_id", it) }
            }
        }

        val errors = mutableListOf<String>()
        val finalResult =
            models.firstNotNullOfOrNull { (provider, model) ->
                try {
                    val attempt = scanModel(fileBytes, filename, provider, model, categories)
                    if (isUsableOcrResult(attempt)) {
                        attempt + mapOf("provider_used" to provider.name, "model_used" to model.modelId)
                    } else {
                        errors.add("${model.displayName} returned no usable amount")
                        null
                    }
                } catch (e: Exception) {
                    errors.add("${model.displayName} failed to return a valid OCR result")
                    log.warn("OCR model attempt failed for {}", model.id)
                    null
                }
            }

        val result = finalResult ?: errorResult(errors.joinToString("; ").ifBlank { "All configured OCR models failed" })
        transactionTemplate.execute {
            preparation.comparisonId?.let { comparisonId ->
                updateGeminiComparison(comparisonId, result)
                if (isUsableOcrResult(result)) saveCacheResult(sha256, cacheModel, result)
            }
        }

        return result.toMutableMap().apply {
            preparation.comparisonId?.let { put("comparison_id", it) }
        }
    }

    private data class ScanPreparation(
        val sha256: String,
        val cacheModel: String,
        val comparisonId: Int?,
        val cachedResult: Map<String, Any?>?,
    )

    private fun updateGeminiComparison(
        id: Int,
        result: Map<String, Any?>,
    ) {
        try {
            val amount = (result["amount"] as? Number)?.let { BigDecimal.valueOf(it.toDouble()) }
            val date = result["date"] as? String
            val merchant = result["merchant"] as? String
            val categoryId = result["category_id"] as? Int
            val error = result["provider_error"] as? String
            val usedProvider = result["provider_used"]?.let { "$it/${result["model_used"]}".take(50) }
            ocrComparisonRepository.updateGeminiResult(id, amount, date, merchant, categoryId, error, usedProvider)
        } catch (e: Exception) {
            log.warn("Failed to update Gemini comparison record: {}", e.message)
        }
    }

    fun runModelChain(
        modelChain: List<String>,
        systemPrompt: String,
        userContent: Any?,
        isValidResponse: (String) -> Boolean,
    ): String? = runModelChain(getOcrConfig(), modelChain, systemPrompt, userContent, isValidResponse)

    fun runModelChain(
        config: OCRConfig,
        modelChain: List<String>,
        systemPrompt: String,
        userContent: Any?,
        isValidResponse: (String) -> Boolean,
    ): String? {
        for ((provider, model) in orderedModels(config, modelChain)) {
            try {
                val response = compatibleClient.complete(provider, model.modelId, systemPrompt, userContent)
                if (isValidResponse(response)) return response
                log.warn("AI model returned an invalid result: {}", model.id)
            } catch (e: Exception) {
                log.warn("AI model attempt failed for {} ({})", model.id, e.javaClass.simpleName)
            }
        }
        return null
    }

    private fun orderedModels(
        config: OCRConfig,
        modelChain: List<String>,
    ): List<Pair<OCRProviderConfig, OCRModelConfig>> {
        val providers = config.providers.associateBy { it.id }
        val models = config.models.associateBy { it.id }
        return modelChain.mapNotNull { id ->
            val model = models[id]?.takeIf { it.active && it.tested } ?: return@mapNotNull null
            val provider = providers[model.providerId] ?: return@mapNotNull null
            provider to model
        }
    }

    private fun cacheIdentity(
        config: OCRConfig,
        models: List<Pair<OCRProviderConfig, OCRModelConfig>>,
    ): String {
        val identity =
            models.joinToString("|") { (provider, model) ->
                "${provider.id}:${provider.baseUrl}:${model.modelId}"
            }
        return sha256(identity.toByteArray()).take(96)
    }

    private fun comparisonProvider(
        config: OCRConfig,
        model: Pair<OCRProviderConfig, OCRModelConfig>,
    ): String = "${model.first.name}/${model.second.modelId}".take(50)

    private fun sha256(bytes: ByteArray): String =
        java.security.MessageDigest
            .getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }

    private fun isUsableOcrResult(result: Map<String, Any?>): Boolean {
        val amount = (result["amount"] as? Number)?.toDouble() ?: return false
        val currency = result["currency"] as? String ?: return false
        return amount.isFinite() && Pattern.matches("^[A-Z]{3}$", currency)
    }

    internal fun scanModel(
        fileBytes: ByteArray,
        filename: String,
        provider: OCRProviderConfig,
        model: OCRModelConfig,
        categories: List<Category>,
    ): Map<String, Any?> {
        val extension = filename.substringAfterLast('.', "").lowercase()
        val mimeType =
            when (extension) {
                "png" -> "image/png"
                "webp" -> "image/webp"
                else -> "image/jpeg"
            }
        val categoryOptions = categories.joinToString(", ") { "${it.id}: ${it.name}" }
        val prompt =
            """
            Analyze this receipt, bill, invoice, or ticket. Return a JSON object with these keys:
            merchant (string), amount (number), currency (three-letter ISO code), tax_amount (number or null),
            tax_rate (number or null), date (YYYY-MM-DD or null), raw_text (full transcription),
            category_id (integer from [$categoryOptions] or null), and description (short human-friendly summary).
            Return null for fields that cannot be identified. The amount is required for a usable receipt result.
            """.trimIndent()
        val imagePages = if (extension == "pdf") renderPdfPages(fileBytes) else listOf(fileBytes to mimeType)
        val imageContent =
            buildList<Any> {
                add(mapOf("type" to "text", "text" to "Read the attached receipt document pages and extract the requested fields."))
                imagePages.forEach { (bytes, pageMimeType) ->
                    add(
                        mapOf(
                            "type" to "image_url",
                            "image_url" to mapOf("url" to "data:$pageMimeType;base64,${Base64.getEncoder().encodeToString(bytes)}"),
                        ),
                    )
                }
            }
        val textResponse = compatibleClient.complete(provider, model.modelId, prompt, imageContent)
        val result: Map<String, Any?> = objectMapper.readValue(textResponse)
        val warnings = mutableListOf<String>()
        val amount = (result["amount"] as? Number)?.toDouble()?.takeIf { it.isFinite() }
        if (amount == null) warnings.add("Could not extract amount")

        val extractedDate = result["date"] as? String
        val date = extractedDate?.takeIf { Pattern.matches("^\\d{4}-\\d{2}-\\d{2}$", it) }
        if (extractedDate != null && date == null) warnings.add("Extracted date format is invalid")
        if (date == null) warnings.add("Could not extract date")

        val merchant = result["merchant"] as? String
        if (merchant.isNullOrEmpty()) warnings.add("Could not extract merchant")
        val currency = (result["currency"] as? String)?.uppercase()?.trim()
        val taxAmount = (result["tax_amount"] as? Number)?.toDouble()
        val taxRate = (result["tax_rate"] as? Number)?.toDouble()
        val requestedCategoryId = (result["category_id"] as? Number)?.toInt()
        val categoryId = requestedCategoryId?.takeIf { id -> categories.any { it.id == id } }

        return mapOf(
            "amount" to amount,
            "currency" to currency,
            "tax_amount" to taxAmount,
            "tax_rate" to taxRate,
            "date" to date,
            "merchant" to merchant,
            "category_id" to categoryId,
            "description" to result["description"],
            "raw_text" to (result["raw_text"] ?: ""),
            "confidence" to 1.0,
            "warnings" to warnings,
        )
    }

    private fun renderPdfPages(pdfBytes: ByteArray): List<Pair<ByteArray, String>> {
        val document = Loader.loadPDF(pdfBytes)
        document.use { pdf ->
            val pageCount = minOf(pdf.numberOfPages, 5)
            if (pdf.numberOfPages > pageCount) log.warn("OCR PDF has {} pages; processing the first {}", pdf.numberOfPages, pageCount)
            val renderer = PDFRenderer(pdf)
            return (0 until pageCount).map { pageIndex ->
                val image = renderer.renderImage(pageIndex, 1f)
                val png =
                    ByteArrayOutputStream().use { output ->
                        ImageIO.write(image, "png", output)
                        output.toByteArray()
                    }
                png to "image/png"
            }
        }
    }

    private fun saveComparisonFromResult(
        filename: String,
        provider: String,
        sha256: String,
        result: Map<String, Any?>,
    ): OcrComparison =
        ocrComparisonRepository.save(
            OcrComparison(
                receiptFilename = filename,
                provider = listOfNotNull(result["provider_used"], result["model_used"]).joinToString("/").ifBlank { provider }.take(50),
                sha256 = sha256,
                geminiAmount = result["amount"].toBigDecimalOrNull(),
                geminiDate = result["date"]?.toString(),
                geminiMerchant = result["merchant"]?.toString(),
                geminiCategoryId = result["category_id"].toIntOrNull(),
            ),
        )

    private fun saveCacheResult(
        sha256: String,
        model: String,
        result: Map<String, Any?>,
    ) {
        val cache =
            OcrResultCache(
                sha256 = sha256,
                provider = CACHE_PROVIDER,
                model = model,
                contractVersion = CACHE_CONTRACT_VERSION,
                resultJson = objectMapper.writeValueAsString(result),
            )
        ocrResultCacheRepository.save(cache)
    }

    private fun normalizeCachedResult(
        payload: Map<String, Any?>,
        categories: List<Category>,
    ): Map<String, Any?> {
        val result = payload.toMutableMap()
        val categoryId = result["category_id"].toIntOrNull()
        if (categoryId != null && categories.none { it.id == categoryId }) {
            result["category_id"] = null
        }
        return result
    }

    private fun Any?.toIntOrNull(): Int? =
        when (this) {
            is Number -> toInt()
            is String -> toIntOrNull()
            else -> null
        }

    private fun Any?.toBigDecimalOrNull(): BigDecimal? =
        when (this) {
            is BigDecimal -> this
            is Number -> BigDecimal.valueOf(toDouble())
            is String -> runCatching { BigDecimal(this) }.getOrNull()
            else -> null
        }

    private fun Map<*, *>.toStringKeyedMap(): Map<String, Any?> = entries.associate { (key, value) -> key.toString() to value }

    private fun emptyResult(warnings: List<String>): Map<String, Any?> =
        mapOf(
            "amount" to null,
            "currency" to null,
            "tax_amount" to null,
            "tax_rate" to null,
            "date" to null,
            "merchant" to null,
            "category_id" to null,
            "description" to null,
            "raw_text" to "",
            "confidence" to 0.0,
            "warnings" to warnings,
        )

    private fun errorResult(error: String): Map<String, Any?> {
        val r = emptyResult(listOf(error)).toMutableMap()
        r["provider_error"] = error
        return r
    }
}
