package eu.nt.xpenses.services

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.model.OcrComparison
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import org.springframework.http.HttpEntity
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import org.springframework.http.client.JdkClientHttpRequestFactory
import java.net.http.HttpClient
import org.slf4j.LoggerFactory
import java.io.File
import java.math.BigDecimal
import java.time.Instant
import java.util.*
import java.time.Duration
import java.util.regex.Pattern

data class OCRConfig(
    var provider: String = "gemini-3.1-flash-lite",
    @JsonProperty("ocr_enabled") var ocrEnabled: Boolean = true,
    @JsonProperty("gemini_api_key") var geminiApiKey: String = "",
    @JsonProperty("password_set") var passwordSet: Boolean = false
)

@Service
class OcrService(
    private val appSettingRepository: AppSettingRepository,
    private val categoryRepository: CategoryRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val cryptoService: CryptoService,
    private val objectMapper: ObjectMapper
) {
    private val log = LoggerFactory.getLogger(OcrService::class.java)

    companion object {
        // Tried in order; the first tier to return a parseable, non-empty result wins.
        val GEMINI_FALLBACK_CHAIN = listOf(
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash",
            "gemini-3-flash",
            "gemini-2.5-flash"
        )
    }
    // Force HTTP/1.1: the JDK HttpClient defaults to an HTTP/1.1->HTTP/2 (h2c) upgrade on plain
    // HTTP, which some receiving servers reject. Pin to HTTP/1.1 for compatibility.
    private val restClient = RestClient.builder()
        .requestFactory(JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build()
        ).also { it.setReadTimeout(Duration.ofSeconds(60)) })
        .build()

    fun getOcrConfig(): OCRConfig {
        val setting = appSettingRepository.findById("ocr_config").orElse(null)
            ?: return OCRConfig(provider = "gemini-3.1-flash-lite", ocrEnabled = true)
        
        return try {
            val config: OCRConfig = objectMapper.readValue(setting.value)
            val encryptedKey = config.geminiApiKey
            if (encryptedKey.isNotEmpty()) {
                try {
                    config.geminiApiKey = cryptoService.decrypt(encryptedKey, "xpenses-gemini-ocr-pw")
                    config.passwordSet = true
                } catch (e: Exception) {
                    config.geminiApiKey = ""
                    config.passwordSet = false
                }
            }
            config
        } catch (e: Exception) {
            OCRConfig(provider = "gemini-3.1-flash-lite", ocrEnabled = true)
        }
    }

    fun saveOcrConfig(config: OCRConfig) {
        val encryptedKey = if (config.geminiApiKey.isNotEmpty()) {
            cryptoService.encrypt(config.geminiApiKey, "xpenses-gemini-ocr-pw")
        } else {
            ""
        }
        val configToSave = config.copy(geminiApiKey = encryptedKey)
        val jsonValue = objectMapper.writeValueAsString(configToSave)
        
        val setting = AppSetting(
            key = "ocr_config",
            value = jsonValue,
            updatedAt = Instant.now()
        )
        appSettingRepository.save(setting)
    }

    fun testGeminiConnection(apiKey: String, provider: String = "gemini"): Map<String, Any> {
        val modelName = geminiModelName(provider)
        val url = "https://generativelanguage.googleapis.com/v1beta/models/${modelName}"
        return try {
            val response = restClient.get()
                .uri(url)
                .header("x-goog-api-key", apiKey)
                .retrieve()
                .toEntity(String::class.java)
            if (response.statusCode.is2xxSuccessful) {
                mapOf("success" to true, "message" to "Gemini API connection successful!")
            } else {
                mapOf("success" to false, "message" to "Gemini API error: ${response.body}")
            }
        } catch (e: Exception) {
            mapOf("success" to false, "message" to "Connection test failed: ${e.message}")
        }
    }

    fun scanReceipt(fileBytes: ByteArray, filename: String): Map<String, Any?> {
        val config = getOcrConfig()
        if (!config.ocrEnabled) {
            return emptyResult(listOf("OCR is disabled in settings"))
        }
        if (config.geminiApiKey.isEmpty()) {
            return errorResult("Gemini API key not configured")
        }

        val categories = categoryRepository.findAllByIsActiveTrue()

        // Calculate SHA-256 of the receipt bytes
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(fileBytes)
        val sha256 = hashBytes.joinToString("") { "%02x".format(it) }

        // Try to find the best existing comparison with this hash (preferring linked expenses or populated records)
        val cachedComparison = ocrComparisonRepository.findBestCachedComparison(sha256).firstOrNull()

        if (cachedComparison != null) {
            val isPopulated = cachedComparison.geminiAmount != null || cachedComparison.geminiDate != null ||
                cachedComparison.geminiMerchant != null || cachedComparison.geminiCategoryId != null

            if (isPopulated) {
                log.info("OCR cache hit for hash: {}", sha256)
                val newComparison = OcrComparison(
                    receiptFilename = filename,
                    provider = config.provider,
                    sha256 = sha256,
                    geminiAmount = cachedComparison.geminiAmount,
                    geminiDate = cachedComparison.geminiDate,
                    geminiMerchant = cachedComparison.geminiMerchant,
                    geminiCategoryId = cachedComparison.geminiCategoryId,
                    geminiError = cachedComparison.geminiError,
                    createdAt = Instant.now()
                )
                val savedComparison = try {
                    ocrComparisonRepository.save(newComparison)
                } catch (e: Exception) {
                    log.warn("Failed to save cached OCR comparison record: {}", e.message)
                    null
                }

                val cachedExp = cachedComparison.expense
                val providerError = cachedComparison.geminiError

                if (providerError != null) {
                    val errorRes = errorResult(providerError).toMutableMap()
                    if (savedComparison?.id != null) {
                        errorRes["comparison_id"] = savedComparison.id
                    }
                    return errorRes
                }

                val amount = cachedComparison.geminiAmount?.toDouble()
                val merchant = cachedComparison.geminiMerchant
                val finalResult = mutableMapOf<String, Any?>(
                    "amount" to amount,
                    "currency" to (cachedExp?.currencyOriginal ?: "EUR"),
                    "tax_amount" to (cachedExp?.taxAmount?.toDouble() ?: 0.0),
                    "tax_rate" to (cachedExp?.taxRate?.toDouble()),
                    "date" to cachedComparison.geminiDate,
                    "merchant" to merchant,
                    "category_id" to cachedComparison.geminiCategoryId,
                    "description" to (cachedExp?.description ?: if (merchant != null) "Scanned receipt from $merchant (cached)" else "Scanned receipt (cached)"),
                    "raw_text" to (cachedExp?.rawOcrText ?: ""),
                    "confidence" to 1.0,
                    "warnings" to emptyList<String>()
                )
                if (savedComparison?.id != null) {
                    finalResult["comparison_id"] = savedComparison.id
                }
                return finalResult
            }
        }

        // Pre-save the comparison record to obtain an ID for the fallback-chain attempts
        val comparison = OcrComparison(
            receiptFilename = filename,
            provider = config.provider,
            sha256 = sha256,
            createdAt = Instant.now()
        )
        val savedComparison = try {
            ocrComparisonRepository.save(comparison)
        } catch (e: Exception) {
            log.warn("Failed to pre-save OCR comparison record: {}", e.message)
            null
        }
        val comparisonId = savedComparison?.id

        var result: Map<String, Any?>? = null
        var lastError: String? = null
        for (modelTier in GEMINI_FALLBACK_CHAIN) {
            try {
                val attempt = scanGemini(fileBytes, filename, config.geminiApiKey, categories, modelTier)
                if (attempt["amount"] != null) {
                    result = attempt
                    break
                }
                lastError = "Gemini ($modelTier) returned no usable data"
            } catch (e: Exception) {
                lastError = "Gemini ($modelTier) failed: ${e.message}"
                log.warn("Gemini OCR attempt failed for model tier {}: {}", modelTier, e.message)
            }
        }

        val finalResult = result ?: errorResult(lastError ?: "All Gemini model tiers failed")

        if (comparisonId != null) {
            updateGeminiComparison(comparisonId, finalResult)
        }

        val mutableResult = finalResult.toMutableMap()
        if (comparisonId != null) {
            mutableResult["comparison_id"] = comparisonId
        }
        return mutableResult
    }

    private fun updateGeminiComparison(id: Int, result: Map<String, Any?>) {
        try {
            val amount = (result["amount"] as? Number)?.let { BigDecimal.valueOf(it.toDouble()) }
            val date = result["date"] as? String
            val merchant = result["merchant"] as? String
            val categoryId = result["category_id"] as? Int
            val error = result["provider_error"] as? String
            ocrComparisonRepository.updateGeminiResult(id, amount, date, merchant, categoryId, error)
        } catch (e: Exception) {
            log.warn("Failed to update Gemini comparison record: {}", e.message)
        }
    }

    fun geminiModelName(provider: String): String {
        return when (provider) {
            "gemini-3-flash" -> "gemini-3-flash-preview"
            "gemini-3.1-flash-lite" -> "gemini-3.1-flash-lite"
            "gemini-3.5-flash" -> "gemini-3.5-flash"
            else -> "gemini-2.5-flash"
        }
    }

    internal fun scanGemini(
        fileBytes: ByteArray,
        filename: String,
        apiKey: String,
        categories: List<eu.nt.xpenses.model.Category>,
        provider: String = "gemini"
    ): Map<String, Any?> {
        val b64Data = Base64.getEncoder().encodeToString(fileBytes)
        val modelName = geminiModelName(provider)
        val url = "https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent"
        val categoriesStr = categories.joinToString(", ") { "${it.id}: ${it.name}" }

        val ext = filename.substringAfterLast('.', "").lowercase()
        val mimeType = when (ext) {
            "pdf" -> "application/pdf"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "gif" -> "image/gif"
            else -> "image/jpeg"
        }

        val payload = mapOf(
            "contents" to listOf(
                mapOf(
                    "parts" to listOf(
                        mapOf(
                            "text" to (
                                "Analyze this receipt, bill, invoice, or ticket document. " +
                                "Extract the following fields and return them in the requested JSON structure: " +
                                "merchant (store/provider name), amount (total amount paid), currency (3-letter ISO code e.g. EUR, USD, RON), " +
                                "tax_amount (total tax/VAT paid), tax_rate (percentage e.g. 19.0), date (in YYYY-MM-DD format), " +
                                "raw_text (full OCR transcription of the text on the receipt), " +
                                "category_id (Select the best-matching integer category ID from this list: $categoriesStr. If none match, return null), " +
                                "and description (a brief, human-friendly summary of the expense description or receipt items)."
                            )
                        ),
                        mapOf(
                            "inlineData" to mapOf(
                                "mimeType" to mimeType,
                                "data" to b64Data
                            )
                        )
                    )
                )
            ),
            "generationConfig" to mapOf(
                "responseMimeType" to "application/json",
                "responseSchema" to mapOf(
                    "type" to "OBJECT",
                    "properties" to mapOf(
                        "merchant" to mapOf("type" to "STRING"),
                        "amount" to mapOf("type" to "NUMBER"),
                        "currency" to mapOf("type" to "STRING"),
                        "tax_amount" to mapOf("type" to "NUMBER"),
                        "tax_rate" to mapOf("type" to "NUMBER"),
                        "date" to mapOf("type" to "STRING"),
                        "category_id" to mapOf("type" to "INTEGER"),
                        "description" to mapOf("type" to "STRING"),
                        "raw_text" to mapOf("type" to "STRING")
                    )
                )
            )
        )

        val response = restClient.post()
            .uri(url)
            .header("x-goog-api-key", apiKey)
            .contentType(MediaType.APPLICATION_JSON)
            .body(payload)
            .retrieve()
            .body<Map<String, Any>>() ?: throw Exception("Empty response from Gemini")

        val candidates = response["candidates"] as? List<*> ?: emptyList<Any>()
        val candidate = candidates.firstOrNull() as? Map<*, *>
        val content = candidate?.get("content") as? Map<*, *>
        val parts = content?.get("parts") as? List<*>
        val firstPart = parts?.firstOrNull() as? Map<*, *>
        val textResponse = firstPart?.get("text")?.toString() ?: "{}"

        val result: Map<String, Any?> = objectMapper.readValue(textResponse)

        val warnings = mutableListOf<String>()
        var amount: Double? = (result["amount"] as? Number)?.toDouble()
        if (amount == null) warnings.add("Could not extract amount")

        var date = result["date"] as? String
        if (date != null) {
            if (!Pattern.matches("^\\d{4}-\\d{2}-\\d{2}$", date)) {
                warnings.add("Extracted date format is invalid")
                date = null
            }
        } else {
            warnings.add("Could not extract date")
        }

        val merchant = result["merchant"] as? String
        if (merchant.isNullOrEmpty()) warnings.add("Could not extract merchant")

        val currency = (result["currency"] as? String)?.uppercase()?.trim()
        val taxAmount = (result["tax_amount"] as? Number)?.toDouble()
        val taxRate = (result["tax_rate"] as? Number)?.toDouble()

        var categoryId = (result["category_id"] as? Number)?.toInt()
        if (categoryId != null) {
            val validIds = categories.map { it.id }.toSet()
            if (!validIds.contains(categoryId)) {
                categoryId = null
            }
        }

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
            "warnings" to warnings
        )
    }

    private fun emptyResult(warnings: List<String>): Map<String, Any?> {
        return mapOf(
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
            "warnings" to warnings
        )
    }

    private fun errorResult(error: String): Map<String, Any?> {
        val r = emptyResult(listOf(error)).toMutableMap()
        r["provider_error"] = error
        return r
    }

}
