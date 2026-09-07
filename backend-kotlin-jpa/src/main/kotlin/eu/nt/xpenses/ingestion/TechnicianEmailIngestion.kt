package eu.nt.xpenses.ingestion

import java.time.Instant
import java.util.UUID

interface TechnicianEmailIngestion {
    fun poll(): PollSummary
    fun listRecovery(): List<RecoveryItem>
    fun retry(messageKey: String): RecoveryResult
}

interface MailboxAdapter {
    fun readUnseen(): List<InboundEmail>
    fun find(messageKey: String): InboundEmail?
    fun markSeen(messageKey: String)
}

interface DelegationEmailParser {
    fun parse(email: InboundEmail): ParseResult
}

data class InboundEmail(
    val messageKey: String,
    val fromAddress: String?,
    val bodyText: String,
    val authenticationResults: String? = null,
    val receivedSpf: String? = null
)

sealed interface ParseResult {
    data class Accepted(val delegation: DelegationDraft) : ParseResult
    data class Rejected(val reason: String) : ParseResult
    data class RetryableFailure(val reason: String) : ParseResult
}

data class DelegationDraft(
    val title: String,
    val description: String? = null,
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val kundenauftrag: String? = null,
    val auftragsart: String? = null,
    val positionstyp: String? = null,
    val technplatzRaw: String? = null,
    val technplatzLine: Boolean = false,
    val kundeCode: String? = null,
    val kundeName: String? = null,
    val adresse: String? = null,
    val vorgang: String? = null,
    val arbeitsplatz: String? = null,
    val techniker: String? = null
) {
    companion object {
        fun fromParsedValues(values: Map<String, String>): DelegationDraft? {
            val title = values["title"]?.trim().orEmpty()
            if (title.isEmpty()) return null
            return DelegationDraft(
                title = title,
                description = values["description"]?.ifEmpty { null },
                dateFrom = values["date_from"]?.ifEmpty { null },
                dateTo = values["date_to"]?.ifEmpty { null },
                kundenauftrag = values["kundenauftrag"]?.ifEmpty { null },
                auftragsart = values["auftragsart"]?.ifEmpty { null },
                positionstyp = values["positionstyp"]?.ifEmpty { null },
                technplatzRaw = values["technplatz_raw"]?.ifEmpty { null },
                technplatzLine = values["technplatz_line"]?.toBoolean() ?: false,
                kundeCode = values["kunde_code"]?.ifEmpty { null },
                kundeName = values["kunde_name"]?.ifEmpty { null },
                adresse = values["adresse"]?.ifEmpty { null },
                vorgang = values["vorgang"]?.ifEmpty { null },
                arbeitsplatz = values["arbeitsplatz"]?.ifEmpty { null },
                techniker = values["techniker"]?.ifEmpty { null }
            )
        }
    }
}

enum class IngestionStatus { CLAIMED, FAILED, PROCESSED, REJECTED }

enum class AcknowledgementStatus { NONE, PENDING, CONFIRMED }

data class PollSummary(
    val processed: Int = 0,
    val rejected: Int = 0,
    val retried: Int = 0,
    val failed: Int = 0,
    val acknowledged: Int = 0
)

data class RecoveryItem(
    val messageKey: String,
    val status: IngestionStatus,
    val acknowledgementStatus: AcknowledgementStatus,
    val attempts: Int,
    val expenseReportId: Int?,
    val lastError: String?,
    val rejectionReason: String?,
    val nextAttemptAt: Instant?,
    val claimedAt: Instant?
)

data class RecoveryResult(
    val messageKey: String,
    val acknowledged: Boolean,
    val processed: Boolean,
    val rejected: Boolean,
    val reason: String? = null
)

data class ProcessingClaim(
    val messageKey: String,
    val token: UUID,
    val attempt: Int
)

data class AcknowledgementClaim(
    val messageKey: String,
    val token: UUID,
    val attempt: Int
)

sealed interface ClaimDecision {
    data class Process(val claim: ProcessingClaim) : ClaimDecision
    data class Acknowledge(val claim: AcknowledgementClaim) : ClaimDecision
    data object Skip : ClaimDecision
}
