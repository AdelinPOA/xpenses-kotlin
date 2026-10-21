package eu.nt.xpenses.services

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.model.FxRate
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.FxRateRepository
import eu.nt.xpenses.services.fx.FxRateProvider
import eu.nt.xpenses.services.fx.FxRateSource
import eu.nt.xpenses.services.fx.ProviderRate
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.*
import org.springframework.dao.DataIntegrityViolationException
import java.math.BigDecimal
import java.time.LocalDate
import java.util.Optional

class FxServiceTest {
    private lateinit var fxRateRepository: FxRateRepository
    private lateinit var appSettingRepository: AppSettingRepository
    private lateinit var fxRateProvider: FxRateProvider
    private lateinit var fxService: FxService

    @BeforeEach
    fun setUp() {
        fxRateRepository = mock(FxRateRepository::class.java)
        appSettingRepository = mock(AppSettingRepository::class.java)
        fxRateProvider = mock(FxRateProvider::class.java)
        `when`(appSettingRepository.findById("fx_margins")).thenReturn(Optional.empty())
        fxService = FxService(fxRateRepository, appSettingRepository, ObjectMapper(), fxRateProvider)
    }

    @Test
    fun `EUR returns identity without repository or provider call`() {
        val rate = fxService.getRate("eur", "2026-06-01")

        assertEquals(0, BigDecimal.ONE.compareTo(rate))
        verifyNoInteractions(fxRateRepository, fxRateProvider)
    }

    @Test
    fun `RON uses provider rate without margin`() {
        `when`(fxRateProvider.resolve("RON", LocalDate.parse("2026-06-01")))
            .thenReturn(ProviderRate(BigDecimal("0.201234"), LocalDate.parse("2026-06-01"), FxRateSource.BNR))
        `when`(fxRateRepository.save(any(FxRate::class.java))).thenAnswer { it.arguments[0] }

        assertEquals(BigDecimal("0.201234"), fxService.getRate("ron", "2026-06-01"))
    }

    @Test
    fun `configured USD margin applies to source leg`() {
        `when`(appSettingRepository.findById("fx_margins"))
            .thenReturn(Optional.of(AppSetting("fx_margins", "{\"USD\":0.03,\"*\":0.02}")))
        `when`(fxRateProvider.resolve("USD", LocalDate.parse("2026-06-01")))
            .thenReturn(ProviderRate(BigDecimal("0.920000"), LocalDate.parse("2026-06-01"), FxRateSource.BNR))
        `when`(fxRateRepository.save(any(FxRate::class.java))).thenAnswer { it.arguments[0] }

        assertEquals(BigDecimal("0.947600"), fxService.getRate("usd", "2026-06-01"))
    }

    @Test
    fun `fallback quote preserves source attribution and reuses requested-date cache`() {
        val requestedDate = LocalDate.parse("2026-01-04")
        val sourceDate = LocalDate.parse("2026-01-02")
        `when`(fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate("SEK", "EUR", requestedDate.toString()))
            .thenReturn(null)
        `when`(fxRateProvider.resolve("SEK", requestedDate))
            .thenReturn(ProviderRate(BigDecimal("0.087500"), sourceDate, FxRateSource.ECB_FRANKFURTER))
        `when`(fxRateRepository.save(any(FxRate::class.java))).thenAnswer { it.arguments[0] }

        val firstRate = fxService.getRate("sek", requestedDate.toString())
        val saved = ArgumentCaptor.forClass(FxRate::class.java)
        verify(fxRateRepository).save(saved.capture())
        assertEquals(BigDecimal("0.089250"), firstRate)
        assertEquals(requestedDate.toString(), saved.value.rateDate)
        assertEquals(sourceDate, saved.value.sourceDate)
        assertEquals(FxRateSource.ECB_FRANKFURTER, saved.value.source)

        `when`(fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate("SEK", "EUR", requestedDate.toString()))
            .thenReturn(saved.value)
        assertEquals(firstRate, fxService.getRate("SEK", requestedDate.toString()))
        verify(fxRateProvider, times(1)).resolve("SEK", requestedDate)
        verify(fxRateRepository, times(1)).save(any(FxRate::class.java))
    }

    @Test
    fun `provider failure for historical date is surfaced without latest fallback`() {
        val date = LocalDate.parse("2026-06-01")
        `when`(fxRateProvider.resolve("XYZ", date)).thenReturn(null)

        assertThrows(IllegalArgumentException::class.java) { fxService.getRate("XYZ", date.toString()) }
        verify(fxRateProvider).resolve("XYZ", date)
    }

    @Test
    fun `duplicate cache insert returns committed winner`() {
        val date = LocalDate.parse("2026-06-01")
        val winner = FxRate(
            fromCurrency = "USD", toCurrency = "EUR", rateDate = date.toString(),
            sourceDate = date, source = FxRateSource.BNR, rate = BigDecimal("0.945000")
        )
        `when`(fxRateProvider.resolve("USD", date))
            .thenReturn(ProviderRate(BigDecimal("0.920000"), date, FxRateSource.BNR))
        `when`(fxRateRepository.save(any(FxRate::class.java)))
            .thenThrow(DataIntegrityViolationException("duplicate", null))
        `when`(fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate("USD", "EUR", date.toString()))
            .thenReturn(null)
            .thenReturn(winner)

        assertEquals(winner.rate, fxService.getRate("USD", date.toString()))
    }

    @Test
    fun `convert multiplies source amount by source-to-EUR rate`() {
        val date = LocalDate.parse("2026-06-01")
        `when`(fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate("USD", "EUR", date.toString()))
            .thenReturn(FxRate(
                fromCurrency = "USD", toCurrency = "EUR", rateDate = date.toString(),
                sourceDate = date, source = FxRateSource.BNR, rate = BigDecimal("0.943000")
            ))

        assertEquals(BigDecimal("94.30"), fxService.convert(BigDecimal("100"), "USD", date.toString()))
    }
}
