package eu.nt.xpenses.ingestion

import org.springframework.dao.EmptyResultDataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

@Repository
class ImapIngestionLedger(
    private val jdbcTemplate: JdbcTemplate
) {
    @Transactional
    fun claim(messageKey: String, now: Instant = Instant.now()): ClaimDecision {
        var row = findForUpdate(messageKey)
        if (row == null) {
            val token = UUID.randomUUID()
            val inserted = jdbcTemplate.update(
                """
                INSERT INTO imap_ingestion_messages
                    (message_key, status, attempts, claimed_at, claim_token, created_at)
                VALUES (?, 'CLAIMED', 1, ?, ?, NOW())
                ON CONFLICT (message_key) DO NOTHING
                """.trimIndent(),
                messageKey,
                sqlTimestamp(now),
                token
            )
            if (inserted == 1) {
                return ClaimDecision.Process(ProcessingClaim(messageKey, token, 1))
            }
            row = findForUpdate(messageKey) ?: return ClaimDecision.Skip
        }

        return when (row.status) {
            IngestionStatus.PROCESSED, IngestionStatus.REJECTED -> {
                if (row.acknowledgementStatus != AcknowledgementStatus.PENDING ||
                    (row.acknowledgementClaimedAt != null && row.acknowledgementClaimedAt.isAfter(now.minus(CLAIM_LEASE))) ||
                    !isDue(row.acknowledgementNextAttemptAt, now)
                ) {
                    ClaimDecision.Skip
                } else {
                    val token = UUID.randomUUID()
                    jdbcTemplate.update(
                        """
                        UPDATE imap_ingestion_messages
                           SET acknowledgement_attempts = acknowledgement_attempts + 1,
                               acknowledgement_claim_token = ?,
                               acknowledgement_claimed_at = ?
                         WHERE message_key = ?
                        """.trimIndent(),
                        token,
                        sqlTimestamp(now),
                        messageKey
                    )
                    ClaimDecision.Acknowledge(
                        AcknowledgementClaim(messageKey, token, row.acknowledgementAttempts + 1)
                    )
                }
            }

            IngestionStatus.FAILED -> {
                if (row.attempts >= MAX_ATTEMPTS || !isDue(row.nextAttemptAt, now)) {
                    ClaimDecision.Skip
                } else {
                    reclaimProcessing(row, messageKey, now)
                }
            }

            IngestionStatus.CLAIMED -> {
                if (row.attempts >= MAX_ATTEMPTS || (row.claimedAt != null && row.claimedAt.isAfter(now.minus(CLAIM_LEASE)))) {
                    ClaimDecision.Skip
                } else {
                    reclaimProcessing(row, messageKey, now)
                }
            }
        }
    }

    @Transactional
    fun markProcessed(claim: ProcessingClaim, expenseReportId: Int) {
        requireClaimUpdate(
            """
            UPDATE imap_ingestion_messages
               SET status = 'PROCESSED',
                   processed_at = NOW(),
                   expense_report_id = ?,
                   claim_token = NULL,
                   next_attempt_at = NULL,
                   last_error = NULL,
                   rejection_reason = NULL,
                   acknowledgement_status = 'PENDING',
                   acknowledgement_attempts = 0,
                   acknowledgement_claim_token = NULL,
                   acknowledgement_claimed_at = NULL,
                   acknowledgement_next_attempt_at = NOW()
             WHERE message_key = ?
               AND status = 'CLAIMED'
               AND claim_token = ?
            """.trimIndent(),
            expenseReportId,
            claim.messageKey,
            claim.token
        )
    }

    @Transactional
    fun markRejected(claim: ProcessingClaim, reason: String) {
        requireClaimUpdate(
            """
            UPDATE imap_ingestion_messages
               SET status = 'REJECTED',
                   processed_at = NOW(),
                   claim_token = NULL,
                   next_attempt_at = NULL,
                   last_error = NULL,
                   rejection_reason = ?,
                   acknowledgement_status = 'PENDING',
                   acknowledgement_attempts = 0,
                   acknowledgement_claim_token = NULL,
                   acknowledgement_claimed_at = NULL,
                   acknowledgement_next_attempt_at = NOW()
             WHERE message_key = ?
               AND status = 'CLAIMED'
               AND claim_token = ?
            """.trimIndent(),
            reason.take(500),
            claim.messageKey,
            claim.token
        )
    }

    @Transactional
    fun markFailed(claim: ProcessingClaim, error: Throwable, nextAttemptAt: Instant) {
        requireClaimUpdate(
            """
            UPDATE imap_ingestion_messages
               SET status = 'FAILED',
                   claim_token = NULL,
                   claimed_at = NULL,
                   next_attempt_at = ?,
                   last_error = ?
             WHERE message_key = ?
               AND status = 'CLAIMED'
               AND claim_token = ?
            """.trimIndent(),
            sqlTimestamp(nextAttemptAt),
            error.message?.take(500).orEmpty(),
            claim.messageKey,
            claim.token
        )
    }

    @Transactional
    fun markAcknowledged(claim: AcknowledgementClaim) {
        requireClaimUpdate(
            """
            UPDATE imap_ingestion_messages
               SET acknowledgement_status = 'CONFIRMED',
                   acknowledged_at = NOW(),
                   acknowledgement_claim_token = NULL,
                   acknowledgement_claimed_at = NULL,
                   acknowledgement_next_attempt_at = NULL,
                   last_error = NULL
             WHERE message_key = ?
               AND acknowledgement_status = 'PENDING'
               AND acknowledgement_claim_token = ?
            """.trimIndent(),
            claim.messageKey,
            claim.token
        )
    }

    @Transactional
    fun markAcknowledgementFailed(claim: AcknowledgementClaim, error: Throwable, nextAttemptAt: Instant) {
        requireClaimUpdate(
            """
            UPDATE imap_ingestion_messages
               SET acknowledgement_claim_token = NULL,
                   acknowledgement_claimed_at = NULL,
                   acknowledgement_next_attempt_at = ?,
                   last_error = ?
             WHERE message_key = ?
               AND acknowledgement_status = 'PENDING'
               AND acknowledgement_claim_token = ?
            """.trimIndent(),
            sqlTimestamp(nextAttemptAt),
            error.message?.take(500).orEmpty(),
            claim.messageKey,
            claim.token
        )
    }

    @Transactional(readOnly = true)
    fun listRecovery(): List<RecoveryItem> = jdbcTemplate.query(
        """
        SELECT message_key, status, acknowledgement_status, attempts, expense_report_id,
               last_error, rejection_reason, next_attempt_at, claimed_at
          FROM imap_ingestion_messages
         ORDER BY created_at DESC
         LIMIT 100
        """.trimIndent()
    ) { rs, _ ->
        RecoveryItem(
            messageKey = rs.getString("message_key"),
            status = IngestionStatus.valueOf(rs.getString("status")),
            acknowledgementStatus = AcknowledgementStatus.valueOf(rs.getString("acknowledgement_status")),
            attempts = rs.getInt("attempts"),
            expenseReportId = rs.getObject("expense_report_id") as? Int,
            lastError = rs.getString("last_error"),
            rejectionReason = rs.getString("rejection_reason"),
            nextAttemptAt = rs.getTimestamp("next_attempt_at")?.toInstant(),
            claimedAt = rs.getTimestamp("claimed_at")?.toInstant()
        )
    }

    @Transactional
    fun requestRetry(messageKey: String): Boolean {
        val updated = jdbcTemplate.update(
            """
            UPDATE imap_ingestion_messages
               SET status = CASE WHEN status = 'REJECTED' THEN 'FAILED' ELSE status END,
                   rejection_reason = CASE WHEN status = 'REJECTED' THEN NULL ELSE rejection_reason END,
                   next_attempt_at = NOW(),
                   claim_token = NULL,
                   claimed_at = NULL,
                   acknowledgement_claim_token = NULL,
                   acknowledgement_claimed_at = NULL,
                   acknowledgement_next_attempt_at = CASE
                       WHEN status IN ('PROCESSED', 'REJECTED') THEN NULL
                       ELSE acknowledgement_next_attempt_at
                   END,
                   acknowledgement_status = CASE
                       WHEN status = 'REJECTED' THEN 'NONE'
                       ELSE acknowledgement_status
                   END
             WHERE message_key = ?
               AND (
                    status = 'FAILED'
                    OR status = 'REJECTED'
                    OR (status IN ('PROCESSED', 'REJECTED') AND acknowledgement_status = 'PENDING')
               )
            """.trimIndent(),
            messageKey
        )
        return updated > 0
    }

    private fun reclaimProcessing(row: LedgerRow, messageKey: String, now: Instant): ClaimDecision.Process {
        val token = UUID.randomUUID()
        val attempt = row.attempts + 1
        jdbcTemplate.update(
            """
            UPDATE imap_ingestion_messages
               SET status = 'CLAIMED',
                   attempts = ?,
                   claimed_at = ?,
                   claim_token = ?,
                   next_attempt_at = NULL,
                   last_error = NULL
             WHERE message_key = ?
            """.trimIndent(),
            attempt,
            sqlTimestamp(now),
            token,
            messageKey
        )
        return ClaimDecision.Process(ProcessingClaim(messageKey, token, attempt))
    }

    private fun findForUpdate(messageKey: String): LedgerRow? = try {
        jdbcTemplate.queryForObject(
            """
            SELECT status, attempts, claimed_at, next_attempt_at,
                   acknowledgement_status, acknowledgement_attempts,
                   acknowledgement_claimed_at, acknowledgement_next_attempt_at
              FROM imap_ingestion_messages
             WHERE message_key = ?
             FOR UPDATE
            """.trimIndent(),
            { rs, _ ->
                LedgerRow(
                    status = IngestionStatus.valueOf(rs.getString("status")),
                    attempts = rs.getInt("attempts"),
                    claimedAt = rs.getTimestamp("claimed_at")?.toInstant(),
                    nextAttemptAt = rs.getTimestamp("next_attempt_at")?.toInstant(),
                    acknowledgementStatus = AcknowledgementStatus.valueOf(rs.getString("acknowledgement_status")),
                    acknowledgementAttempts = rs.getInt("acknowledgement_attempts"),
                    acknowledgementClaimedAt = rs.getTimestamp("acknowledgement_claimed_at")?.toInstant(),
                    acknowledgementNextAttemptAt = rs.getTimestamp("acknowledgement_next_attempt_at")?.toInstant()
                )
            },
            messageKey
        )
    } catch (_: EmptyResultDataAccessException) {
        null
    }

    private fun sqlTimestamp(value: Instant): Timestamp = Timestamp.from(value)

    private fun requireClaimUpdate(sql: String, vararg args: Any) {
        if (jdbcTemplate.update(sql, *args) == 0) {
            throw IngestionLeaseLostException("Ingestion claim is no longer owned")
        }
    }

    private fun isDue(nextAttemptAt: Instant?, now: Instant): Boolean =
        nextAttemptAt == null || !nextAttemptAt.isAfter(now)

    private data class LedgerRow(
        val status: IngestionStatus,
        val attempts: Int,
        val claimedAt: Instant?,
        val nextAttemptAt: Instant?,
        val acknowledgementStatus: AcknowledgementStatus,
        val acknowledgementAttempts: Int,
        val acknowledgementClaimedAt: Instant?,
        val acknowledgementNextAttemptAt: Instant?
    )

    private companion object {
        val CLAIM_LEASE: Duration = Duration.ofMinutes(15)
        const val MAX_ATTEMPTS = 10
    }
}

class IngestionLeaseLostException(message: String) : IllegalStateException(message)
