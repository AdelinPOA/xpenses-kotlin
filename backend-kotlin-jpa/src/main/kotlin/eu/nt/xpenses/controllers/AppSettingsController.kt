package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.*
import jakarta.validation.Valid
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

@RestController
@RequestMapping("/api/settings")
class AppSettingsController(
    private val appSettingRepository: AppSettingRepository,
    private val ocrService: OcrService,
    private val emailSettingsService: EmailSettingsService,
    private val storageService: StorageService,
    private val emailImportService: EmailImportService,
    private val receiptRepository: ReceiptRepository,
    private val objectMapper: ObjectMapper
) {

    private fun listLocalFiles(baseDir: File, currentDir: File): List<String> {
        val files = mutableListOf<String>()
        val list = currentDir.listFiles() ?: return emptyList()
        for (f in list) {
            if (f.isDirectory) {
                if (f.name == "cache") continue // Skip cache directory used by remote storage providers
                files.addAll(listLocalFiles(baseDir, f))
            } else {
                val rel = f.relativeTo(baseDir).path.replace('\\', '/')
                files.add(rel)
            }
        }
        return files
    }

    // --- Daily Allowance Rate ---
    @GetMapping("/daily-allowance-rate")
    fun readDailyAllowanceRate(): ResponseEntity<DailyAllowanceOut> {
        val value = appSettingRepository.findById("daily_allowance_rate").orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal("50.00")
        return ResponseEntity.ok(DailyAllowanceOut(value))
    }

    @PatchMapping("/daily-allowance-rate")
    @PreAuthorize("hasRole('chef_finance')")
    @Transactional
    fun updateDailyAllowanceRate(@Valid @RequestBody body: DailyAllowanceUpdate): ResponseEntity<DailyAllowanceOut> {
        if (body.dailyAllowanceRate < BigDecimal.ZERO) {
            return ResponseEntity.badRequest().build()
        }
        appSettingRepository.save(AppSetting("daily_allowance_rate", body.dailyAllowanceRate.toString(), Instant.now()))
        return ResponseEntity.ok(DailyAllowanceOut(body.dailyAllowanceRate))
    }

    // --- Mileage Rates ---
    @GetMapping("/mileage-rates")
    fun readMileageRates(): ResponseEntity<MileageRatesOut> {
        val btStr = appSettingRepository.findById("mileage_rate_before_tax").orElse(null)?.value ?: "0.60"
        fun value(key: String, default: String) = appSettingRepository.findById(key).orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal(default)
        return ResponseEntity.ok(MileageRatesOut(
            BigDecimal(btStr),
            value("mileage_rate_after_tax", "0.40"),
            value("mileage_fuel_consumption_l_per_100km", "7.5"),
            value("mileage_fuel_price_ron_per_liter", "9.20"),
            value("mileage_pension_rate", "0.25"),
            value("mileage_health_rate", "0.10"),
            value("mileage_income_tax_rate", "0.10"),
            value("mileage_tax_deduction_eur", "0.00")
        ))
    }

    @PatchMapping("/mileage-rates")
    @PreAuthorize("hasRole('chef_finance')")
    @Transactional
    fun updateMileageRates(@Valid @RequestBody body: MileageRatesUpdate): ResponseEntity<MileageRatesOut> {
        val now = Instant.now()
        if (body.mileageRateBeforeTax != null) {
            appSettingRepository.save(AppSetting("mileage_rate_before_tax", body.mileageRateBeforeTax.toString(), now))
        }
        if (body.mileageRateAfterTax != null) {
            appSettingRepository.save(AppSetting("mileage_rate_after_tax", body.mileageRateAfterTax.toString(), now))
        }
        val values = mapOf(
            "mileage_fuel_consumption_l_per_100km" to body.fuelConsumptionLitersPer100Km,
            "mileage_fuel_price_ron_per_liter" to body.fuelPriceRonPerLiter,
            "mileage_pension_rate" to body.pensionRate,
            "mileage_health_rate" to body.healthRate,
            "mileage_income_tax_rate" to body.incomeTaxRate,
            "mileage_tax_deduction_eur" to body.taxDeductionEur
        )
        values.forEach { (key, value) -> if (value != null) appSettingRepository.save(AppSetting(key, value.toString(), now)) }
        val btStr = appSettingRepository.findById("mileage_rate_before_tax").orElse(null)?.value ?: "0.60"
        return readMileageRates()
    }

    // --- FX Margins ---
    private val defaultFxMargin = BigDecimal("0.02")
    private val defaultFxCurrencies = listOf("EUR", "USD", "GBP", "CHF", "RON")

    private fun readFxMarginsSetting(): Map<String, BigDecimal> {
        val stored = appSettingRepository.findById("fx_margins").orElse(null)?.value ?: return emptyMap()
        return try {
            objectMapper.readValue(stored, Map::class.java).entries.associate { entry ->
                entry.key.toString().uppercase().trim() to BigDecimal(entry.value.toString())
            }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun toFxMarginsOut(parsed: Map<String, BigDecimal>): FxMarginsOut {
        val defaultFraction = parsed["*"] ?: defaultFxMargin
        val currencies = (defaultFxCurrencies + parsed.keys.filter { it != "*" }).distinct()
        val margins = currencies.associateWith { currency ->
            when (currency) {
                "RON" -> BigDecimal.ZERO
                else -> (parsed[currency] ?: defaultFraction).movePointRight(2).setScale(2, RoundingMode.HALF_UP)
            }
        }
        return FxMarginsOut(
            margins = margins,
            defaultMargin = defaultFraction.movePointRight(2).setScale(2, RoundingMode.HALF_UP),
            currencies = currencies
        )
    }

    @GetMapping("/fx-margins")
    fun readFxMargins(): ResponseEntity<FxMarginsOut> =
        ResponseEntity.ok(toFxMarginsOut(readFxMarginsSetting()))

    @PatchMapping("/fx-margins")
    @PreAuthorize("hasRole('chef_finance')")
    @Transactional
    fun updateFxMargins(@Valid @RequestBody body: FxMarginsUpdate): ResponseEntity<FxMarginsOut> {
        val current = readFxMarginsSetting()
        val errors = linkedMapOf<String, String>()
        val normalized = linkedMapOf<String, BigDecimal>()
        val originalKeys = mutableMapOf<String, String>()

        body.margins.orEmpty().forEach { (rawKey, percentage) ->
            val key = rawKey.trim().uppercase()
            val field = "margins.$rawKey"
            val validKey = key == "*" || key.matches(Regex("^[A-Z]{3}$"))
            if (!validKey) {
                errors[field] = "Currency must be a three-letter ISO code or *"
            } else if (originalKeys.putIfAbsent(key, rawKey) != null) {
                errors[field] = "Currency key duplicates another key after normalization"
            }

            if (percentage < BigDecimal.ZERO || percentage > BigDecimal(100)) {
                errors[field] = "Margin must be between 0 and 100 percent"
            }
            if (key == "RON" && percentage.compareTo(BigDecimal.ZERO) != 0) {
                errors[field] = "RON cannot have a conversion margin"
            }
            if (validKey && !normalized.containsKey(key)) {
                normalized[key] = percentage
            }
        }

        body.defaultMargin?.let { percentage ->
            if (percentage < BigDecimal.ZERO || percentage > BigDecimal(100)) {
                errors["defaultMargin"] = "Margin must be between 0 and 100 percent"
            } else if (normalized.containsKey("*")) {
                errors["defaultMargin"] = "Use either margins.* or defaultMargin, not both"
            } else {
                normalized["*"] = percentage
            }
        }

        if (errors.isNotEmpty()) {
            throw eu.nt.xpenses.config.FxMarginsValidationException(errors)
        }

        val candidate = current.toMutableMap()
        normalized.forEach { (key, percentage) -> candidate[key] = percentage.movePointLeft(2) }
        if (normalized.isNotEmpty()) {
            appSettingRepository.save(AppSetting("fx_margins", objectMapper.writeValueAsString(candidate), Instant.now()))
        }
        return ResponseEntity.ok(toFxMarginsOut(candidate))
    }

    // --- OCR Settings ---
    @GetMapping("/ocr")
    @PreAuthorize("hasRole('mod')")
    fun readOcrSettings(): ResponseEntity<OCRConfigOut> {
        val config = ocrService.getOcrConfig()
        return ResponseEntity.ok(OCRConfigOut(
            provider = config.provider,
            ocrEnabled = config.ocrEnabled,
            geminiApiKey = if (config.passwordSet) "••••••••" else null
        ))
    }

    @PatchMapping("/ocr")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateOcrSettings(@Valid @RequestBody body: OCRConfigUpdate): ResponseEntity<OCRConfigOut> {
        val existing = ocrService.getOcrConfig()
        val provider = body.provider ?: existing.provider
        val ocrEnabled = body.ocrEnabled ?: existing.ocrEnabled

        val key = if (body.geminiApiKey == "••••••••" || body.geminiApiKey == null) {
            existing.geminiApiKey
        } else {
            body.geminiApiKey
        }

        val config = OCRConfig(
            provider = provider,
            ocrEnabled = ocrEnabled,
            geminiApiKey = key
        )
        ocrService.saveOcrConfig(config)

        val updated = ocrService.getOcrConfig()
        return ResponseEntity.ok(OCRConfigOut(
            provider = updated.provider,
            ocrEnabled = updated.ocrEnabled,
            geminiApiKey = if (updated.passwordSet) "••••••••" else null
        ))
    }

    @PostMapping("/ocr/test")
    @PreAuthorize("hasRole('mod')")
    fun testOcrSettings(@Valid @RequestBody body: OCRTestRequest): ResponseEntity<*> {
        val key = if (body.geminiApiKey == "••••••••" || body.geminiApiKey.isNullOrEmpty()) {
            ocrService.getOcrConfig().geminiApiKey
        } else {
            body.geminiApiKey
        }

        if (key.isEmpty()) {
            return ResponseEntity.ok(mapOf("success" to false, "message" to "No API key provided or configured."))
        }

        val result = ocrService.testGeminiConnection(key, body.provider ?: "gemini")
        return ResponseEntity.ok(result)
    }

    // --- Email Settings ---
    @GetMapping("/email")
    @PreAuthorize("hasRole('mod')")
    fun readEmailSettings(): ResponseEntity<EmailConfigOut> {
        val config = emailSettingsService.getSmtpConfig()
        return ResponseEntity.ok(EmailConfigOut(
            emailsEnabled = config.emailsEnabled,
            smtpHost = config.smtpHost,
            smtpPort = config.smtpPort,
            smtpUser = config.smtpUser,
            smtpFrom = config.smtpFrom,
            passwordSet = config.passwordSet
        ))
    }

    @PatchMapping("/email")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateEmailSettings(@Valid @RequestBody body: EmailConfigIn): ResponseEntity<EmailConfigOut> {
        val password = if (body.smtpPass.isEmpty()) {
            emailSettingsService.getSmtpConfig().smtpPass
        } else {
            body.smtpPass
        }

        val config = EmailConfig(
            emailsEnabled = body.emailsEnabled,
            smtpHost = body.smtpHost,
            smtpPort = body.smtpPort,
            smtpUser = body.smtpUser,
            smtpPass = password,
            smtpFrom = body.smtpFrom
        )
        emailSettingsService.saveSmtpConfig(config)

        val updated = emailSettingsService.getSmtpConfig()
        return ResponseEntity.ok(EmailConfigOut(
            emailsEnabled = updated.emailsEnabled,
            smtpHost = updated.smtpHost,
            smtpPort = updated.smtpPort,
            smtpUser = updated.smtpUser,
            smtpFrom = updated.smtpFrom,
            passwordSet = updated.passwordSet
        ))
    }

    @PostMapping("/email/test")
    @PreAuthorize("hasRole('mod')")
    fun testEmailSettings(@Valid @RequestBody body: TestEmailIn): ResponseEntity<*> {
        val config = emailSettingsService.getSmtpConfig()
        val result = emailSettingsService.testSmtpConnection(config, body.to)
        return ResponseEntity.ok(result)
    }

    // --- IMAP Settings ---
    @GetMapping("/imap")
    @PreAuthorize("hasRole('mod')")
    fun readImapSettings(): ResponseEntity<ImapConfigOut> {
        val config = emailSettingsService.getImapConfig()
        val ocrCfg = ocrService.getOcrConfig()
        val activeParser = if (ocrCfg.ocrEnabled && (ocrCfg.provider == "gemini" || ocrCfg.provider.startsWith("gemini-")) && ocrCfg.geminiApiKey.isNotEmpty()) "gemini" else "local"

        return ResponseEntity.ok(ImapConfigOut(
            enabled = config.enabled,
            imapHost = config.imapHost,
            imapPort = config.imapPort,
            imapUser = config.imapUser,
            imapFolder = config.imapFolder,
            passwordSet = config.passwordSet,
            activeParser = activeParser
        ))
    }

    @PatchMapping("/imap")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateImapSettings(@Valid @RequestBody body: ImapConfigIn): ResponseEntity<ImapConfigOut> {
        val password = if (body.imapPass.isEmpty()) {
            emailSettingsService.getImapConfig().imapPass
        } else {
            body.imapPass
        }

        val config = ImapConfig(
            enabled = body.enabled,
            imapHost = body.imapHost,
            imapPort = body.imapPort,
            imapUser = body.imapUser,
            imapPass = password,
            imapFolder = body.imapFolder
        )
        emailSettingsService.saveImapConfig(config)

        val updated = emailSettingsService.getImapConfig()
        val ocrCfg = ocrService.getOcrConfig()
        val activeParser = if (ocrCfg.ocrEnabled && (ocrCfg.provider == "gemini" || ocrCfg.provider.startsWith("gemini-")) && ocrCfg.geminiApiKey.isNotEmpty()) "gemini" else "local"
        return ResponseEntity.ok(ImapConfigOut(
            enabled = updated.enabled,
            imapHost = updated.imapHost,
            imapPort = updated.imapPort,
            imapUser = updated.imapUser,
            imapFolder = updated.imapFolder,
            passwordSet = updated.passwordSet,
            activeParser = activeParser
        ))
    }

    @PostMapping("/imap/test")
    @PreAuthorize("hasRole('mod')")
    fun testImapSettings(@Valid @RequestBody body: ImapConfigIn): ResponseEntity<*> {
        val password = if (body.imapPass.isEmpty()) {
            emailSettingsService.getImapConfig().imapPass
        } else {
            body.imapPass
        }

        val config = ImapConfig(
            enabled = body.enabled,
            imapHost = body.imapHost,
            imapPort = body.imapPort,
            imapUser = body.imapUser,
            imapPass = password,
            imapFolder = body.imapFolder
        )
        val result = emailSettingsService.testImapConnection(config)
        return ResponseEntity.ok(result)
    }

    @PostMapping("/imap/simulate")
    @PreAuthorize("hasRole('mod')")
    fun simulateEmail(@Valid @RequestBody body: EmailSimulationIn): ResponseEntity<*> {
        val result = emailImportService.simulateIncomingEmail(body.fromAddress, body.bodyText, body.parser)
        return ResponseEntity.ok(result)
    }

    // --- Storage Settings ---
    @GetMapping("/storage")
    @PreAuthorize("hasRole('mod')")
    fun readStorageSettings(): ResponseEntity<StorageConfigDto> {
        val config = storageService.getStorageConfig()
        
        if (!config.smb?.password.isNullOrEmpty()) config.smb?.password = "••••••••"
        if (!config.webdav?.password.isNullOrEmpty()) config.webdav?.password = "••••••••"
        if (!config.sftp?.password.isNullOrEmpty()) config.sftp?.password = "••••••••"
        if (!config.s3?.secretKey.isNullOrEmpty()) config.s3?.secretKey = "••••••••"

        return ResponseEntity.ok(config)
    }

    @PatchMapping("/storage")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateStorageSettings(
        @RequestBody body: StorageConfigDto,
        @RequestParam(name = "migrate_existing", defaultValue = "false") migrateExisting: Boolean
    ): ResponseEntity<StorageConfigDto> {
        val oldConfig = storageService.getStorageConfig()

        if (body.smb?.password == "••••••••" || body.smb?.password == "****") {
            if (body.smb != null) body.smb?.password = oldConfig.smb?.password ?: ""
        }
        if (body.webdav?.password == "••••••••" || body.webdav?.password == "****") {
            if (body.webdav != null) body.webdav?.password = oldConfig.webdav?.password ?: ""
        }
        if (body.sftp?.password == "••••••••" || body.sftp?.password == "****") {
            if (body.sftp != null) body.sftp?.password = oldConfig.sftp?.password ?: ""
        }
        if (body.s3?.secretKey == "••••••••" || body.s3?.secretKey == "****") {
            if (body.s3 != null) body.s3?.secretKey = oldConfig.s3?.secretKey ?: ""
        }

        storageService.saveStorageConfig(body)

        if (migrateExisting) {
            val receipts = receiptRepository.findAll()
            storageService.startMigration(oldConfig, body, receipts)
        }
        
        val updated = storageService.getStorageConfig()
        
        if (!updated.smb?.password.isNullOrEmpty()) updated.smb?.password = "••••••••"
        if (!updated.webdav?.password.isNullOrEmpty()) updated.webdav?.password = "••••••••"
        if (!updated.sftp?.password.isNullOrEmpty()) updated.sftp?.password = "••••••••"
        if (!updated.s3?.secretKey.isNullOrEmpty()) updated.s3?.secretKey = "••••••••"

        return ResponseEntity.ok(updated)
    }

    @PostMapping("/storage/test")
    @PreAuthorize("hasRole('mod')")
    fun testStorageSettings(@RequestBody body: StorageConfigDto): ResponseEntity<*> {
        val existing = storageService.getStorageConfig()

        if (body.smb?.password == "••••••••" || body.smb?.password.isNullOrEmpty()) {
            if (body.smb != null) body.smb?.password = existing.smb?.password ?: ""
        }
        if (body.webdav?.password == "••••••••" || body.webdav?.password.isNullOrEmpty()) {
            if (body.webdav != null) body.webdav?.password = existing.webdav?.password ?: ""
        }
        if (body.sftp?.password == "••••••••" || body.sftp?.password.isNullOrEmpty()) {
            if (body.sftp != null) body.sftp?.password = existing.sftp?.password ?: ""
        }
        if (body.s3?.secretKey == "••••••••" || body.s3?.secretKey.isNullOrEmpty()) {
            if (body.s3 != null) body.s3?.secretKey = existing.s3?.secretKey ?: ""
        }

        val result = storageService.testConnection(body)
        return ResponseEntity.ok(result)
    }

    @GetMapping("/storage/migration-status")
    @PreAuthorize("hasRole('mod')")
    fun getStorageMigrationStatus(): ResponseEntity<*> {
        val setting = appSettingRepository.findById("storage_migration_status").orElse(null)
            ?: return ResponseEntity.ok(mapOf(
                "status" to "idle",
                "total_files" to 0,
                "migrated_files" to 0,
                "failed_files" to 0,
                "errors" to emptyList<String>()
            ))
        val data = try {
            objectMapper.readValue(setting.value, Map::class.java)
        } catch (e: Exception) {
            mapOf(
                "status" to "idle",
                "total_files" to 0,
                "migrated_files" to 0,
                "failed_files" to 0,
                "errors" to emptyList<String>()
            )
        }
        return ResponseEntity.ok(data)
    }

    // --- Receipts Scan/Clean ---
    @PostMapping("/receipts/scan")
    @PreAuthorize("hasRole('mod')")
    fun scanOrphans(): ResponseEntity<*> {
        val config = storageService.getStorageConfig()
        val localPath = config.local?.path ?: "/app/data/receipts"
        val baseDir = File(localPath).absoluteFile

        if (!baseDir.exists() || !baseDir.isDirectory) {
            return ResponseEntity.ok(mapOf("orphans" to emptyList<String>(), "count" to 0))
        }

        val allFiles = listLocalFiles(baseDir, baseDir)
        val referencedFiles = receiptRepository.findAllFilePaths().toSet()
        val orphans = allFiles.filter { it !in referencedFiles }

        return ResponseEntity.ok(mapOf("orphans" to orphans, "count" to orphans.size))
    }

    @PostMapping("/receipts/clean")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun cleanOrphans(): ResponseEntity<*> {
        val config = storageService.getStorageConfig()
        val localPath = config.local?.path ?: "/app/data/receipts"
        val baseDir = File(localPath).absoluteFile

        if (!baseDir.exists() || !baseDir.isDirectory) {
            return ResponseEntity.ok(mapOf("cleaned_count" to 0))
        }

        val allFiles = listLocalFiles(baseDir, baseDir)
        val referencedFiles = receiptRepository.findAllFilePaths().toSet()
        val orphans = allFiles.filter { it !in referencedFiles }

        var cleanedCount = 0
        for (orphan in orphans) {
            val file = File(baseDir, orphan).absoluteFile
            if (file.exists() && file.startsWith(baseDir)) {
                if (file.delete()) {
                    cleanedCount++
                }
            }
        }

        return ResponseEntity.ok(mapOf("cleaned_count" to cleanedCount))
    }
}

data class DailyAllowanceOut(
    @JsonProperty("daily_allowance_rate") val dailyAllowanceRate: BigDecimal
)

data class DailyAllowanceUpdate(
    @JsonProperty("daily_allowance_rate") val dailyAllowanceRate: BigDecimal
)

data class MileageRatesOut(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: BigDecimal,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: BigDecimal,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal,
    @JsonProperty("fuel_price_ron_per_liter") val fuelPriceRonPerLiter: BigDecimal,
    @JsonProperty("pension_rate") val pensionRate: BigDecimal,
    @JsonProperty("health_rate") val healthRate: BigDecimal,
    @JsonProperty("income_tax_rate") val incomeTaxRate: BigDecimal,
    @JsonProperty("tax_deduction_eur") val taxDeductionEur: BigDecimal
)

data class MileageRatesUpdate(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: BigDecimal? = null,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: BigDecimal? = null,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal? = null,
    @JsonProperty("fuel_price_ron_per_liter") val fuelPriceRonPerLiter: BigDecimal? = null,
    @JsonProperty("pension_rate") val pensionRate: BigDecimal? = null,
    @JsonProperty("health_rate") val healthRate: BigDecimal? = null,
    @JsonProperty("income_tax_rate") val incomeTaxRate: BigDecimal? = null,
    @JsonProperty("tax_deduction_eur") val taxDeductionEur: BigDecimal? = null
)

data class FxMarginsOut(
    val margins: Map<String, BigDecimal>,
    @JsonProperty("default_margin") val defaultMargin: BigDecimal,
    val currencies: List<String>
)

data class FxMarginsUpdate(
    val margins: Map<String, BigDecimal>? = null,
    @JsonProperty("default_margin") val defaultMargin: BigDecimal? = null
)

data class OCRConfigOut(
    val provider: String,
    @JsonProperty("ocr_enabled") val ocrEnabled: Boolean,
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null
)

data class OCRConfigUpdate(
    val provider: String? = null,
    @JsonProperty("ocr_enabled") val ocrEnabled: Boolean? = null,
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null
)

data class OCRTestRequest(
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null,
    @JsonProperty("provider") val provider: String? = null
)

data class EmailConfigOut(
    @JsonProperty("emails_enabled") val emailsEnabled: Boolean,
    @JsonProperty("smtp_host") val smtpHost: String,
    @JsonProperty("smtp_port") val smtpPort: Int,
    @JsonProperty("smtp_user") val smtpUser: String,
    @JsonProperty("smtp_from") val smtpFrom: String,
    @JsonProperty("password_set") val passwordSet: Boolean
)

data class EmailConfigIn(
    @JsonProperty("emails_enabled") val emailsEnabled: Boolean,
    @JsonProperty("smtp_host") val smtpHost: String,
    @JsonProperty("smtp_port") @field:Min(1) val smtpPort: Int,
    @JsonProperty("smtp_user") val smtpUser: String,
    @JsonProperty("smtp_pass") val smtpPass: String,
    @JsonProperty("smtp_from") val smtpFrom: String
)

data class TestEmailIn(
    @field:NotBlank val to: String
)

data class ImapConfigOut(
    val enabled: Boolean,
    @JsonProperty("imap_host") val imapHost: String,
    @JsonProperty("imap_port") val imapPort: Int,
    @JsonProperty("imap_user") val imapUser: String,
    @JsonProperty("imap_folder") val imapFolder: String,
    @JsonProperty("password_set") val passwordSet: Boolean,
    @JsonProperty("active_parser") val activeParser: String
)

data class ImapConfigIn(
    val enabled: Boolean,
    @JsonProperty("imap_host") val imapHost: String,
    @JsonProperty("imap_port") @field:Min(1) val imapPort: Int,
    @JsonProperty("imap_user") val imapUser: String,
    @JsonProperty("imap_pass") var imapPass: String = "",
    @JsonProperty("imap_folder") var imapFolder: String = "INBOX"
)

data class EmailSimulationIn(
    @JsonProperty("from_address") @field:NotBlank val fromAddress: String,
    @JsonProperty("body_text") @field:NotBlank val bodyText: String,
    @JsonProperty("parser") val parser: String? = null
)
