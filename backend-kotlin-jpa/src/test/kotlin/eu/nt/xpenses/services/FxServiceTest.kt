package eu.nt.xpenses.services

import eu.nt.xpenses.models.FxRate
import eu.nt.xpenses.repositories.FxRateRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*

class FxServiceTest {

    private lateinit var fxRateRepository: FxRateRepository
    private lateinit var fxService: FxService

    @BeforeEach
    fun setUp() {
        fxRateRepository = mock(FxRateRepository::class.java)
        fxService = FxService(fxRateRepository)
    }

    @Test
    fun `getRate for EUR returns 1_0 without any repository or HTTP call`() {
        val rate = fxService.getRate("EUR", "2026-06-01")

        assertEquals(1.0, rate)
        verifyNoInteractions(fxRateRepository)
    }

    @Test
    fun `getRate for EUR lowercase returns 1_0`() {
        val rate = fxService.getRate("eur", "2026-06-01")
        assertEquals(1.0, rate)
    }

    @Test
    fun `getRate returns cached value without HTTP call when cache hit`() {
        val cached = FxRate(
            id = 1,
            fromCurrency = "USD",
            toCurrency = "EUR",
            rateDate = "2026-06-01",
            rate = 0.92
        )
        `when`(fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate("USD", "EUR", "2026-06-01"))
            .thenReturn(cached)

        val rate = fxService.getRate("USD", "2026-06-01")

        assertEquals(0.92, rate)
        // save() must NOT be called — value came from cache, no API fetch needed
        verify(fxRateRepository, never()).save(any(FxRate::class.java))
    }

    @Test
    fun `getRate throws IllegalArgumentException when both APIs return null`() {
        `when`(fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate(anyString(), anyString(), anyString()))
            .thenReturn(null)
        `when`(fxRateRepository.save(any())).thenAnswer { it.arguments[0] }

        // INVALID_CURRENCY_XYZ 404s on both Frankfurter and fawazahmed0 APIs.
        // The HTTP calls go out to real endpoints (requires network); both return null,
        // triggering the IllegalArgumentException guard.
        assertThrows(IllegalArgumentException::class.java) {
            fxService.getRate("INVALID_CURRENCY_XYZ", "2026-06-01")
        }
    }
}
