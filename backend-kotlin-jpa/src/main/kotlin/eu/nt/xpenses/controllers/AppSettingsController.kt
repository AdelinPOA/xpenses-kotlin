package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.models.AppSetting
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
        val value = appSettingRepository.findById("daily_allowance_rate").orElse(null)?.value?.toDoubleOrNull() ?: 50.0
        return ResponseEntity.ok(DailyAllowanceOut(value))
    }

    @PatchMapping("/daily-allowance-rate")
    @PreAuthorize("hasRole('chef_finance')")
    @Transactional
    fun updateDailyAllowanceRate(@Valid @RequestBody body: DailyAllowanceUpdate): ResponseEntity<DailyAllowanceOut> {
        if (body.dailyAllowanceRate < 0) {
            return ResponseEntity.badRequest().build()
        }
        appSettingRepository.save(AppSetting("daily_allowance_rate", body.dailyAllowanceRate.toString(), Instant.now()))
        return ResponseEntity.ok(DailyAllowanceOut(body.dailyAllowanceRate))
    }

    // --- Mileage Rates ---
    @GetMapping("/mileage-rates")
    fun readMileageRates(): ResponseEntity<MileageRatesOut> {
        val btStr = appSettingRepository.findById("mileage_rate_before_tax").orElse(null)?.value ?: "0.60"
        val atStr = appSettingRepository.findById("mileage_rate_after_tax").orElse(null)?.value ?: "0.40"
        return ResponseEntity.ok(MileageRatesOut(btStr.toDouble(), atStr.toDouble()))
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
        val btStr = appSettingRepository.findById("mileage_rate_before_tax").orElse(null)?.value ?: "0.60"
        val atStr = appSettingRepository.findById("mileage_rate_after_tax").orElse(null)?.value ?: "0.40"
        return ResponseEntity.ok(MileageRatesOut(btStr.toDouble(), atStr.toDouble()))
    }

    // --- OCR Settings ---
    @GetMapping("/ocr")
    @PreAuthorize("hasRole('mod')")
    fun readOcrSettings(): ResponseEntity<OCRConfigOut> {
        val config = ocrService.getOcrConfig()
        return ResponseEntity.ok(OCRConfigOut(
            provider = config.provider,
            ocrEnabled = config.ocrEnabled,
            geminiApiKey = if (config.passwordSet) "••••••••" else null,
            mineruUrl = config.mineruUrl
        ))
    }

    @PatchMapping("/ocr")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateOcrSettings(@Valid @RequestBody body: OCRConfigUpdate): ResponseEntity<OCRConfigOut> {
        val existing = ocrService.getOcrConfig()
        val provider = body.provider ?: existing.provider
        val ocrEnabled = body.ocrEnabled ?: existing.ocrEnabled
        val mineruUrl = body.mineruUrl ?: existing.mineruUrl

        val key = if (body.geminiApiKey == "••••••••" || body.geminiApiKey == null) {
            existing.geminiApiKey
        } else {
            body.geminiApiKey
        }

        val config = OCRConfig(
            provider = provider,
            ocrEnabled = ocrEnabled,
            geminiApiKey = key,
            mineruUrl = mineruUrl
        )
        ocrService.saveOcrConfig(config)

        val updated = ocrService.getOcrConfig()
        return ResponseEntity.ok(OCRConfigOut(
            provider = updated.provider,
            ocrEnabled = updated.ocrEnabled,
            geminiApiKey = if (updated.passwordSet) "••••••••" else null,
            mineruUrl = updated.mineruUrl
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

    @PostMapping("/ocr/test-mineru")
    @PreAuthorize("hasRole('mod')")
    fun testMineruSettings(): ResponseEntity<*> {
        val config = ocrService.getOcrConfig()
        val url = config.mineruUrl.ifEmpty { "http://mineru:8000" }
        val result = ocrService.testMineruConnection(url)
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
    fun readStorageSettings(): ResponseEntity<Map<String, Any>> {
        val config = storageService.getStorageConfig()
        val masked = config.toMutableMap()
        for (ptype in listOf("smb", "webdav", "sftp")) {
            val section = masked[ptype] as? Map<*, *>
            if (section != null && section.containsKey("password") && (section["password"] as? String)?.isNotEmpty() == true) {
                val secMutable = section.toMutableMap()
                secMutable["password"] = "••••••••"
                masked[ptype] = secMutable
            }
        }
        val s3 = masked["s3"] as? Map<*, *>
        if (s3 != null && s3.containsKey("secret_key") && (s3["secret_key"] as? String)?.isNotEmpty() == true) {
            val s3Mutable = s3.toMutableMap()
            s3Mutable["secret_key"] = "••••••••"
            masked["s3"] = s3Mutable
        }
        return ResponseEntity.ok(masked)
    }

    @PatchMapping("/storage")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateStorageSettings(
        @RequestBody body: Map<String, Any>,
        @RequestParam(name = "migrate_existing", defaultValue = "false") migrateExisting: Boolean
    ): ResponseEntity<Map<String, Any>> {
        val oldConfig = storageService.getStorageConfig()
        storageService.saveStorageConfig(body)

        if (migrateExisting) {
            val receipts = receiptRepository.findAll()
            storageService.startMigration(oldConfig, body, receipts)
        }
        
        val updated = storageService.getStorageConfig()
        val masked = updated.toMutableMap()
        for (ptype in listOf("smb", "webdav", "sftp")) {
            val section = masked[ptype] as? Map<*, *>
            if (section != null && section.containsKey("password") && (section["password"] as? String)?.isNotEmpty() == true) {
                val secMutable = section.toMutableMap()
                secMutable["password"] = "••••••••"
                masked[ptype] = secMutable
            }
        }
        val s3 = masked["s3"] as? Map<*, *>
        if (s3 != null && s3.containsKey("secret_key") && (s3["secret_key"] as? String)?.isNotEmpty() == true) {
            val s3Mutable = s3.toMutableMap()
            s3Mutable["secret_key"] = "••••••••"
            masked["s3"] = s3Mutable
        }
        return ResponseEntity.ok(masked)
    }

    @PostMapping("/storage/test")
    @PreAuthorize("hasRole('mod')")
    fun testStorageSettings(@RequestBody body: Map<String, Any>): ResponseEntity<*> {
        val config = body.toMutableMap()
        val ptype = config["provider_type"] as? String ?: "local"
        val existing = storageService.getStorageConfig()

        if (ptype in listOf("smb", "webdav", "sftp") && config.containsKey(ptype)) {
            val section = (config[ptype] as? Map<*, *>)?.toMutableMap() ?: mutableMapOf()
            val pw = section["password"] as? String
            if (pw == "••••••••" || pw.isNullOrEmpty()) {
                val existingSection = existing[ptype] as? Map<*, *>
                section["password"] = existingSection?.get("password") ?: ""
            }
            config[ptype] = section
        } else if (ptype == "s3" && config.containsKey("s3")) {
            val s3 = (config["s3"] as? Map<*, *>)?.toMutableMap() ?: mutableMapOf()
            val sk = s3["secret_key"] as? String
            if (sk == "••••••••" || sk.isNullOrEmpty()) {
                val existingS3 = existing["s3"] as? Map<*, *>
                s3["secret_key"] = existingS3?.get("secret_key") ?: ""
            }
            config["s3"] = s3
        }

        val result = storageService.testConnection(config)
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
        val localConfig = config["local"] as? Map<*, *>
        val localPath = localConfig?.get("path") as? String ?: "/app/data/receipts"
        val baseDir = File(localPath).absoluteFile

        if (!baseDir.exists() || !baseDir.isDirectory) {
            return ResponseEntity.ok(mapOf("orphans" to emptyList<String>(), "count" to 0))
        }

        val allFiles = listLocalFiles(baseDir, baseDir)
        val referencedFiles = receiptRepository.findAll().mapNotNull { it.filePath }.toSet()
        val orphans = allFiles.filter { it !in referencedFiles }

        return ResponseEntity.ok(mapOf("orphans" to orphans, "count" to orphans.size))
    }

    @PostMapping("/receipts/clean")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun cleanOrphans(): ResponseEntity<*> {
        val config = storageService.getStorageConfig()
        val localConfig = config["local"] as? Map<*, *>
        val localPath = localConfig?.get("path") as? String ?: "/app/data/receipts"
        val baseDir = File(localPath).absoluteFile

        if (!baseDir.exists() || !baseDir.isDirectory) {
            return ResponseEntity.ok(mapOf("cleaned_count" to 0))
        }

        val allFiles = listLocalFiles(baseDir, baseDir)
        val referencedFiles = receiptRepository.findAll().mapNotNull { it.filePath }.toSet()
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
    @JsonProperty("daily_allowance_rate") val dailyAllowanceRate: Double
)

data class DailyAllowanceUpdate(
    @JsonProperty("daily_allowance_rate") @field:Min(0) val dailyAllowanceRate: Double
)

data class MileageRatesOut(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: Double,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: Double
)

data class MileageRatesUpdate(
    @JsonProperty("mileage_rate_before_tax") @field:Min(0) val mileageRateBeforeTax: Double? = null,
    @JsonProperty("mileage_rate_after_tax") @field:Min(0) val mileageRateAfterTax: Double? = null
)

data class OCRConfigOut(
    val provider: String,
    @JsonProperty("ocr_enabled") val ocrEnabled: Boolean,
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null,
    @JsonProperty("mineru_url") val mineruUrl: String? = null
)

data class OCRConfigUpdate(
    val provider: String? = null,
    @JsonProperty("ocr_enabled") val ocrEnabled: Boolean? = null,
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null,
    @JsonProperty("mineru_url") val mineruUrl: String? = null
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
