package eu.nt.xpenses.services

import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest

/** Database identity for saves; deliberately independent of resource lifetime. */
@Service
class SaveIdempotencyService(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    transactionManager: PlatformTransactionManager,
) {
    // Every stage commits independently. Receipt N failing cannot roll back a
    // successful Receipt N-1, or leave its identity uncommitted.
    private val transaction =
        TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }

    fun validateKey(key: String?): String? {
        if (key == null) return null
        if (!key.matches(Regex("^[A-Za-z0-9._:-]{1,256}$"))) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Idempotency-Key (1-256 ASCII letters, digits, . _ : -)")
        }
        return key
    }

    fun hash(value: Any): String = digest(mapper.writeValueAsBytes(value))

    fun digest(bytes: ByteArray): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }

    /** Cheap replay lookup before expensive non-transactional OCR. */
    fun <T : Any> lookup(
        userId: Int,
        operation: String,
        key: String,
        hash: String,
        type: TypeReference<T>,
    ): T? {
        val rows =
            jdbc.query(
                "SELECT request_hash, response_json FROM expense_save_requests WHERE user_id = ? AND operation = ? AND request_key = ?",
                { rs, _ -> rs.getString(1) to rs.getString(2) },
                userId,
                operation,
                key,
            )
        val row = rows.firstOrNull() ?: return null
        checkHash(row.first, hash)
        return row.second?.let { mapper.readValue(it, type) }
    }

    fun <T : Any> execute(
        userId: Int,
        operation: String,
        key: String,
        hash: String,
        type: TypeReference<T>,
        action: () -> T,
    ): T =
        requireNotNull(
            transaction.execute {
                // ON CONFLICT waits for a competing transaction, and SELECT FOR
                // UPDATE serializes replay against the winner across processes.
                jdbc.update(
                    "INSERT INTO expense_save_requests (user_id, operation, request_key, request_hash) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
                    userId,
                    operation,
                    key,
                    hash,
                )
                val row =
                    jdbc.queryForObject(
                        "SELECT request_hash, response_json FROM expense_save_requests WHERE user_id = ? AND operation = ? AND request_key = ? FOR UPDATE",
                        { rs, _ -> rs.getString(1) to rs.getString(2) },
                        userId,
                        operation,
                        key,
                    )
                checkHash(row.first, hash)
                val existingResponse = row.second
                if (existingResponse != null) {
                    mapper.readValue(existingResponse, type)
                } else {
                    val result = action()
                    jdbc.update(
                        "UPDATE expense_save_requests SET response_json = ? WHERE user_id = ? AND operation = ? AND request_key = ?",
                        mapper.writeValueAsString(result),
                        userId,
                        operation,
                        key,
                    )
                    result
                }
            },
        )

    private fun checkHash(
        actual: String,
        expected: String,
    ) {
        if (actual != expected) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency-Key was already used with different save data")
        }
    }
}
