package eu.nt.xpenses.services.fx

import eu.nt.xpenses.model.FxRate
import eu.nt.xpenses.repositories.FxRateRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

class FxRateProviderTest {
    @Test
    fun `BNR parser selects latest banking day not after requested date`() {
        val xml = """
            <DataSet>
              <Body>
                <Cube date="2026-01-02">
                  <Rate currency="EUR">5.0000</Rate>
                  <Rate currency="USD">4.0000</Rate>
                </Cube>
                <Cube date="2026-01-05">
                  <Rate currency="EUR">5.1000</Rate>
                  <Rate currency="USD">4.0800</Rate>
                </Cube>
              </Body>
            </DataSet>
        """.trimIndent()

        val result = BnrRateProvider.parse(xml, "USD", LocalDate.parse("2026-01-04"))

        assertNotNull(result)
        assertEquals(LocalDate.parse("2026-01-02"), result!!.sourceDate)
        assertEquals(FxRateSource.BNR, result.source)
        assertEquals(BigDecimal("0.800000000000"), result.rateToEur)
    }

    @Test
    fun `BNR parser handles RON as inverse of EUR reference rate`() {
        val xml = """
            <DataSet><Body><Cube date="2026-01-02">
              <Rate currency="EUR">5.0000</Rate>
            </Cube></Body></DataSet>
        """.trimIndent()

        val result = BnrRateProvider.parse(xml, "RON", LocalDate.parse("2026-01-02"))

        assertEquals(BigDecimal("0.200000000000"), result!!.rateToEur)
    }

    @Test
    fun `BNR parser handles a year boundary by retaining the prior banking day`() {
        val xml = """
            <DataSet><Body>
              <Cube date="2025-12-31"><Rate currency="EUR">5.0000</Rate><Rate currency="USD">4.0000</Rate></Cube>
              <Cube date="2026-01-02"><Rate currency="EUR">5.1000</Rate><Rate currency="USD">4.0800</Rate></Cube>
            </Body></DataSet>
        """.trimIndent()

        val result = BnrRateProvider.parse(xml, "USD", LocalDate.parse("2026-01-01"))

        assertNotNull(result)
        assertEquals(LocalDate.parse("2025-12-31"), result!!.sourceDate)
        assertEquals(BigDecimal("0.800000000000"), result.rateToEur)
    }

    @Test
    fun `CurrencyApi parser extracts rate and date for global currencies like UAH`() {
        val json = """
            {
              "date": "2026-08-11",
              "uah": {
                "usd": 0.022370783,
                "eur": 0.019334453
              }
            }
        """.trimIndent()

        val result = CurrencyApiRateProvider.parse(json, "UAH", LocalDate.parse("2026-08-11"))

        assertNotNull(result)
        assertEquals(LocalDate.parse("2026-08-11"), result!!.sourceDate)
        assertEquals(FxRateSource.CURRENCY_API, result.source)
        assertEquals(BigDecimal("0.019334453"), result.rateToEur)
    }

    @Test
    fun `BNR feed uses official curs bnr ro endpoint`() {
        assertEquals("https://curs.bnr.ro/files/xml/years", BnrRateProvider.BASE_URL)
    }

    @Test
    fun `health service reports UNKNOWN before any check and exposes last DB rate`() {
        val provider = mock(HttpFxRateProvider::class.java)
        val repo = mock(FxRateRepository::class.java)
        `when`(provider.getProviderPriority()).thenReturn(
            listOf(FxRateSource.BNR, FxRateSource.ECB_FRANKFURTER, FxRateSource.CURRENCY_API),
        )
        `when`(provider.getProviderStates()).thenReturn(emptyMap())
        `when`(repo.findTopByOrderByFetchedAtDesc()).thenReturn(
            FxRate(
                fromCurrency = "RON",
                toCurrency = "EUR",
                rateDate = "2026-11-18",
                sourceDate = LocalDate.parse("2026-11-18"),
                source = FxRateSource.ECB_FRANKFURTER,
                rate = BigDecimal("0.187030"),
                fetchedAt = Instant.parse("2026-11-19T19:24:54Z"),
            ),
        )

        val status = FxProviderHealthService(provider, repo, scheduledEnabled = false).getHealthStatus()

        assertEquals("UNKNOWN", status.status)
        assertEquals("BNR", status.primaryProvider)
        assertNull(status.activeSource)
        assertFalse(status.fallbackActive)
        assertNotNull(status.lastDbRate)
        assertEquals("ECB_FRANKFURTER", status.lastDbRate?.source)
        assertEquals(3, status.providers.size)
        assertTrue(status.providers[0].isPrimary)
    }

    @Test
    fun `health service reports HEALTHY when primary BNR succeeds`() {
        val provider = mock(HttpFxRateProvider::class.java)
        val repo = mock(FxRateRepository::class.java)
        val now = Instant.parse("2026-11-20T18:00:00Z")
        `when`(provider.getProviderPriority()).thenReturn(
            listOf(FxRateSource.BNR, FxRateSource.ECB_FRANKFURTER, FxRateSource.CURRENCY_API),
        )
        `when`(provider.getProviderStates()).thenReturn(
            mapOf(
                FxRateSource.BNR to ProviderHealthState(
                    provider = FxRateSource.BNR,
                    healthy = true,
                    checkedAt = now,
                    sourceDate = LocalDate.parse("2026-11-20"),
                    ronPerEur = BigDecimal("5.3482"),
                    latencyMs = 45,
                ),
                FxRateSource.ECB_FRANKFURTER to ProviderHealthState(
                    provider = FxRateSource.ECB_FRANKFURTER,
                    healthy = true,
                    checkedAt = now,
                    sourceDate = LocalDate.parse("2026-11-20"),
                    ronPerEur = BigDecimal("5.3476"),
                    latencyMs = 80,
                ),
            ),
        )

        val status = FxProviderHealthService(provider, repo, scheduledEnabled = false).getHealthStatus()

        assertEquals("HEALTHY", status.status)
        assertEquals("BNR", status.activeSource)
        assertFalse(status.fallbackActive)
        assertNull(status.primaryError)
        assertEquals(BigDecimal("5.3482"), status.providers[0].ronPerEur)
        assertTrue(status.providers[0].active)
        assertFalse(status.providers[1].active)
    }

    @Test
    fun `health service reports FALLBACK when BNR fails and ECB succeeds`() {
        val provider = mock(HttpFxRateProvider::class.java)
        val repo = mock(FxRateRepository::class.java)
        val now = Instant.parse("2026-11-20T18:00:00Z")
        `when`(provider.getProviderPriority()).thenReturn(
            listOf(FxRateSource.BNR, FxRateSource.ECB_FRANKFURTER, FxRateSource.CURRENCY_API),
        )
        `when`(provider.getProviderStates()).thenReturn(
            mapOf(
                FxRateSource.BNR to ProviderHealthState(
                    provider = FxRateSource.BNR,
                    healthy = false,
                    checkedAt = now,
                    latencyMs = 20,
                    error = "HTTP 302 -> https://www.bnr.ro/",
                ),
                FxRateSource.ECB_FRANKFURTER to ProviderHealthState(
                    provider = FxRateSource.ECB_FRANKFURTER,
                    healthy = true,
                    checkedAt = now,
                    sourceDate = LocalDate.parse("2026-11-20"),
                    ronPerEur = BigDecimal("5.3476"),
                    latencyMs = 75,
                ),
            ),
        )

        val status = FxProviderHealthService(provider, repo, scheduledEnabled = false).getHealthStatus()

        assertEquals("FALLBACK", status.status)
        assertEquals("BNR", status.primaryProvider)
        assertEquals("ECB_FRANKFURTER", status.activeSource)
        assertTrue(status.fallbackActive)
        assertEquals("HTTP 302 -> https://www.bnr.ro/", status.primaryError)
        assertFalse(status.providers[0].active)
        assertTrue(status.providers[1].active)
    }

    @Test
    fun `health service reports DOWN when all providers fail`() {
        val provider = mock(HttpFxRateProvider::class.java)
        val repo = mock(FxRateRepository::class.java)
        val now = Instant.parse("2026-11-20T18:00:00Z")
        `when`(provider.getProviderPriority()).thenReturn(
            listOf(FxRateSource.BNR, FxRateSource.ECB_FRANKFURTER, FxRateSource.CURRENCY_API),
        )
        `when`(provider.getProviderStates()).thenReturn(
            mapOf(
                FxRateSource.BNR to ProviderHealthState(FxRateSource.BNR, false, now, error = "Timeout"),
                FxRateSource.ECB_FRANKFURTER to ProviderHealthState(FxRateSource.ECB_FRANKFURTER, false, now, error = "HTTP 503"),
                FxRateSource.CURRENCY_API to ProviderHealthState(FxRateSource.CURRENCY_API, false, now, error = "DNS failure"),
            ),
        )

        val status = FxProviderHealthService(provider, repo, scheduledEnabled = false).getHealthStatus()

        assertEquals("DOWN", status.status)
        assertNull(status.activeSource)
        assertFalse(status.fallbackActive)
        assertEquals("Timeout", status.primaryError)
        assertTrue(status.providers.none { it.active })
    }

    @Test
    fun `promoting working provider to primary switches status from FALLBACK to HEALTHY`() {
        val provider = mock(HttpFxRateProvider::class.java)
        val repo = mock(FxRateRepository::class.java)
        val now = Instant.parse("2026-11-20T18:00:00Z")
        `when`(provider.getProviderPriority()).thenReturn(
            listOf(FxRateSource.ECB_FRANKFURTER, FxRateSource.BNR, FxRateSource.CURRENCY_API),
        )
        `when`(provider.getProviderStates()).thenReturn(
            mapOf(
                FxRateSource.BNR to ProviderHealthState(FxRateSource.BNR, false, now, error = "HTTP 302"),
                FxRateSource.ECB_FRANKFURTER to ProviderHealthState(
                    provider = FxRateSource.ECB_FRANKFURTER,
                    healthy = true,
                    checkedAt = now,
                    sourceDate = LocalDate.parse("2026-11-20"),
                    ronPerEur = BigDecimal("5.3476"),
                    latencyMs = 50,
                ),
            ),
        )

        val status = FxProviderHealthService(provider, repo, scheduledEnabled = false).getHealthStatus()

        assertEquals("HEALTHY", status.status)
        assertEquals("ECB_FRANKFURTER", status.primaryProvider)
        assertEquals("ECB_FRANKFURTER", status.activeSource)
        assertFalse(status.fallbackActive)
        assertNull(status.primaryError)
    }
}
