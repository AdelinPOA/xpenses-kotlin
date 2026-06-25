package eu.nt.xpenses.services

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.models.OcrComparison
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.core.io.ByteArrayResource
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import org.springframework.http.client.JdkClientHttpRequestFactory
import java.net.http.HttpClient
import org.slf4j.LoggerFactory
import java.io.File
import java.math.BigDecimal
import java.time.Instant
import java.util.*
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor
import java.time.Duration
import java.util.regex.Pattern

data class OCRConfig(
    var provider: String = "easyocr",
    @JsonProperty("ocr_enabled") var ocrEnabled: Boolean = true,
    @JsonProperty("gemini_api_key") var geminiApiKey: String = "",
    @JsonProperty("password_set") var passwordSet: Boolean = false,
    @JsonProperty("mineru_url") var mineruUrl: String = "http://mineru:8000"
)

class NaiveBayesClassifier {
    private val categoryCounts = mutableMapOf<Int, Int>()
    private val wordCounts = mutableMapOf<Int, MutableMap<String, Int>>()
    private val vocab = mutableSetOf<String>()
    private var totalDocs = 0

    fun tokenize(text: String?): List<String> {
        if (text.isNullOrEmpty()) return emptyList()
        val regex = Regex("[a-zA-Z]{3,}")
        return regex.findAll(text).map { it.value.lowercase() }.toList()
    }

    fun train(data: List<Pair<String, Int>>) {
        categoryCounts.clear()
        wordCounts.clear()
        vocab.clear()
        totalDocs = data.size

        for ((text, catId) in data) {
            categoryCounts[catId] = (categoryCounts[catId] ?: 0) + 1
            val words = tokenize(text)
            for (w in words) {
                val catWordCounts = wordCounts.getOrPut(catId) { mutableMapOf() }
                catWordCounts[w] = (catWordCounts[w] ?: 0) + 1
                vocab.add(w)
            }
        }
    }

    fun predict(text: String): Int? {
        if (categoryCounts.isEmpty() || totalDocs == 0) return null
        val words = tokenize(text)
        if (words.isEmpty()) return null

        var bestCat: Int? = null
        var maxLogProb = Double.NEGATIVE_INFINITY
        val vocabSize = vocab.size

        for ((catId, catCount) in categoryCounts) {
            var logProb = Math.log(catCount.toDouble() / totalDocs)
            val totalWordsInCat = wordCounts[catId]?.values?.sum() ?: 0

            for (w in words) {
                if (vocab.contains(w)) {
                    val wordCount = wordCounts[catId]?.get(w) ?: 0
                    logProb += Math.log((wordCount + 1).toDouble() / (totalWordsInCat + vocabSize))
                }
            }

            if (logProb > maxLogProb) {
                maxLogProb = logProb
                bestCat = catId
            }
        }
        return bestCat
    }
}

@Service
class OcrService(
    private val appSettingRepository: AppSettingRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseRepository: ExpenseRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val cryptoService: CryptoService,
    private val objectMapper: ObjectMapper,
    @Qualifier("applicationTaskExecutor") private val taskExecutor: Executor
) {
    private val log = LoggerFactory.getLogger(OcrService::class.java)
    // Force HTTP/1.1: the JDK HttpClient defaults to an HTTP/1.1->HTTP/2 (h2c) upgrade on plain
    // HTTP, which uvicorn (MinerU) rejects, causing 422 "files: Field required". EasyOCR's
    // Flask server ignores the upgrade, but FastAPI/uvicorn does not. Pin to HTTP/1.1.
    private val restClient = RestClient.builder()
        .requestFactory(JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build()
        ).also { it.setReadTimeout(Duration.ofSeconds(60)) })
        .build()

    fun getOcrConfig(): OCRConfig {
        val setting = appSettingRepository.findById("ocr_config").orElse(null)
            ?: return OCRConfig(provider = "easyocr", ocrEnabled = true)
        
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
            OCRConfig(provider = "easyocr", ocrEnabled = true)
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

    fun trainLocalClassifier(): NaiveBayesClassifier? {
        val expenses = expenseRepository.findAllWithOcrTrainingData()
        if (expenses.size < 5) return null
        val data = expenses.map { Pair(it.rawOcrText!!, it.category!!.id!!) }
        val classifier = NaiveBayesClassifier()
        classifier.train(data)
        return classifier
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

    fun testMineruConnection(baseUrl: String): Map<String, Any> {
        try {
            validateUrlForSsr(baseUrl)
        } catch (e: IllegalArgumentException) {
            return mapOf<String, Any>("success" to false, "message" to (e.message ?: "Validation failed"))
        }
        val url = baseUrl.trimEnd('/') + "/docs"
        return try {
            val response = restClient.get()
                .uri(url)
                .retrieve()
                .toEntity(String::class.java)
            if (response.statusCode.is2xxSuccessful) {
                mapOf("success" to true, "message" to "MinerU API is reachable at $baseUrl")
            } else {
                mapOf("success" to false, "message" to "MinerU responded with HTTP ${response.statusCode}")
            }
        } catch (e: Exception) {
            mapOf("success" to false, "message" to "Could not connect to $baseUrl: ${e.message}")
        }
    }

    fun scanReceipt(fileBytes: ByteArray, filename: String): Map<String, Any?> {
        val config = getOcrConfig()
        if (!config.ocrEnabled) {
            return emptyResult(listOf("OCR is disabled in settings"))
        }

        val categories = categoryRepository.findAllByIsActiveTrue()
        val classifier = trainLocalClassifier()

        // Calculate SHA-256 of the receipt bytes
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(fileBytes)
        val sha256 = hashBytes.joinToString("") { "%02x".format(it) }

        // Try to find the best existing comparison with this hash (preferring linked expenses or populated records)
        val cachedComparison = ocrComparisonRepository.findBestCachedComparison(sha256).firstOrNull()

        if (cachedComparison != null) {
            val isProviderPopulated = when {
                config.provider == "gemini" || config.provider.startsWith("gemini-") -> cachedComparison.geminiAmount != null || cachedComparison.geminiDate != null || cachedComparison.geminiMerchant != null || cachedComparison.geminiCategoryId != null
                config.provider == "mineru" -> cachedComparison.mineruAmount != null || cachedComparison.mineruDate != null || cachedComparison.mineruMerchant != null || cachedComparison.mineruCategoryId != null
                else -> cachedComparison.easyocrAmount != null || cachedComparison.easyocrDate != null || cachedComparison.easyocrMerchant != null || cachedComparison.easyocrCategoryId != null
            }

            if (isProviderPopulated) {
                log.info("OCR cache hit for hash: {} using provider: {}", sha256, config.provider)
                val newComparison = OcrComparison(
                    receiptFilename = filename,
                    provider = config.provider,
                    sha256 = sha256,
                    geminiAmount = cachedComparison.geminiAmount,
                    geminiDate = cachedComparison.geminiDate,
                    geminiMerchant = cachedComparison.geminiMerchant,
                    geminiCategoryId = cachedComparison.geminiCategoryId,
                    geminiError = cachedComparison.geminiError,
                    easyocrAmount = cachedComparison.easyocrAmount,
                    easyocrDate = cachedComparison.easyocrDate,
                    easyocrMerchant = cachedComparison.easyocrMerchant,
                    easyocrCategoryId = cachedComparison.easyocrCategoryId,
                    easyocrError = cachedComparison.easyocrError,
                    mineruAmount = cachedComparison.mineruAmount,
                    mineruDate = cachedComparison.mineruDate,
                    mineruMerchant = cachedComparison.mineruMerchant,
                    mineruCategoryId = cachedComparison.mineruCategoryId,
                    mineruError = cachedComparison.mineruError,
                    createdAt = Instant.now()
                )
                val savedComparison = try {
                    ocrComparisonRepository.save(newComparison)
                } catch (e: Exception) {
                    log.warn("Failed to save cached OCR comparison record: {}", e.message)
                    null
                }

                val cachedExp = cachedComparison.expense
                val amount = when {
                    config.provider == "gemini" || config.provider.startsWith("gemini-") -> cachedComparison.geminiAmount?.toDouble()
                    config.provider == "mineru" -> cachedComparison.mineruAmount?.toDouble()
                    else -> cachedComparison.easyocrAmount?.toDouble()
                }
                val date = when {
                    config.provider == "gemini" || config.provider.startsWith("gemini-") -> cachedComparison.geminiDate
                    config.provider == "mineru" -> cachedComparison.mineruDate
                    else -> cachedComparison.easyocrDate
                }
                val merchant = when {
                    config.provider == "gemini" || config.provider.startsWith("gemini-") -> cachedComparison.geminiMerchant
                    config.provider == "mineru" -> cachedComparison.mineruMerchant
                    else -> cachedComparison.easyocrMerchant
                }
                val categoryId = when {
                    config.provider == "gemini" || config.provider.startsWith("gemini-") -> cachedComparison.geminiCategoryId
                    config.provider == "mineru" -> cachedComparison.mineruCategoryId
                    else -> cachedComparison.easyocrCategoryId
                }
                val providerError = when {
                    config.provider == "gemini" || config.provider.startsWith("gemini-") -> cachedComparison.geminiError
                    config.provider == "mineru" -> cachedComparison.mineruError
                    else -> cachedComparison.easyocrError
                }

                if (providerError != null) {
                    val errorRes = errorResult(providerError).toMutableMap()
                    if (savedComparison?.id != null) {
                        errorRes["comparison_id"] = savedComparison.id
                    }
                    return errorRes
                }

                val finalResult = mutableMapOf<String, Any?>(
                    "amount" to amount,
                    "currency" to (cachedExp?.currencyOriginal ?: "EUR"),
                    "tax_amount" to (cachedExp?.taxAmount?.toDouble() ?: 0.0),
                    "tax_rate" to (cachedExp?.taxRate?.toDouble()),
                    "date" to date,
                    "merchant" to merchant,
                    "category_id" to categoryId,
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

        var geminiResult: Map<String, Any?>? = null
        var easyocrResult: Map<String, Any?>? = null
        var mineruResult: Map<String, Any?>? = null
        var finalResult: Map<String, Any?>

        // Pre-save the comparison record to obtain an ID for async background updates
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

        // 1. Run selected provider synchronously (and fallbacks if needed)
        val isGeminiProvider = config.provider == "gemini" || config.provider.startsWith("gemini-")

        if (isGeminiProvider) {
            if (config.geminiApiKey.isNotEmpty()) {
                try {
                    geminiResult = scanGemini(fileBytes, filename, config.geminiApiKey, categories, config.provider)
                } catch (e: Exception) {
                    geminiResult = errorResult("Gemini failed: ${e.message}")
                }
            }

            if (geminiResult != null && geminiResult["amount"] != null) {
                finalResult = geminiResult
            } else {
                try {
                    easyocrResult = scanEasyOcr(fileBytes, filename, categories, classifier)
                } catch (e: Exception) {
                    easyocrResult = errorResult("EasyOCR failed: ${e.message}")
                }
                finalResult = easyocrResult
            }
        } else if (config.provider == "mineru") {
            try {
                mineruResult = scanMineru(fileBytes, filename, config.mineruUrl, categories, classifier)
            } catch (e: Exception) {
                mineruResult = errorResult("MinerU failed: ${e.message}")
            }

            if (mineruResult != null && mineruResult["amount"] != null) {
                finalResult = mineruResult
            } else {
                try {
                    easyocrResult = scanEasyOcr(fileBytes, filename, categories, classifier)
                } catch (e: Exception) {
                    easyocrResult = errorResult("EasyOCR failed: ${e.message}")
                }
                finalResult = easyocrResult
            }
        } else { // easyocr
            try {
                easyocrResult = scanEasyOcr(fileBytes, filename, categories, classifier)
            } catch (e: Exception) {
                easyocrResult = errorResult("EasyOCR failed: ${e.message}")
            }
            finalResult = easyocrResult
        }

        // 2. Update the DB record for the synchronous scans and run the others in the background
        if (comparisonId != null) {
            try {
                if (geminiResult != null) {
                    updateGeminiComparison(comparisonId, geminiResult)
                }
                if (easyocrResult != null) {
                    updateEasyOcrComparison(comparisonId, easyocrResult)
                }
                if (mineruResult != null) {
                    updateMineruComparison(comparisonId, mineruResult)
                }
            } catch (e: Exception) {
                log.warn("Failed to update synchronous OCR comparison results: {}", e.message)
            }

            // Launch background tasks for the non-executed engines
            if (easyocrResult == null) {
                CompletableFuture.runAsync({
                    try {
                        val res = scanEasyOcr(fileBytes, filename, categories, classifier)
                        updateEasyOcrComparison(comparisonId, res)
                    } catch (e: Exception) {
                        log.error("Async EasyOCR failed: ${e.message}")
                        updateEasyOcrComparison(comparisonId, errorResult("EasyOCR failed: ${e.message}"))
                    }
                }, taskExecutor)
            }

            if (mineruResult == null) {
                CompletableFuture.runAsync({
                    try {
                        val res = scanMineru(fileBytes, filename, config.mineruUrl, categories, classifier)
                        updateMineruComparison(comparisonId, res)
                    } catch (e: Exception) {
                        log.error("Async MinerU failed: ${e.message}")
                        updateMineruComparison(comparisonId, errorResult("MinerU failed: ${e.message}"))
                    }
                }, taskExecutor)
            }

            if (geminiResult == null && config.geminiApiKey.isNotEmpty()) {
                CompletableFuture.runAsync({
                    try {
                        val res = scanGemini(fileBytes, filename, config.geminiApiKey, categories, config.provider)
                        updateGeminiComparison(comparisonId, res)
                    } catch (e: Exception) {
                        log.error("Async Gemini failed: ${e.message}")
                        updateGeminiComparison(comparisonId, errorResult("Gemini failed: ${e.message}"))
                    }
                }, taskExecutor)
            }
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

    private fun updateEasyOcrComparison(id: Int, result: Map<String, Any?>) {
        try {
            val amount = (result["amount"] as? Number)?.let { BigDecimal.valueOf(it.toDouble()) }
            val date = result["date"] as? String
            val merchant = result["merchant"] as? String
            val categoryId = result["category_id"] as? Int
            val error = result["provider_error"] as? String
            ocrComparisonRepository.updateEasyOcrResult(id, amount, date, merchant, categoryId, error)
        } catch (e: Exception) {
            log.warn("Failed to update EasyOCR comparison record: {}", e.message)
        }
    }

    private fun updateMineruComparison(id: Int, result: Map<String, Any?>) {
        try {
            val amount = (result["amount"] as? Number)?.let { BigDecimal.valueOf(it.toDouble()) }
            val date = result["date"] as? String
            val merchant = result["merchant"] as? String
            val categoryId = result["category_id"] as? Int
            val error = result["provider_error"] as? String
            ocrComparisonRepository.updateMineruResult(id, amount, date, merchant, categoryId, error)
        } catch (e: Exception) {
            log.warn("Failed to update MinerU comparison record: {}", e.message)
        }
    }

    private fun scanEasyOcr(
        fileBytes: ByteArray,
        filename: String,
        categories: List<eu.nt.xpenses.models.Category>,
        classifier: NaiveBayesClassifier?
    ): Map<String, Any?> {
        val lines = runEasyOcrSidecar(fileBytes, filename)
        val rawText = lines.joinToString("\n")

        val (amount, currency) = extractAmount(lines)
        val (taxAmount, taxRate) = extractTax(lines)
        val date = extractDate(lines)
        val merchant = extractMerchant(lines)

        var categoryId: Int? = null
        if (classifier != null && rawText.isNotEmpty()) {
            categoryId = classifier.predict(rawText)
        }
        if (categoryId == null && rawText.isNotEmpty()) {
            val textLower = rawText.lowercase()
            for (cat in categories) {
                val catNameLower = cat.name.lowercase()
                if (textLower.contains(catNameLower)) {
                    categoryId = cat.id
                    break
                }
                val words = catNameLower.split(" ").map { it.trim() }.filter { it.length > 3 }
                if (words.isNotEmpty() && words.any { textLower.contains(it) }) {
                    categoryId = cat.id
                    break
                }
            }
        }

        val description = if (merchant != null) "Scanned receipt from $merchant" else "Scanned receipt"
        val warnings = mutableListOf<String>()
        if (amount == null) warnings.add("Could not extract amount")
        if (date == null) warnings.add("Could not extract date")
        if (merchant == null) warnings.add("Could not extract merchant")

        return mapOf(
            "amount" to amount,
            "currency" to currency,
            "tax_amount" to taxAmount,
            "tax_rate" to taxRate,
            "date" to date,
            "merchant" to merchant,
            "category_id" to categoryId,
            "description" to description,
            "raw_text" to rawText,
            "confidence" to 0.85,
            "warnings" to warnings
        )
    }

    private fun runEasyOcrSidecar(fileBytes: ByteArray, filename: String): List<String> {
        val url = "http://ocr-sidecar:5000/api/scan"
        return try {
            val resource = object : ByteArrayResource(fileBytes) {
                override fun getFilename(): String = filename
            }

            val parts = LinkedMultiValueMap<String, Any>().apply {
                add("file", resource)
            }

            val headers = HttpHeaders().apply {
                contentType = MediaType.MULTIPART_FORM_DATA
            }

            val response = restClient.post()
                .uri(url)
                .headers { it.addAll(headers) }
                .body(parts)
                .retrieve()
                .body<Map<String, Any>>() ?: throw Exception("Empty response from EasyOCR sidecar")

            if (response.containsKey("error")) {
                log.warn("EasyOCR sidecar error: {}", response["error"])
                emptyList()
            } else {
                (response["lines"] as? List<*>)?.map { it.toString() } ?: emptyList()
            }
        } catch (e: Exception) {
            log.warn("EasyOCR sidecar API call failed: {}", e.message)
            emptyList()
        }
    }

    private fun scanMineru(
        fileBytes: ByteArray,
        filename: String,
        mineruUrl: String,
        categories: List<eu.nt.xpenses.models.Category>,
        classifier: NaiveBayesClassifier?
    ): Map<String, Any?> {
        validateUrlForSsr(mineruUrl)
        val url = mineruUrl.trimEnd('/') + "/file_parse"
        val resource = object : ByteArrayResource(fileBytes) {
            override fun getFilename(): String = filename
        }

        val parts = LinkedMultiValueMap<String, Any>().apply {
            add("files", resource)
            add("backend", "pipeline")
            add("lang_list", "latin")
            add("return_md", true)
        }

        val headers = HttpHeaders().apply {
            contentType = MediaType.MULTIPART_FORM_DATA
        }

        val response = restClient.post()
            .uri(url)
            .headers { it.addAll(headers) }
            .body(parts)
            .retrieve()
            .body<Map<String, Any>>() ?: throw Exception("Empty response from MinerU")

        // Parse markdown results
        var mdText = ""
        val results = response["results"] ?: response
        if (results is List<*> && results.isNotEmpty()) {
            val first = results[0] as? Map<*, *>
            if (first != null) {
                val doc = first["document"] as? Map<*, *> ?: first
                mdText = (doc["md_content"] ?: doc["content"] ?: "").toString()
            }
        } else if (results is Map<*, *>) {
            val doc = results["document"] as? Map<*, *>
            if (doc != null) {
                mdText = (doc["md_content"] ?: doc["content"] ?: "").toString()
            } else {
                val firstVal = results.values.firstOrNull { it is Map<*, *> } as? Map<*, *>
                mdText = (firstVal?.get("md_content") ?: firstVal?.get("content") ?: "").toString()
            }
        }

        val cleanLines = mdText.split("\n")
            .map { it.replace(Regex("[#*`_>|\\[\\]]"), "").trim() }
            .filter { it.isNotEmpty() }
        
        val rawText = cleanLines.joinToString("\n")
        val (amount, currency) = extractAmount(cleanLines)
        val (taxAmount, taxRate) = extractTax(cleanLines)
        val date = extractDate(cleanLines)
        val merchant = extractMerchant(cleanLines)

        var categoryId: Int? = null
        if (classifier != null && rawText.isNotEmpty()) {
            categoryId = classifier.predict(rawText)
        }
        if (categoryId == null && rawText.isNotEmpty()) {
            val textLower = rawText.lowercase()
            for (cat in categories) {
                val catNameLower = cat.name.lowercase()
                if (textLower.contains(catNameLower)) {
                    categoryId = cat.id
                    break
                }
                val words = catNameLower.split(" ").map { it.trim() }.filter { it.length > 3 }
                if (words.isNotEmpty() && words.any { textLower.contains(it) }) {
                    categoryId = cat.id
                    break
                }
            }
        }

        val description = if (merchant != null) "Scanned receipt from $merchant" else "Scanned receipt"
        val warnings = mutableListOf<String>()
        if (amount == null) warnings.add("Could not extract amount")
        if (date == null) warnings.add("Could not extract date")
        if (merchant == null) warnings.add("Could not extract merchant")

        return mapOf(
            "amount" to amount,
            "currency" to currency,
            "tax_amount" to taxAmount,
            "tax_rate" to taxRate,
            "date" to date,
            "merchant" to merchant,
            "category_id" to categoryId,
            "description" to description,
            "raw_text" to rawText,
            "confidence" to 0.95,
            "warnings" to warnings
        )
    }

    fun geminiModelName(provider: String): String {
        return when (provider) {
            "gemini-3-flash" -> "gemini-3-flash-preview"
            "gemini-3.1-flash-lite" -> "gemini-3.1-flash-lite"
            "gemini-3.5-flash" -> "gemini-3.5-flash"
            else -> "gemini-2.5-flash"
        }
    }

    private fun scanGemini(
        fileBytes: ByteArray,
        filename: String,
        apiKey: String,
        categories: List<eu.nt.xpenses.models.Category>,
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

    private fun extractAmount(lines: List<String>): Pair<Double?, String?> {
        val totalKeywords = setOf("total", "suma", "amount", "to pay", "de plata", "plata", "grand total")
        val currencySymbolMap = mapOf("€" to "EUR", "$" to "USD")
        val currencyCodeMap = mapOf("EUR" to "EUR", "RON" to "RON", "USD" to "USD", "GBP" to "GBP", "LEI" to "RON")

        val patterns = listOf(
            Pair(Pattern.compile("([€$])\\s*([\\d.,]+\\d{2})"), Pair(2, 1)),
            Pair(Pattern.compile("([\\d.,]+\\d{2})\\s*(EUR|RON|USD|GBP|lei)", Pattern.CASE_INSENSITIVE), Pair(1, 2)),
            Pair(Pattern.compile("((?:\\d{1,3}\\.)*\\d{1,6}[,]\\d{2}|\\d{1,6}\\.\\d{2})"), Pair(1, null))
        )

        fun parseAmount(raw: String): Double {
            val clean = if (raw.contains(",") && raw.contains(".")) {
                raw.replace(".", "").replace(",", ".")
            } else {
                raw.replace(",", ".")
            }
            return clean.toDouble()
        }

        fun resolveCurrency(sym: String): String? {
            val upper = sym.trim().uppercase()
            if (currencySymbolMap.containsKey(sym.trim())) {
                return currencySymbolMap[sym.trim()]
            }
            return currencyCodeMap[upper]
        }

        fun findInLine(line: String): Pair<Double?, String?> {
            for ((pattern, grps) in patterns) {
                val m = pattern.matcher(line)
                if (m.find()) {
                    try {
                        val amount = parseAmount(m.group(grps.first))
                        val currency = grps.second?.let { resolveCurrency(m.group(it)) }
                        return Pair(amount, currency)
                    } catch (e: Exception) {
                        continue
                    }
                }
            }
            return Pair(null, null)
        }

        fun guessGlobalCurrency(): String? {
            val fullText = lines.joinToString(" ").uppercase()
            if (fullText.contains("€") || fullText.contains("EUR")) return "EUR"
            if (fullText.contains("$") || fullText.contains("USD")) return "USD"
            if (fullText.contains("RON") || fullText.contains("LEI")) return "RON"
            return null
        }

        // Pass 1: keywords
        val keywordResults = mutableListOf<Pair<Double, String?>>()
        for (i in lines.indices) {
            val lower = lines[i].lowercase()
            if (totalKeywords.any { lower.contains(it) }) {
                val (amt, cur) = findInLine(lines[i])
                if (amt != null) {
                    keywordResults.add(Pair(amt, cur))
                    continue
                }
                for (j in 1..2) {
                    if (i + j < lines.size) {
                        val (lookaheadAmt, lookaheadCur) = findInLine(lines[i + j])
                        if (lookaheadAmt != null) {
                            keywordResults.add(Pair(lookaheadAmt, lookaheadCur))
                            break
                        }
                    }
                }
            }
        }

        var finalAmt: Double? = null
        var finalCur: String? = null

        if (keywordResults.isNotEmpty()) {
            val last = keywordResults.last()
            finalAmt = last.first
            finalCur = last.second
        } else {
            // Pass 2: max value
            val allResults = mutableListOf<Pair<Double, String?>>()
            for (line in lines) {
                val (amt, cur) = findInLine(line)
                if (amt != null) {
                    allResults.add(Pair(amt, cur))
                }
            }
            if (allResults.isNotEmpty()) {
                val max = allResults.maxByOrNull { it.first }
                if (max != null) {
                    finalAmt = max.first
                    finalCur = max.second
                }
            }
        }

        if (finalAmt != null && finalCur == null) {
            finalCur = guessGlobalCurrency()
        }

        return Pair(finalAmt, finalCur)
    }

    private fun extractTax(lines: List<String>): Pair<Double?, Double?> {
        val taxKeywords = setOf("tax", "vat", "tva", "taxa")
        for (line in lines) {
            val lower = line.lowercase()
            if (taxKeywords.any { lower.contains(it) }) {
                val pctMatch = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*%").matcher(line)
                val rate = if (pctMatch.find()) pctMatch.group(1).replace(",", ".").toDouble() else null

                val amtMatch = Pattern.compile("(\\d+(?:[.,]\\d{2}))").matcher(line)
                val amt = if (amtMatch.find()) amtMatch.group(1).replace(",", ".").toDouble() else null

                if (amt != null || rate != null) {
                    return Pair(amt, rate)
                }
            }
        }
        return Pair(null, null)
    }

    private fun extractDate(lines: List<String>): String? {
        val ddMmYyyy = Pattern.compile("(\\d{2})[./\\-](\\d{2})[./\\-](\\d{4})")
        val yyyyMmDd = Pattern.compile("(\\d{4})[./\\-](\\d{2})[./\\-](\\d{2})")

        for (line in lines) {
            var m = yyyyMmDd.matcher(line)
            if (m.find()) {
                val year = m.group(1).toInt()
                val month = m.group(2).toInt()
                val day = m.group(3).toInt()
                if (month in 1..12 && day in 1..31) {
                    return String.format("%04d-%02d-%02d", year, month, day)
                }
            }

            m = ddMmYyyy.matcher(line)
            if (m.find()) {
                val day = m.group(1).toInt()
                val month = m.group(2).toInt()
                val year = m.group(3).toInt()
                if (month in 1..12 && day in 1..31) {
                    return String.format("%04d-%02d-%02d", year, month, day)
                }
            }
        }
        return null
    }

    private fun extractMerchant(lines: List<String>): String? {
        val skipKeywords = setOf("bon fiscal", "receipt", "factura", "invoice", "chitanta", "tax invoice", "fiscal receipt")
        val datePattern = Pattern.compile("\\d{2}[./\\-]\\d{2}[./\\-]\\d{2,4}")
        val numbersOnly = Pattern.compile("^[\\d\\s\\W]+$")

        for (line in lines) {
            val stripped = line.trim()
            if (stripped.length < 3) continue
            if (datePattern.matcher(stripped).find()) continue
            if (numbersOnly.matcher(stripped).matches()) continue
            if (skipKeywords.contains(stripped.lowercase())) continue

            // Title case formatting
            return stripped.split(" ")
                .filter { it.isNotEmpty() }
                .joinToString(" ") { it.replaceFirstChar { char -> char.titlecase() } }
        }
        return null
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

    private fun validateUrlForSsr(url: String, allowedHosts: List<String> = listOf("localhost", "127.0.0.1", "mineru")) {
        try {
            val parsed = java.net.URL(url)
            val host = parsed.host
            if (host == null || allowedHosts.none { host == it || host.endsWith(".$it") }) {
                throw IllegalArgumentException("URL host '$host' is not in the allowed list: $allowedHosts")
            }
        } catch (e: java.net.MalformedURLException) {
            throw IllegalArgumentException("Invalid URL: $url", e)
        }
    }
}
