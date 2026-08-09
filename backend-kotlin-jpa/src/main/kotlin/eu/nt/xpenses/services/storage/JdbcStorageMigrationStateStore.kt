package eu.nt.xpenses.services.storage

import org.springframework.dao.EmptyResultDataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcStorageMigrationStateStore(
    private val jdbcTemplate: JdbcTemplate
) : StorageMigrationStateStore {
    override fun claim(jobId: String, path: String, maxAttempts: Int): Boolean {
        return try {
            jdbcTemplate.queryForObject(
                """
                INSERT INTO storage_migration_files
                    (job_id, file_path, status, attempts, updated_at)
                VALUES (?, ?, 'CLAIMED', 1, NOW())
                ON CONFLICT (job_id, file_path) DO UPDATE
                    SET status = 'CLAIMED',
                        attempts = storage_migration_files.attempts + 1,
                        updated_at = NOW(),
                        last_error = NULL
                    WHERE storage_migration_files.status = 'FAILED'
                      AND storage_migration_files.attempts < ?
                RETURNING file_path
                """.trimIndent(),
                String::class.java,
                jobId,
                path,
                maxAttempts
            ) != null
        } catch (_: EmptyResultDataAccessException) {
            false
        }
    }

    override fun markCompleted(jobId: String, path: String) {
        jdbcTemplate.update(
            """
            UPDATE storage_migration_files
               SET status = 'COMPLETED', updated_at = NOW(), last_error = NULL
             WHERE job_id = ? AND file_path = ?
            """.trimIndent(),
            jobId,
            path
        )
    }

    override fun markFailed(jobId: String, path: String, error: Throwable) {
        jdbcTemplate.update(
            """
            UPDATE storage_migration_files
               SET status = 'FAILED', updated_at = NOW(), last_error = ?
             WHERE job_id = ? AND file_path = ?
            """.trimIndent(),
            error.message?.take(500).orEmpty(),
            jobId,
            path
        )
    }
}
