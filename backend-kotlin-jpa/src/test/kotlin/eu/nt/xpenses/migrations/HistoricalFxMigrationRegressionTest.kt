package eu.nt.xpenses.migrations

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import java.math.BigDecimal
import java.sql.Connection
import java.sql.DriverManager

class HistoricalFxMigrationRegressionTest {

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
            .also { it.start() }
    }

    private data class FixtureIds(
        val reportId: Int = 100,
        val expenseId: Int = 200,
        val advanceId: Int = 300,
        val mileageId: Int = 400,
        val fxRateId: Int = 500
    )

    private data class FinancialSnapshot(
        val reportTotal: BigDecimal,
        val expenseAmountOriginal: BigDecimal,
        val expenseCurrency: String,
        val expenseRate: BigDecimal,
        val expenseManual: Boolean,
        val expenseAmountEur: BigDecimal,
        val expenseStatus: String,
        val advanceAmountOriginal: BigDecimal,
        val advanceCurrency: String,
        val advanceRate: BigDecimal,
        val advanceAmountEur: BigDecimal,
        val advanceStatus: String,
        val mileageRateBeforeTax: BigDecimal,
        val mileageRateAfterTax: BigDecimal,
        val mileageAmountBeforeTax: BigDecimal,
        val mileageAmountEur: BigDecimal,
        val expenseAggregate: BigDecimal,
        val advanceAggregate: BigDecimal,
        val mileageAggregate: BigDecimal,
        val combinedAggregate: BigDecimal
    )

    @Test
    fun migrateV29FixturesThroughV31PurgesOnlyFxCache() {
        val ids = FixtureIds()
        val before = prepareV29Fixtures(ids)

        migrateThroughV31()

        newConnection().use { connection ->
            assertEquals(0, scalarInt(connection, "SELECT COUNT(*) FROM fx_rates"))
            assertEquals("31", currentFlywayVersion(connection))
            assertEquals("paid", scalarString(connection, "SELECT status FROM expenses WHERE id = ${ids.expenseId}"))
            assertEquals("paid", scalarString(connection, "SELECT status FROM advance_payments WHERE id = ${ids.advanceId}"))
            assertEquals(before.mileageAmountEur, scalarDecimal(connection, "SELECT amount_eur FROM mileage_records WHERE id = ${ids.mileageId}"))
            assertEquals(before.mileageAmountEur, scalarDecimal(connection, "SELECT amount_original FROM mileage_records WHERE id = ${ids.mileageId}"))
            assertEquals("EUR", scalarString(connection, "SELECT currency_original FROM mileage_records WHERE id = ${ids.mileageId}"))
            assertEquals(BigDecimal.ONE, scalarDecimal(connection, "SELECT fx_rate FROM mileage_records WHERE id = ${ids.mileageId}"))
        }
    }

    @Test
    fun reloadedFinancialRowsAndReportTotalsRemainExact() {
        val ids = FixtureIds()
        val before = prepareV29Fixtures(ids)

        migrateThroughV31()

        // This is deliberately a new JDBC connection after both migrations commit.
        newConnection().use { connection ->
            assertEquals(before.reportTotal, scalarDecimal(connection, "SELECT total_amount FROM expense_reports WHERE id = ${ids.reportId}"))

            assertEquals(before.expenseAmountOriginal, scalarDecimal(connection, "SELECT amount_original FROM expenses WHERE id = ${ids.expenseId}"))
            assertEquals(before.expenseCurrency, scalarString(connection, "SELECT currency_original FROM expenses WHERE id = ${ids.expenseId}"))
            assertEquals(before.expenseRate, scalarDecimal(connection, "SELECT fx_rate FROM expenses WHERE id = ${ids.expenseId}"))
            assertTrue(scalarBoolean(connection, "SELECT fx_rate_manual FROM expenses WHERE id = ${ids.expenseId}"))
            assertEquals(before.expenseManual, scalarBoolean(connection, "SELECT fx_rate_manual FROM expenses WHERE id = ${ids.expenseId}"))
            assertEquals(before.expenseAmountEur, scalarDecimal(connection, "SELECT amount_eur FROM expenses WHERE id = ${ids.expenseId}"))
            assertEquals(before.expenseStatus, scalarString(connection, "SELECT status FROM expenses WHERE id = ${ids.expenseId}"))

            assertEquals(before.advanceAmountOriginal, scalarDecimal(connection, "SELECT amount_original FROM advance_payments WHERE id = ${ids.advanceId}"))
            assertEquals(before.advanceCurrency, scalarString(connection, "SELECT currency_original FROM advance_payments WHERE id = ${ids.advanceId}"))
            assertEquals(before.advanceRate, scalarDecimal(connection, "SELECT fx_rate FROM advance_payments WHERE id = ${ids.advanceId}"))
            assertEquals(before.advanceAmountEur, scalarDecimal(connection, "SELECT amount_eur FROM advance_payments WHERE id = ${ids.advanceId}"))
            assertEquals(before.advanceStatus, scalarString(connection, "SELECT status FROM advance_payments WHERE id = ${ids.advanceId}"))

            assertEquals(before.mileageRateBeforeTax, scalarDecimal(connection, "SELECT rate_before_tax FROM mileage_records WHERE id = ${ids.mileageId}"))
            assertEquals(before.mileageRateAfterTax, scalarDecimal(connection, "SELECT rate_after_tax FROM mileage_records WHERE id = ${ids.mileageId}"))
            assertEquals(before.mileageAmountBeforeTax, scalarDecimal(connection, "SELECT amount_before_tax FROM mileage_records WHERE id = ${ids.mileageId}"))
            assertEquals(before.mileageAmountEur, scalarDecimal(connection, "SELECT amount_eur FROM mileage_records WHERE id = ${ids.mileageId}"))

            assertEquals(before.expenseAggregate, scalarDecimal(connection, "SELECT COALESCE(SUM(amount_eur), 0) FROM expenses WHERE report_id = ${ids.reportId}"))
            assertEquals(before.advanceAggregate, scalarDecimal(connection, "SELECT COALESCE(SUM(amount_eur), 0) FROM advance_payments WHERE report_id = ${ids.reportId} AND status = 'paid'"))
            assertEquals(before.mileageAggregate, scalarDecimal(connection, "SELECT COALESCE(SUM(amount_eur), 0) FROM mileage_records WHERE report_id = ${ids.reportId}"))
            assertEquals(before.combinedAggregate, scalarDecimal(connection, "SELECT (SELECT COALESCE(SUM(amount_eur), 0) FROM expenses WHERE report_id = ${ids.reportId}) + (SELECT COALESCE(SUM(amount_eur), 0) FROM advance_payments WHERE report_id = ${ids.reportId} AND status = 'paid') + (SELECT COALESCE(SUM(amount_eur), 0) FROM mileage_records WHERE report_id = ${ids.reportId})"))
        }
    }

    private fun prepareV29Fixtures(ids: FixtureIds): FinancialSnapshot {
        val flyway = flyway(target = "29")
        flyway.clean()
        flyway.migrate()
        assertEquals("29", flyway.info().current().version.version)

        newConnection().use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("INSERT INTO users (id, username, display_name, role) VALUES (1, 'migration-user', 'Migration User', 'technician')").executeUpdate()
            connection.prepareStatement("INSERT INTO categories (id, name, is_active) VALUES (1, 'Migration Category', true)").executeUpdate()
            connection.prepareStatement("INSERT INTO expense_reports (id, user_id, title, status, total_amount, currency) VALUES (?, 1, 'Historical FX Report', 'paid', ?, 'EUR')").use { statement ->
                statement.setInt(1, ids.reportId)
                statement.setBigDecimal(2, BigDecimal("321.09"))
                statement.executeUpdate()
            }
            connection.prepareStatement("INSERT INTO expenses (id, user_id, category_id, report_id, amount_original, currency_original, amount_eur, fx_rate, tax_amount, tax_amount_eur, date, status, fx_rate_manual) VALUES (?, 1, 1, ?, ?, 'USD', ?, ?, 0, 0, '2026-01-10', 'paid', true)").use { statement ->
                statement.setInt(1, ids.expenseId)
                statement.setInt(2, ids.reportId)
                statement.setBigDecimal(3, BigDecimal("100.00"))
                statement.setBigDecimal(4, BigDecimal("87.65"))
                statement.setBigDecimal(5, BigDecimal("0.8765"))
                statement.executeUpdate()
            }
            connection.prepareStatement("INSERT INTO advance_payments (id, report_id, user_id, amount_original, currency_original, amount_eur, fx_rate, date, status) VALUES (?, ?, 1, ?, 'GBP', ?, ?, '2026-01-11', 'paid')").use { statement ->
                statement.setInt(1, ids.advanceId)
                statement.setInt(2, ids.reportId)
                statement.setBigDecimal(3, BigDecimal("50.00"))
                statement.setBigDecimal(4, BigDecimal("61.73"))
                statement.setBigDecimal(5, BigDecimal("1.2346"))
                statement.executeUpdate()
            }
            connection.prepareStatement("INSERT INTO mileage_records (id, report_id, user_id, origin, destination, distance_km, rate_before_tax, rate_after_tax, amount_before_tax, amount_eur, start_time, end_time) VALUES (?, ?, 1, 'A', 'B', 42.5, ?, ?, ?, ?, '2026-01-12T08:00:00Z', '2026-01-12T09:00:00Z')").use { statement ->
                statement.setInt(1, ids.mileageId)
                statement.setInt(2, ids.reportId)
                statement.setBigDecimal(3, BigDecimal("0.60"))
                statement.setBigDecimal(4, BigDecimal("0.40"))
                statement.setBigDecimal(5, BigDecimal("25.50"))
                statement.setBigDecimal(6, BigDecimal("17.00"))
                statement.executeUpdate()
            }
            connection.prepareStatement("INSERT INTO fx_rates (id, from_currency, to_currency, rate_date, rate) VALUES (?, 'USD', 'EUR', '2026-01-10', ?)").use { statement ->
                statement.setInt(1, ids.fxRateId)
                statement.setBigDecimal(2, BigDecimal("0.8765"))
                statement.executeUpdate()
            }
            connection.commit()

            return FinancialSnapshot(
                reportTotal = scalarDecimal(connection, "SELECT total_amount FROM expense_reports WHERE id = ${ids.reportId}"),
                expenseAmountOriginal = scalarDecimal(connection, "SELECT amount_original FROM expenses WHERE id = ${ids.expenseId}"),
                expenseCurrency = scalarString(connection, "SELECT currency_original FROM expenses WHERE id = ${ids.expenseId}"),
                expenseRate = scalarDecimal(connection, "SELECT fx_rate FROM expenses WHERE id = ${ids.expenseId}"),
                expenseManual = scalarBoolean(connection, "SELECT fx_rate_manual FROM expenses WHERE id = ${ids.expenseId}"),
                expenseAmountEur = scalarDecimal(connection, "SELECT amount_eur FROM expenses WHERE id = ${ids.expenseId}"),
                expenseStatus = scalarString(connection, "SELECT status FROM expenses WHERE id = ${ids.expenseId}"),
                advanceAmountOriginal = scalarDecimal(connection, "SELECT amount_original FROM advance_payments WHERE id = ${ids.advanceId}"),
                advanceCurrency = scalarString(connection, "SELECT currency_original FROM advance_payments WHERE id = ${ids.advanceId}"),
                advanceRate = scalarDecimal(connection, "SELECT fx_rate FROM advance_payments WHERE id = ${ids.advanceId}"),
                advanceAmountEur = scalarDecimal(connection, "SELECT amount_eur FROM advance_payments WHERE id = ${ids.advanceId}"),
                advanceStatus = scalarString(connection, "SELECT status FROM advance_payments WHERE id = ${ids.advanceId}"),
                mileageRateBeforeTax = scalarDecimal(connection, "SELECT rate_before_tax FROM mileage_records WHERE id = ${ids.mileageId}"),
                mileageRateAfterTax = scalarDecimal(connection, "SELECT rate_after_tax FROM mileage_records WHERE id = ${ids.mileageId}"),
                mileageAmountBeforeTax = scalarDecimal(connection, "SELECT amount_before_tax FROM mileage_records WHERE id = ${ids.mileageId}"),
                mileageAmountEur = scalarDecimal(connection, "SELECT amount_eur FROM mileage_records WHERE id = ${ids.mileageId}"),
                expenseAggregate = scalarDecimal(connection, "SELECT COALESCE(SUM(amount_eur), 0) FROM expenses WHERE report_id = ${ids.reportId}"),
                advanceAggregate = scalarDecimal(connection, "SELECT COALESCE(SUM(amount_eur), 0) FROM advance_payments WHERE report_id = ${ids.reportId} AND status = 'paid'"),
                mileageAggregate = scalarDecimal(connection, "SELECT COALESCE(SUM(amount_eur), 0) FROM mileage_records WHERE report_id = ${ids.reportId}"),
                combinedAggregate = scalarDecimal(connection, "SELECT (SELECT COALESCE(SUM(amount_eur), 0) FROM expenses WHERE report_id = ${ids.reportId}) + (SELECT COALESCE(SUM(amount_eur), 0) FROM advance_payments WHERE report_id = ${ids.reportId} AND status = 'paid') + (SELECT COALESCE(SUM(amount_eur), 0) FROM mileage_records WHERE report_id = ${ids.reportId})")
            )
        }
    }

    private fun migrateThroughV31() {
        flyway(target = "31").migrate()
    }

    private fun flyway(target: String? = null): Flyway {
        val configuration = Flyway.configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration")
            .cleanDisabled(false)
        if (target != null) configuration.target(target)
        return configuration.load()
    }

    private fun newConnection(): Connection = DriverManager.getConnection(
        postgres.jdbcUrl,
        postgres.username,
        postgres.password
    )

    private fun scalarDecimal(connection: Connection, sql: String): BigDecimal =
        connection.createStatement().executeQuery(sql).use { result ->
            assertTrue(result.next())
            result.getBigDecimal(1)
        }

    private fun scalarString(connection: Connection, sql: String): String =
        connection.createStatement().executeQuery(sql).use { result ->
            assertTrue(result.next())
            result.getString(1)
        }

    private fun scalarBoolean(connection: Connection, sql: String): Boolean =
        connection.createStatement().executeQuery(sql).use { result ->
            assertTrue(result.next())
            result.getBoolean(1)
        }

    private fun scalarInt(connection: Connection, sql: String): Int =
        connection.createStatement().executeQuery(sql).use { result ->
            assertTrue(result.next())
            result.getInt(1)
        }

    private fun currentFlywayVersion(connection: Connection): String =
        scalarString(connection, "SELECT version FROM flyway_schema_history WHERE success = true ORDER BY installed_rank DESC LIMIT 1")
}
