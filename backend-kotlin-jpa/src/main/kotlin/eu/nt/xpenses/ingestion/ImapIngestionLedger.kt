package eu.nt.xpenses.ingestion

import org.springframework.dao.EmptyResultDataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class ImapIngestionLedger(
    private val jdbcTemplate: JdbcTemplate
) {
    fun claim(messageKey: String, maxAttempts: Int = DEFAULT_MAX_ATTEMPTS): Boolean {
        return try {
            jdbcTemplate.queryForObject(
                """
                INSERT INTO imap_ingestion_messages
                    (message_key, status, attempts, claimed_at, created_at)
                VALUES (?, 'CLAIMED', 1, NOW(), NOW())
                ON CONFLICT (message_key) DO UPDATE
                    SET status = 'CLAIMED',
                        attempts = imap_ingestion_messages.attempts + 1,
                        claimed_at = NOW(),
                        last_error = NULL
                    WHERE (imap_ingestion_messages.status = 'FAILED'
                           OR (imap_ingestion_messages.status = 'CLAIMED' AND imap_ingestion_messages.claimed_at < NOW() - INTERVAL '15 minutes'))
                      AND imap_ingestion_messages.attempts < ?
                RETURNING message_key
                """.trimIndent(),
                String::class.java,
                messageKey,
                maxAttempts
            ) != null
        } catch (_: EmptyResultDataAccessException) {
            false
        }
    }

    fun markProcessed(messageKey: String) {
        jdbcTemplate.update(
            """
            UPDATE imap_ingestion_messages
               SET status = 'PROCESSED', processed_at = NOW(), last_error = NULL
             WHERE message_key = ?
            """.trimIndent(),
            messageKey
        )
    }

    fun markFailed(messageKey: String, error: Throwable) {
        jdbcTemplate.update(
            """
            UPDATE imap_ingestion_messages
               SET status = 'FAILED', last_error = ?
             WHERE message_key = ?
            """.trimIndent(),
            error.message?.take(500).orEmpty(),
            messageKey
        )
    }

    private companion object {
        const val DEFAULT_MAX_ATTEMPTS = 5
    }
}
