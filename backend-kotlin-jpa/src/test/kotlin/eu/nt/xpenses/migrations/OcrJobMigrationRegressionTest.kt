package eu.nt.xpenses.migrations

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.DriverManager

class OcrJobMigrationRegressionTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
            .also { it.start() }
    }

    @Test
    fun `legacy OCR jobs are quarantined without losing their result`() {
        flyway("102").clean()
        flyway("102").migrate()

        connection().use { connection ->
            connection.prepareStatement(
                "INSERT INTO users (id, username, display_name, role) VALUES (1, 'legacy-ocr-user', 'Legacy OCR User', 'technician')"
            ).executeUpdate()
            connection.prepareStatement(
                "INSERT INTO ocr_jobs (id, user_id, status, filename, result_json) VALUES (?, 1, ?, ?, ?)"
            ).use { statement ->
                statement.setInt(1, 901)
                statement.setString(2, "completed")
                statement.setString(3, "legacy.jpg")
                statement.setString(4, "{\"amount\":12.50}")
                statement.executeUpdate()
            }
            connection.commit()
        }

        flyway("103").migrate()

        connection().use { connection ->
            connection.prepareStatement(
                "SELECT status, stage, legacy_status, unrecoverable_reason, result_json, attempt_count FROM ocr_jobs WHERE id = 901"
            ).use { statement ->
                statement.executeQuery().use { result ->
                    check(result.next())
                    assertEquals("UNRECOVERABLE", result.getString("status"))
                    assertEquals("OCR", result.getString("stage"))
                    assertEquals("completed", result.getString("legacy_status"))
                    assertEquals("legacy_source_missing", result.getString("unrecoverable_reason"))
                    assertEquals("{\"amount\":12.50}", result.getString("result_json"))
                    assertEquals(0, result.getInt("attempt_count"))
                }
            }

            connection.prepareStatement(
                "INSERT INTO ocr_jobs (user_id, filename) VALUES (1, 'new.jpg')"
            ).executeUpdate()
            connection.prepareStatement(
                "SELECT status, stage, attempt_count FROM ocr_jobs WHERE filename = 'new.jpg'"
            ).use { statement ->
                statement.executeQuery().use { result ->
                    check(result.next())
                    assertEquals("PENDING", result.getString("status"))
                    assertEquals("OCR", result.getString("stage"))
                    assertEquals(0, result.getInt("attempt_count"))
                }
            }
        }
    }

    private fun flyway(target: String): Flyway = Flyway.configure()
        .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        .locations("classpath:db/migration")
        .target(target)
        .cleanDisabled(false)
        .load()

    private fun connection(): Connection = DriverManager.getConnection(
        postgres.jdbcUrl,
        postgres.username,
        postgres.password
    ).also { it.autoCommit = false }
}
