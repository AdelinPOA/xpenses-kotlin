package eu.nt.xpenses.ingestion

import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.EmailSettingsService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant

@Service
class TechnicianEmailIngestionService(
    private val mailbox: MailboxAdapter,
    private val parser: DelegationEmailParser,
    private val ledger: ImapIngestionLedger,
    private val emailImportService: EmailImportService,
    private val emailSettingsService: EmailSettingsService
) : TechnicianEmailIngestion {
    private val log = LoggerFactory.getLogger(TechnicianEmailIngestionService::class.java)

    override fun poll(): PollSummary {
        val config = emailSettingsService.getImapConfig()
        if (!config.enabled || config.imapHost.isBlank() || config.imapUser.isBlank()) {
            return PollSummary()
        }

        val messages = try {
            mailbox.readUnseen()
        } catch (error: Exception) {
            log.error("Error while reading IMAP messages: {}", error.message, error)
            return PollSummary(failed = 1)
        }

        var summary = PollSummary()
        for (message in messages) {
            val outcome = try {
                processMessage(message)
            } catch (error: Exception) {
                log.error("Could not claim/process message {}: {}", message.messageKey, error.message, error)
                MessageOutcome.Failed
            }
            summary = summary.plus(outcome)
        }
        return summary
    }

    override fun listRecovery(): List<RecoveryItem> = ledger.listRecovery()

    override fun retry(messageKey: String): RecoveryResult {
        val message = mailbox.find(messageKey)
            ?: return RecoveryResult(messageKey, acknowledged = false, processed = false, rejected = false, reason = "Message no longer exists in the mailbox")
        if (!ledger.requestRetry(messageKey)) {
            return RecoveryResult(messageKey, acknowledged = false, processed = false, rejected = false, reason = "Message is not recoverable")
        }
        return when (val outcome = processMessage(message)) {
            MessageOutcome.Acknowledged -> RecoveryResult(messageKey, acknowledged = true, processed = false, rejected = false)
            MessageOutcome.Processed -> RecoveryResult(messageKey, acknowledged = false, processed = true, rejected = false)
            MessageOutcome.Rejected -> RecoveryResult(messageKey, acknowledged = false, processed = false, rejected = true)
            MessageOutcome.Failed -> RecoveryResult(messageKey, acknowledged = false, processed = false, rejected = false, reason = "Message remains retryable")
            MessageOutcome.Skipped -> RecoveryResult(messageKey, acknowledged = false, processed = false, rejected = false, reason = "Message is already being processed")
        }
    }

    private fun processMessage(message: InboundEmail): MessageOutcome {
        return when (val decision = ledger.claim(message.messageKey)) {
            ClaimDecision.Skip -> MessageOutcome.Skipped
            is ClaimDecision.Acknowledge -> acknowledge(message.messageKey, decision.claim)
            is ClaimDecision.Process -> processClaim(message, decision.claim)
        }
    }

    private fun processClaim(message: InboundEmail, claim: ProcessingClaim): MessageOutcome {
        val fromAddress = message.fromAddress
        return try {
            if (fromAddress.isNullOrBlank()) {
                ledger.markRejected(claim, "Missing From header")
                return acknowledgeAfterCompletion(message.messageKey, rejected = true)
            }

            if (hasExplicitAuthenticationFailure(message)) {
                ledger.markRejected(claim, "SPF/DKIM verification failed")
                return acknowledgeAfterCompletion(message.messageKey, rejected = true)
            }

            if (!emailImportService.hasActiveSender(fromAddress)) {
                ledger.markRejected(claim, "No active Technician found for sender")
                return acknowledgeAfterCompletion(message.messageKey, rejected = true)
            }

            when (val parsed = parser.parse(message)) {
                is ParseResult.Accepted -> {
                    val reportId = emailImportService.createReportAndComplete(claim, fromAddress, parsed.delegation)
                    if (reportId == null) {
                        ledger.markRejected(claim, "No active Technician found for sender")
                        acknowledgeAfterCompletion(message.messageKey, rejected = true)
                    } else {
                        acknowledgeAfterCompletion(message.messageKey, rejected = false)
                    }
                }
                is ParseResult.Rejected -> {
                    ledger.markRejected(claim, parsed.reason)
                    acknowledgeAfterCompletion(message.messageKey, rejected = true)
                }
                is ParseResult.RetryableFailure ->
                    failClaim(claim, IllegalStateException(parsed.reason), message.messageKey)
            }
        } catch (error: IngestionLeaseLostException) {
            log.info("Claim {} was reclaimed before completion", message.messageKey)
            MessageOutcome.Skipped
        } catch (error: Exception) {
            log.error("Failed to process message {}: {}", message.messageKey, error.message, error)
            failClaim(claim, error, message.messageKey)
        }
    }

    private fun failClaim(claim: ProcessingClaim, error: Throwable, messageKey: String): MessageOutcome {
        return try {
            ledger.markFailed(claim, error, nextAttemptAt(claim.attempt))
            MessageOutcome.Failed
        } catch (recordingError: Exception) {
            log.info("Claim {} was reclaimed before failure could be recorded: {}", messageKey, recordingError.message)
            MessageOutcome.Skipped
        }
    }

    private fun acknowledgeAfterCompletion(messageKey: String, rejected: Boolean): MessageOutcome {
        when (val decision = ledger.claim(messageKey)) {
            is ClaimDecision.Acknowledge -> acknowledge(messageKey, decision.claim, rejected)
            ClaimDecision.Skip -> Unit
            is ClaimDecision.Process -> return MessageOutcome.Failed
        }
        return if (rejected) MessageOutcome.Rejected else MessageOutcome.Processed
    }

    private fun acknowledge(
        messageKey: String,
        claim: AcknowledgementClaim,
        rejected: Boolean = false
    ): MessageOutcome {
        return try {
            mailbox.markSeen(messageKey)
            ledger.markAcknowledged(claim)
            if (rejected) MessageOutcome.Rejected else MessageOutcome.Acknowledged
        } catch (error: Exception) {
            log.warn("Failed to mark IMAP message {} as SEEN: {}", messageKey, error.message)
            try {
                ledger.markAcknowledgementFailed(claim, error, nextAcknowledgementAttemptAt(claim.attempt))
            } catch (recordingError: Exception) {
                log.error("Could not persist IMAP acknowledgement failure for {}: {}", messageKey, recordingError.message)
            }
            if (rejected) MessageOutcome.Rejected else MessageOutcome.Processed
        }
    }

    private fun hasExplicitAuthenticationFailure(message: InboundEmail): Boolean {
        val auth = message.authenticationResults.orEmpty().lowercase()
        val spf = message.receivedSpf.orEmpty().lowercase()
        return auth.contains("spf=fail") || auth.contains("dkim=fail") || spf.startsWith("fail")
    }

    private fun nextAttemptAt(attempt: Int): Instant {
        val delaySeconds = (30L * (1L shl (attempt - 1).coerceIn(0, 7))).coerceAtMost(3600L)
        return Instant.now().plusSeconds(delaySeconds)
    }

    private fun nextAcknowledgementAttemptAt(attempt: Int): Instant =
        Instant.now().plus(Duration.ofSeconds((30L * (1L shl (attempt - 1).coerceIn(0, 7))).coerceAtMost(3600L)))

    private fun PollSummary.plus(outcome: MessageOutcome): PollSummary = when (outcome) {
        MessageOutcome.Processed -> copy(processed = processed + 1)
        MessageOutcome.Rejected -> copy(rejected = rejected + 1)
        MessageOutcome.Acknowledged -> copy(acknowledged = acknowledged + 1)
        MessageOutcome.Failed -> copy(failed = failed + 1)
        MessageOutcome.Skipped -> this
    }

    private enum class MessageOutcome { Processed, Rejected, Acknowledged, Failed, Skipped }
}
