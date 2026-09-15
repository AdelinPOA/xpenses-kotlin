package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.DailyAllowanceOut
import eu.nt.xpenses.dto.settings.DailyAllowanceUpdate
import eu.nt.xpenses.dto.settings.EmailConfigIn
import eu.nt.xpenses.dto.settings.EmailConfigOut
import eu.nt.xpenses.dto.settings.EmailSimulationIn
import eu.nt.xpenses.dto.settings.FxMarginsOut
import eu.nt.xpenses.dto.settings.FxMarginsUpdate
import eu.nt.xpenses.dto.settings.FxProvidersOut
import eu.nt.xpenses.dto.settings.FxProvidersUpdate
import eu.nt.xpenses.dto.settings.FxTestRequest
import eu.nt.xpenses.dto.settings.FxTestResponse
import eu.nt.xpenses.dto.settings.ImapConfigIn
import eu.nt.xpenses.dto.settings.ImapConfigOut
import eu.nt.xpenses.dto.settings.IngestionRetryIn
import eu.nt.xpenses.ingestion.TechnicianEmailIngestion
import eu.nt.xpenses.dto.settings.MileageRatesOut
import eu.nt.xpenses.dto.settings.MileageRatesUpdate
import eu.nt.xpenses.dto.settings.MobileUiConfigOut
import eu.nt.xpenses.dto.settings.MobileUiConfigUpdate
import eu.nt.xpenses.dto.settings.OCRConfigOut
import eu.nt.xpenses.dto.settings.OCRConfigUpdate
import eu.nt.xpenses.dto.settings.OCRTestRequest
import eu.nt.xpenses.dto.settings.TestEmailIn
import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.services.AppSettingsService
import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.EmailConfig
import eu.nt.xpenses.services.EmailSettingsService
import eu.nt.xpenses.services.ImapConfig
import eu.nt.xpenses.services.OCRConfig
import eu.nt.xpenses.services.OcrService
import eu.nt.xpenses.services.StorageService
import eu.nt.xpenses.services.fx.HttpFxRateProvider
import eu.nt.xpenses.services.fx.FxRateSource
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.time.LocalDate

@RestController
@RequestMapping("/api/settings")
class AppSettingsController(
    private val appSettingsService: AppSettingsService,
    private val ocrService: OcrService,
    private val emailSettingsService: EmailSettingsService,
    private val technicianEmailIngestion: TechnicianEmailIngestion,
    private val storageService: StorageService,
    private val emailImportService: EmailImportService,
    private val httpFxRateProvider: HttpFxRateProvider
) {

    // --- Mobile UI ---
    @GetMapping("/ui")
    fun readMobileUiConfig(): ResponseEntity<MobileUiConfigOut> =
        ResponseEntity.ok(MobileUiConfigOut(appSettingsService.isMobileQuickAddFabEnabled()))

    @PatchMapping("/ui")
    @PreAuthorize("hasRole('chef_finance')")
    fun updateMobileUiConfig(@Valid @RequestBody body: MobileUiConfigUpdate): ResponseEntity<MobileUiConfigOut> =
        ResponseEntity.ok(MobileUiConfigOut(appSettingsService.updateMobileQuickAddFab(body.mobileQuickAddFabEnabled)))

    // --- Daily Allowance Rate ---
    @GetMapping("/daily-allowance-rate")
    fun readDailyAllowanceRate(): ResponseEntity<DailyAllowanceOut> =
        ResponseEntity.ok(DailyAllowanceOut(appSettingsService.getDailyAllowanceRate()))

    @PatchMapping("/daily-allowance-rate")
    @PreAuthorize("hasRole('chef_finance')")
    fun updateDailyAllowanceRate(@Valid @RequestBody body: DailyAllowanceUpdate): ResponseEntity<DailyAllowanceOut> {
        return try {
            val updated = appSettingsService.updateDailyAllowanceRate(body.dailyAllowanceRate)
            ResponseEntity.ok(DailyAllowanceOut(updated))
        } catch (_: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    // --- Mileage Rates ---
    @GetMapping("/mileage-rates")
    fun readMileageRates(): ResponseEntity<MileageRatesOut> =
        ResponseEntity.ok(appSettingsService.getMileageRates())

    @PatchMapping("/mileage-rates")
    @PreAuthorize("hasRole('chef_finance')")
    fun updateMileageRates(@Valid @RequestBody body: MileageRatesUpdate): ResponseEntity<MileageRatesOut> =
        ResponseEntity.ok(appSettingsService.updateMileageRates(body))

    // --- FX Margins ---
    @GetMapping("/fx-margins")
    fun readFxMargins(): ResponseEntity<FxMarginsOut> =
        ResponseEntity.ok(appSettingsService.getFxMargins())

    @PatchMapping("/fx-margins")
    @PreAuthorize("hasRole('chef_finance')")
    fun updateFxMargins(@Valid @RequestBody body: FxMarginsUpdate): ResponseEntity<FxMarginsOut> =
        ResponseEntity.ok(appSettingsService.updateFxMargins(body))

    // --- FX Provider Priority ---
    @GetMapping("/fx-providers")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun readFxProviders(): ResponseEntity<FxProvidersOut> {
        val current = httpFxRateProvider.getProviderPriority().map { it.name }
        val available = FxRateSource.entries.map { it.name }
        return ResponseEntity.ok(FxProvidersOut(providers = current, availableProviders = available))
    }

    @PatchMapping("/fx-providers")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun updateFxProviders(@Valid @RequestBody body: FxProvidersUpdate): ResponseEntity<FxProvidersOut> {
        val parsed = body.providers.mapNotNull { name ->
            try { FxRateSource.valueOf(name.uppercase().trim()) } catch (_: Exception) { null }
        }
        if (parsed.isEmpty()) {
            return ResponseEntity.badRequest().build()
        }
        httpFxRateProvider.saveProviderPriority(parsed)
        val updated = httpFxRateProvider.getProviderPriority().map { it.name }
        val available = FxRateSource.entries.map { it.name }
        return ResponseEntity.ok(FxProvidersOut(providers = updated, availableProviders = available))
    }

    @PostMapping("/fx-providers/test")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun testFxProviders(@RequestBody body: FxTestRequest): ResponseEntity<FxTestResponse> {
        val currency = body.currency.trim().uppercase()
        if (currency.isBlank()) {
            return ResponseEntity.ok(FxTestResponse(success = false, message = "Currency code is required"))
        }
        val date = body.date?.takeIf { it.isNotBlank() }?.let {
            try { LocalDate.parse(it) } catch (_: Exception) { null }
        } ?: LocalDate.now()

        val providerRate = httpFxRateProvider.resolve(currency, date)
        return if (providerRate != null) {
            ResponseEntity.ok(FxTestResponse(
                success = true,
                message = "Successfully resolved $currency to EUR via ${providerRate.source.name}",
                rate = providerRate.rateToEur,
                source = providerRate.source.name,
                sourceDate = providerRate.sourceDate.toString()
            ))
        } else {
            ResponseEntity.ok(FxTestResponse(
                success = false,
                message = "Could not resolve rate for $currency on $date from any configured provider"
            ))
        }
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
    fun updateOcrSettings(@Valid @RequestBody body: OCRConfigUpdate): ResponseEntity<OCRConfigOut> {
        val existing = ocrService.getOcrConfig()
        val key = if (body.geminiApiKey == "••••••••" || body.geminiApiKey == null) {
            existing.geminiApiKey
        } else {
            body.geminiApiKey
        }

        ocrService.saveOcrConfig(
            OCRConfig(
                provider = body.provider ?: existing.provider,
                ocrEnabled = body.ocrEnabled ?: existing.ocrEnabled,
                geminiApiKey = key
            )
        )

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
    fun updateEmailSettings(@Valid @RequestBody body: EmailConfigIn): ResponseEntity<EmailConfigOut> {
        val password = if (body.smtpPass.isEmpty()) {
            emailSettingsService.getSmtpConfig().smtpPass
        } else {
            body.smtpPass
        }

        emailSettingsService.saveSmtpConfig(EmailConfig(
            emailsEnabled = body.emailsEnabled,
            smtpHost = body.smtpHost,
            smtpPort = body.smtpPort,
            smtpUser = body.smtpUser,
            smtpPass = password,
            smtpFrom = body.smtpFrom
        ))

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
    private fun imapActiveParser(): String {
        val ocrCfg = ocrService.getOcrConfig()
        return if (ocrCfg.ocrEnabled && (ocrCfg.provider == "gemini" || ocrCfg.provider.startsWith("gemini-")) && ocrCfg.geminiApiKey.isNotEmpty()) "gemini" else "local"
    }

    @GetMapping("/imap")
    @PreAuthorize("hasRole('mod')")
    fun readImapSettings(): ResponseEntity<ImapConfigOut> {
        val config = emailSettingsService.getImapConfig()
        return ResponseEntity.ok(ImapConfigOut(
            enabled = config.enabled,
            imapHost = config.imapHost,
            imapPort = config.imapPort,
            imapUser = config.imapUser,
            imapFolder = config.imapFolder,
            passwordSet = config.passwordSet,
            activeParser = imapActiveParser()
        ))
    }

    @PatchMapping("/imap")
    @PreAuthorize("hasRole('mod')")
    fun updateImapSettings(@Valid @RequestBody body: ImapConfigIn): ResponseEntity<ImapConfigOut> {
        val password = if (body.imapPass.isEmpty()) {
            emailSettingsService.getImapConfig().imapPass
        } else {
            body.imapPass
        }

        emailSettingsService.saveImapConfig(ImapConfig(
            enabled = body.enabled,
            imapHost = body.imapHost,
            imapPort = body.imapPort,
            imapUser = body.imapUser,
            imapPass = password,
            imapFolder = body.imapFolder
        ))

        val updated = emailSettingsService.getImapConfig()
        return ResponseEntity.ok(ImapConfigOut(
            enabled = updated.enabled,
            imapHost = updated.imapHost,
            imapPort = updated.imapPort,
            imapUser = updated.imapUser,
            imapFolder = updated.imapFolder,
            passwordSet = updated.passwordSet,
            activeParser = imapActiveParser()
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

    @GetMapping("/imap/ingestion")
    @PreAuthorize("hasRole('mod')")
    fun listImapIngestionRecovery(): ResponseEntity<*> =
        ResponseEntity.ok(technicianEmailIngestion.listRecovery())

    @PostMapping("/imap/ingestion/retry")
    @PreAuthorize("hasRole('mod')")
    fun retryImapIngestion(@Valid @RequestBody body: IngestionRetryIn): ResponseEntity<*> =
        ResponseEntity.ok(technicianEmailIngestion.retry(body.messageKey))

    // --- Storage Settings ---
    @GetMapping("/storage")
    @PreAuthorize("hasRole('mod')")
    fun readStorageSettings(): ResponseEntity<StorageConfigDto> {
        val config = storageService.getStorageConfig()
        appSettingsService.maskStorageSecrets(config)
        return ResponseEntity.ok(config)
    }

    @PatchMapping("/storage")
    @PreAuthorize("hasRole('mod')")
    fun updateStorageSettings(
        @RequestBody body: StorageConfigDto,
        @RequestParam(name = "migrate_existing", defaultValue = "false") migrateExisting: Boolean
    ): ResponseEntity<StorageConfigDto> {
        val updated = appSettingsService.updateStorageSettings(body, migrateExisting)
        appSettingsService.maskStorageSecrets(updated)
        return ResponseEntity.ok(updated)
    }

    @PostMapping("/storage/test")
    @PreAuthorize("hasRole('mod')")
    fun testStorageSettings(@RequestBody body: StorageConfigDto): ResponseEntity<*> {
        val existing = storageService.getStorageConfig()
        appSettingsService.restoreStoredSecrets(body, existing, keepOnBlank = true)
        val result = storageService.testConnection(body)
        return ResponseEntity.ok(result)
    }

    @GetMapping("/storage/migration-status")
    @PreAuthorize("hasRole('mod')")
    fun getStorageMigrationStatus(): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(appSettingsService.getStorageMigrationStatus())

    // --- Receipts Scan/Clean ---
    @PostMapping("/receipts/scan")
    @PreAuthorize("hasRole('mod')")
    fun scanOrphans(): ResponseEntity<*> {
        val orphans = appSettingsService.scanOrphanReceipts()
        return ResponseEntity.ok(mapOf("orphans" to orphans, "count" to orphans.size))
    }

    @PostMapping("/receipts/clean")
    @PreAuthorize("hasRole('mod')")
    fun cleanOrphans(): ResponseEntity<*> =
        ResponseEntity.ok(mapOf("cleaned_count" to appSettingsService.cleanOrphanReceipts()))
}
