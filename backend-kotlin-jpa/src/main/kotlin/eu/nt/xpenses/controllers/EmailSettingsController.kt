package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.EmailConfigIn
import eu.nt.xpenses.dto.settings.EmailConfigOut
import eu.nt.xpenses.dto.settings.EmailSimulationIn
import eu.nt.xpenses.dto.settings.ImapConfigIn
import eu.nt.xpenses.dto.settings.ImapConfigOut
import eu.nt.xpenses.dto.settings.IngestionRetryIn
import eu.nt.xpenses.dto.settings.TestEmailIn
import eu.nt.xpenses.ingestion.TechnicianEmailIngestion
import eu.nt.xpenses.services.EmailConfig
import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.EmailSettingsService
import eu.nt.xpenses.services.ImapConfig
import eu.nt.xpenses.services.OcrService
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/settings")
class EmailSettingsController(
    private val emailSettingsService: EmailSettingsService,
    private val technicianEmailIngestion: TechnicianEmailIngestion,
    private val emailImportService: EmailImportService,
    private val ocrService: OcrService,
) {
    @GetMapping("/email")
    @PreAuthorize("hasRole('mod')")
    fun readEmailSettings(): ResponseEntity<EmailConfigOut> {
        val config = emailSettingsService.getSmtpConfig()
        return ResponseEntity.ok(
            EmailConfigOut(
                emailsEnabled = config.emailsEnabled,
                smtpHost = config.smtpHost,
                smtpPort = config.smtpPort,
                smtpUser = config.smtpUser,
                smtpFrom = config.smtpFrom,
                passwordSet = config.passwordSet,
            ),
        )
    }

    @PatchMapping("/email")
    @PreAuthorize("hasRole('mod')")
    fun updateEmailSettings(
        @Valid @RequestBody body: EmailConfigIn,
    ): ResponseEntity<EmailConfigOut> {
        val password =
            if (body.smtpPass.isEmpty()) {
                emailSettingsService.getSmtpConfig().smtpPass
            } else {
                body.smtpPass
            }

        emailSettingsService.saveSmtpConfig(
            EmailConfig(
                emailsEnabled = body.emailsEnabled,
                smtpHost = body.smtpHost,
                smtpPort = body.smtpPort,
                smtpUser = body.smtpUser,
                smtpPass = password,
                smtpFrom = body.smtpFrom,
            ),
        )

        val updated = emailSettingsService.getSmtpConfig()
        return ResponseEntity.ok(
            EmailConfigOut(
                emailsEnabled = updated.emailsEnabled,
                smtpHost = updated.smtpHost,
                smtpPort = updated.smtpPort,
                smtpUser = updated.smtpUser,
                smtpFrom = updated.smtpFrom,
                passwordSet = updated.passwordSet,
            ),
        )
    }

    @PostMapping("/email/test")
    @PreAuthorize("hasRole('mod')")
    fun testEmailSettings(
        @Valid @RequestBody body: TestEmailIn,
    ): ResponseEntity<*> {
        val config = emailSettingsService.getSmtpConfig()
        return ResponseEntity.ok(emailSettingsService.testSmtpConnection(config, body.to))
    }

    private fun imapActiveParser(): String {
        val config = ocrService.getOcrConfig()
        val activeModelIds =
            config.models
                .filter { it.active && it.tested }
                .map { it.id }
                .toSet()
        return if (config.ocrEnabled && config.delegationModelChain.any { it in activeModelIds }) "ai" else "local"
    }

    @GetMapping("/imap")
    @PreAuthorize("hasRole('mod')")
    fun readImapSettings(): ResponseEntity<ImapConfigOut> {
        val config = emailSettingsService.getImapConfig()
        return ResponseEntity.ok(
            ImapConfigOut(
                enabled = config.enabled,
                imapHost = config.imapHost,
                imapPort = config.imapPort,
                imapUser = config.imapUser,
                imapFolder = config.imapFolder,
                passwordSet = config.passwordSet,
                activeParser = imapActiveParser(),
            ),
        )
    }

    @PatchMapping("/imap")
    @PreAuthorize("hasRole('mod')")
    fun updateImapSettings(
        @Valid @RequestBody body: ImapConfigIn,
    ): ResponseEntity<ImapConfigOut> {
        val password =
            if (body.imapPass.isEmpty()) {
                emailSettingsService.getImapConfig().imapPass
            } else {
                body.imapPass
            }

        emailSettingsService.saveImapConfig(
            ImapConfig(
                enabled = body.enabled,
                imapHost = body.imapHost,
                imapPort = body.imapPort,
                imapUser = body.imapUser,
                imapPass = password,
                imapFolder = body.imapFolder,
            ),
        )

        val updated = emailSettingsService.getImapConfig()
        return ResponseEntity.ok(
            ImapConfigOut(
                enabled = updated.enabled,
                imapHost = updated.imapHost,
                imapPort = updated.imapPort,
                imapUser = updated.imapUser,
                imapFolder = updated.imapFolder,
                passwordSet = updated.passwordSet,
                activeParser = imapActiveParser(),
            ),
        )
    }

    @PostMapping("/imap/test")
    @PreAuthorize("hasRole('mod')")
    fun testImapSettings(
        @Valid @RequestBody body: ImapConfigIn,
    ): ResponseEntity<*> {
        val password =
            if (body.imapPass.isEmpty()) {
                emailSettingsService.getImapConfig().imapPass
            } else {
                body.imapPass
            }

        val config =
            ImapConfig(
                enabled = body.enabled,
                imapHost = body.imapHost,
                imapPort = body.imapPort,
                imapUser = body.imapUser,
                imapPass = password,
                imapFolder = body.imapFolder,
            )
        return ResponseEntity.ok(emailSettingsService.testImapConnection(config))
    }

    @PostMapping("/imap/simulate")
    @PreAuthorize("hasRole('mod')")
    fun simulateEmail(
        @Valid @RequestBody body: EmailSimulationIn,
    ): ResponseEntity<*> =
        ResponseEntity.ok(emailImportService.simulateIncomingEmail(body.fromAddress, body.bodyText, body.parser))

    @GetMapping("/imap/ingestion")
    @PreAuthorize("hasRole('mod')")
    fun listImapIngestionRecovery(): ResponseEntity<*> =
        ResponseEntity.ok(technicianEmailIngestion.listRecovery())

    @PostMapping("/imap/ingestion/retry")
    @PreAuthorize("hasRole('mod')")
    fun retryImapIngestion(
        @Valid @RequestBody body: IngestionRetryIn,
    ): ResponseEntity<*> =
        ResponseEntity.ok(technicianEmailIngestion.retry(body.messageKey))
}
