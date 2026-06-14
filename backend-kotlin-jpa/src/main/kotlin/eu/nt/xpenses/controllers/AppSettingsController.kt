package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.*
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import java.time.Instant

@RestController
@RequestMapping("/api/settings")
class AppSettingsController(
    private val appSettingRepository: AppSettingRepository,
    private val ocrService: OcrService,
    private val emailSettingsService: EmailSettingsService,
    private val storageService: StorageService,
    private val emailImportService: EmailImportService
) {

    // --- Mileage Rates ---
    @GetMapping("/mileage-rates")
    fun readMileageRates(): ResponseEntity<MileageRatesOut> {
        val btStr = appSettingRepository.findById("mileage_rate_before_tax").orElse(null)?.value ?: "0.60"
        val atStr = appSettingRepository.findById("mileage_rate_after_tax").orElse(null)?.value ?: "0.40"
        return ResponseEntity.ok(MileageRatesOut(btStr.toDouble(), atStr.toDouble()))
    }

    @PatchMapping("/mileage-rates")
    @PreAuthorize("hasRole('chef_finance')")
    fun updateMileageRates(@RequestBody body: MileageRatesUpdate): ResponseEntity<MileageRatesOut> {
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
    fun updateOcrSettings(@RequestBody body: OCRConfigUpdate): ResponseEntity<OCRConfigOut> {
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
    fun testOcrSettings(@RequestBody body: OCRTestRequest): ResponseEntity<*> {
        val key = if (body.geminiApiKey == "••••••••" || body.geminiApiKey.isNullOrEmpty()) {
            ocrService.getOcrConfig().geminiApiKey
        } else {
            body.geminiApiKey
        }

        if (key.isEmpty()) {
            return ResponseEntity.ok(mapOf("success" to false, "message" to "No API key provided or configured."))
        }

        val result = ocrService.testGeminiConnection(key)
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
    fun updateEmailSettings(@RequestBody body: EmailConfigIn): ResponseEntity<EmailConfigOut> {
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
    fun testEmailSettings(@RequestBody body: TestEmailIn): ResponseEntity<*> {
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
        val activeParser = if (ocrCfg.ocrEnabled && ocrCfg.provider == "gemini" && ocrCfg.geminiApiKey.isNotEmpty()) "gemini" else "local"

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
    fun updateImapSettings(@RequestBody body: ImapConfigIn): ResponseEntity<ImapConfigOut> {
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
        val activeParser = if (ocrCfg.ocrEnabled && ocrCfg.provider == "gemini" && ocrCfg.geminiApiKey.isNotEmpty()) "gemini" else "local"
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
    fun testImapSettings(@RequestBody body: ImapConfigIn): ResponseEntity<*> {
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
    fun simulateEmail(@RequestBody body: EmailSimulationIn): ResponseEntity<*> {
        val result = emailImportService.simulateIncomingEmail(body.fromAddress, body.bodyText)
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
    fun updateStorageSettings(
        @RequestBody body: Map<String, Any>,
        @RequestParam(name = "migrate_existing", defaultValue = "false") migrateExisting: Boolean
    ): ResponseEntity<Map<String, Any>> {
        storageService.saveStorageConfig(body)
        
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
        return ResponseEntity.ok(mapOf("status" to "idle", "copied" to 0, "total" to 0, "error" to null))
    }

    // --- Receipts Scan/Clean ---
    @PostMapping("/receipts/scan")
    @PreAuthorize("hasRole('mod')")
    fun scanOrphans(): ResponseEntity<*> {
        return ResponseEntity.ok(mapOf("orphans" to emptyList<String>()))
    }

    @PostMapping("/receipts/clean")
    @PreAuthorize("hasRole('mod')")
    fun cleanOrphans(): ResponseEntity<*> {
        return ResponseEntity.ok(mapOf("cleaned_count" to 0))
    }
}

data class MileageRatesOut(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: Double,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: Double
)

data class MileageRatesUpdate(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: Double? = null,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: Double? = null
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
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null
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
    @JsonProperty("smtp_port") val smtpPort: Int,
    @JsonProperty("smtp_user") val smtpUser: String,
    @JsonProperty("smtp_pass") val smtpPass: String,
    @JsonProperty("smtp_from") val smtpFrom: String
)

data class TestEmailIn(
    val to: String
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
    @JsonProperty("imap_port") val imapPort: Int,
    @JsonProperty("imap_user") val imapUser: String,
    @JsonProperty("imap_pass") var imapPass: String = "",
    @JsonProperty("imap_folder") var imapFolder: String = "INBOX"
)

data class EmailSimulationIn(
    @JsonProperty("from_address") val fromAddress: String,
    @JsonProperty("body_text") val bodyText: String
)
