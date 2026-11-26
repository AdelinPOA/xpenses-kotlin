package eu.nt.xpenses.services.fuel

import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.model.FuelPrice
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.FuelPriceRepository
import eu.nt.xpenses.services.FxService
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.*
import tools.jackson.databind.ObjectMapper
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Optional

class FuelPriceServiceTest {
    private val objectMapper = ObjectMapper()
    private lateinit var fuelPriceRepository: FuelPriceRepository
    private lateinit var fuelPriceProvider: FuelPriceProvider
    private lateinit var manualFuelPricePort: ManualFuelPricePort
    private lateinit var fuelPriceService: FuelPriceService

    @BeforeEach
    fun setUp() {
        fuelPriceRepository = mock(FuelPriceRepository::class.java)
        fuelPriceProvider = mock(FuelPriceProvider::class.java)
        manualFuelPricePort = ManualFuelPricePort { fuelType ->
            when (fuelType) {
                "petrol" -> BigDecimal("9.10")
                "lpg" -> BigDecimal("4.85")
                "electric" -> BigDecimal("0.00")
                else -> BigDecimal("9.20")
            }
        }
        fuelPriceService = FuelPriceService(
            fuelPriceRepository = fuelPriceRepository,
            fuelPriceProvider = fuelPriceProvider,
            manualFuelPricePort = manualFuelPricePort,
            transactionManager = null,
            liveEnabled = true,
        )
    }

    @Test
    fun `PretCarburantLiveParser averages non-null chain prices and ignores null or future dates`() {
        val json = """
            {
              "data": "2026-11-20",
              "retele": [
                {"nume": "Petrom", "benzina": 9.06, "motorina": 10.51, "gpl": null},
                {"nume": "Rompetrol", "benzina": 9.11, "motorina": 10.57, "gpl": 4.86},
                {"nume": "MOL", "benzina": 9.12, "motorina": 10.57, "gpl": 4.87},
                {"nume": "Oscar", "benzina": null, "motorina": null, "gpl": null}
              ]
            }
        """.trimIndent()

        val parsed = PretCarburantLiveParser.parse(json, objectMapper, LocalDate.parse("2026-11-20"))
        assertEquals(BigDecimal("10.55"), parsed["diesel"]?.priceRonPerLiter)
        assertEquals(3, parsed["diesel"]?.stationCount)
        assertEquals(BigDecimal("9.10"), parsed["petrol"]?.priceRonPerLiter)
        assertEquals(3, parsed["petrol"]?.stationCount)
        assertEquals(BigDecimal("4.87"), parsed["lpg"]?.priceRonPerLiter)
        assertEquals(2, parsed["lpg"]?.stationCount)
        assertEquals(FuelPriceSource.PRETCARBURANT_LIVE, parsed["diesel"]?.source)

        val future = PretCarburantLiveParser.parse(json, objectMapper, LocalDate.parse("2026-11-19"))
        assertTrue(future.isEmpty())
    }

    @Test
    fun `PretCarburantDataParser selects latest day not after requestedDate within 14d window`() {
        val json = """
            [
              {"date": "2026-11-17", "fuel_type": "motorina_standard", "price_avg": "10.55", "station_count": "1350"},
              {"date": "2026-11-19", "fuel_type": "motorina_standard", "price_avg": "10.61", "station_count": "1362"},
              {"date": "2026-11-19", "fuel_type": "benzina_standard", "price_avg": "9.20", "station_count": "1362"},
              {"date": "2026-11-19", "fuel_type": "gpl", "price_avg": "4.84", "station_count": "329"}
            ]
        """.trimIndent()

        val onNov20 = PretCarburantDataParser.parse(json, objectMapper, LocalDate.parse("2026-11-20"))
        assertEquals(BigDecimal("10.61"), onNov20["diesel"]?.priceRonPerLiter)
        assertEquals(LocalDate.parse("2026-11-19"), onNov20["diesel"]?.sourceDate)
        assertEquals(1362, onNov20["diesel"]?.stationCount)
        assertEquals(BigDecimal("9.20"), onNov20["petrol"]?.priceRonPerLiter)
        assertEquals(BigDecimal("4.84"), onNov20["lpg"]?.priceRonPerLiter)

        val onNov18 = PretCarburantDataParser.parse(json, objectMapper, LocalDate.parse("2026-11-18"))
        assertEquals(BigDecimal("10.55"), onNov18["diesel"]?.priceRonPerLiter)
        assertEquals(LocalDate.parse("2026-11-17"), onNov18["diesel"]?.sourceDate)

        // Dates far before archive coverage return empty without failing
        val tooOld = PretCarburantDataParser.parse(json, objectMapper, LocalDate.parse("2025-12-01"))
        assertTrue(tooOld.isEmpty())
    }

    @Test
    fun `EuWeeklyOilBulletinParser parses Romania EUR per 1000L row and converts to RON per liter`() {
        val wb = XSSFWorkbook()
        val sheet = wb.createSheet("Sheet1")
        sheet.createRow(0).createCell(0).setCellValue("in EUR")
        val row1 = sheet.createRow(1)
        row1.createCell(0).setCellValue(org.apache.poi.ss.usermodel.DateUtil.getExcelDate(java.util.Date.from(LocalDate.parse("2026-11-16").atStartOfDay(ZoneId.of("UTC")).toInstant())))
        val roRow = sheet.createRow(2)
        roRow.createCell(0).setCellValue("Romania")
        roRow.createCell(1).setCellValue(1765.50) // Euro-super 95 EUR/1000L -> 1.7655 EUR/L
        roRow.createCell(2).setCellValue(2003.58) // Diesel EUR/1000L -> 2.00358 EUR/L
        roRow.createCell(6).setCellValue(895.84)  // LPG EUR/1000L -> 0.89584 EUR/L

        val out = ByteArrayOutputStream()
        wb.use { it.write(out) }
        val bytes = out.toByteArray()

        // 1 RON = 0.186940 EUR (approx 5.3493 RON/EUR)
        val parsed = EuWeeklyOilBulletinParser.parse(bytes, LocalDate.parse("2026-11-20")) {
            BigDecimal("0.186940")
        }

        assertEquals(BigDecimal("10.72"), parsed["diesel"]?.priceRonPerLiter)
        assertEquals(BigDecimal("9.44"), parsed["petrol"]?.priceRonPerLiter)
        assertEquals(BigDecimal("4.79"), parsed["lpg"]?.priceRonPerLiter)
        assertEquals(LocalDate.parse("2026-11-16"), parsed["diesel"]?.sourceDate)
        assertEquals(FuelPriceSource.EU_WEEKLY_OIL_BULLETIN, parsed["diesel"]?.source)

        val futureBulletin = EuWeeklyOilBulletinParser.parse(bytes, LocalDate.parse("2026-11-10")) {
            BigDecimal("0.186940")
        }
        assertTrue(futureBulletin.isEmpty())
    }

    @Test
    fun `FuelPriceService returns DB cache hit without calling external provider`() {
        `when`(fuelPriceRepository.findByFuelTypeAndPriceDate("diesel", "2026-11-18")).thenReturn(
            FuelPrice(
                fuelType = "diesel",
                priceDate = "2026-11-18",
                sourceDate = LocalDate.parse("2026-11-18"),
                source = FuelPriceSource.PRETCARBURANT_DATA,
                priceRonPerLiter = BigDecimal("10.58"),
                stationCount = 1350,
            ),
        )

        val resolved = fuelPriceService.resolveFuelPrice("diesel", LocalDate.parse("2026-11-18"))

        assertEquals(BigDecimal("10.58"), resolved.priceRonPerLiter)
        assertEquals(FuelPriceSource.PRETCARBURANT_DATA, resolved.source)
        verifyNoInteractions(fuelPriceProvider)
    }

    @Test
    fun `FuelPriceService maps hybrid to petrol and caches external result`() {
        `when`(fuelPriceRepository.findByFuelTypeAndPriceDate("petrol", "2026-11-19")).thenReturn(null)
        `when`(fuelPriceProvider.resolve("petrol", LocalDate.parse("2026-11-19"))).thenReturn(
            ProviderFuelPrice(
                priceRonPerLiter = BigDecimal("9.20"),
                sourceDate = LocalDate.parse("2026-11-19"),
                source = FuelPriceSource.PRETCARBURANT_DATA,
                stationCount = 1362,
            ),
        )
        `when`(fuelPriceRepository.save(any(FuelPrice::class.java))).thenAnswer { it.arguments[0] }

        val resolved = fuelPriceService.resolveFuelPrice("hybrid", LocalDate.parse("2026-11-19"))

        assertEquals("petrol", resolved.fuelType)
        assertEquals(BigDecimal("9.20"), resolved.priceRonPerLiter)
        assertEquals(FuelPriceSource.PRETCARBURANT_DATA, resolved.source)
        val captor = ArgumentCaptor.forClass(FuelPrice::class.java)
        verify(fuelPriceRepository).save(captor.capture())
        assertEquals("petrol", captor.value.fuelType)
        assertEquals("2026-11-19", captor.value.priceDate)
    }

    @Test
    fun `FuelPriceService uses manual fallback without DB caching for electric unassigned or external failure`() {
        val electric = fuelPriceService.resolveFuelPrice("electric", LocalDate.parse("2026-11-20"))
        assertEquals(BigDecimal("0.00"), electric.priceRonPerLiter)
        assertEquals(FuelPriceSource.MANUAL_SETTING, electric.source)

        val unassigned = fuelPriceService.resolveFuelPrice(null, LocalDate.parse("2026-11-20"))
        assertEquals(BigDecimal("9.20"), unassigned.priceRonPerLiter)
        assertEquals(FuelPriceSource.MANUAL_SETTING, unassigned.source)

        `when`(fuelPriceRepository.findByFuelTypeAndPriceDate("diesel", "2026-11-20")).thenReturn(null)
        `when`(fuelPriceProvider.resolve("diesel", LocalDate.parse("2026-11-20"))).thenReturn(null)
        val failedExternal = fuelPriceService.resolveFuelPrice("diesel", LocalDate.parse("2026-11-20"))
        assertEquals(BigDecimal("9.20"), failedExternal.priceRonPerLiter)
        assertEquals(FuelPriceSource.MANUAL_SETTING, failedExternal.source)

        verify(fuelPriceRepository, never()).save(any())
    }

    @Test
    fun `FuelPriceHealthService reports UNKNOWN HEALTHY and FALLBACK states accurately`() {
        val provider = mock(HttpFuelPriceProvider::class.java)
        val repo = mock(FuelPriceRepository::class.java)
        val healthService = FuelPriceHealthService(provider, repo, scheduledEnabled = false)

        `when`(provider.getProviderStates()).thenReturn(emptyMap())
        val unknown = healthService.getHealthStatus()
        assertEquals("UNKNOWN", unknown.status)
        assertFalse(unknown.fallbackActive)
        assertNull(unknown.activeSource)

        val now = Instant.parse("2026-11-20T21:00:00Z")
        `when`(provider.getProviderStates()).thenReturn(
            mapOf(
                FuelPriceSource.PRETCARBURANT_LIVE to FuelProviderHealthState(
                    provider = FuelPriceSource.PRETCARBURANT_LIVE,
                    healthy = true,
                    checkedAt = now,
                    sourceDate = LocalDate.parse("2026-11-20"),
                    dieselRon = BigDecimal("10.56"),
                    petrolRon = BigDecimal("9.12"),
                    lpgRon = BigDecimal("4.83"),
                    latencyMs = 85,
                ),
            ),
        )
        val healthy = healthService.getHealthStatus()
        assertEquals("HEALTHY", healthy.status)
        assertFalse(healthy.fallbackActive)
        assertEquals("PRETCARBURANT_LIVE", healthy.activeSource)

        `when`(provider.getProviderStates()).thenReturn(
            mapOf(
                FuelPriceSource.PRETCARBURANT_LIVE to FuelProviderHealthState(
                    provider = FuelPriceSource.PRETCARBURANT_LIVE,
                    healthy = false,
                    checkedAt = now,
                    error = "HTTP 503",
                ),
                FuelPriceSource.PRETCARBURANT_DATA to FuelProviderHealthState(
                    provider = FuelPriceSource.PRETCARBURANT_DATA,
                    healthy = true,
                    checkedAt = now,
                    sourceDate = LocalDate.parse("2026-11-19"),
                    dieselRon = BigDecimal("10.61"),
                ),
            ),
        )
        val fallback = healthService.getHealthStatus()
        assertEquals("FALLBACK", fallback.status)
        assertTrue(fallback.fallbackActive)
        assertEquals("PRETCARBURANT_DATA", fallback.activeSource)
        assertEquals("HTTP 503", fallback.primaryError)

        `when`(provider.getProviderStates()).thenReturn(
            mapOf(
                FuelPriceSource.PRETCARBURANT_LIVE to FuelProviderHealthState(FuelPriceSource.PRETCARBURANT_LIVE, false, now, error = "Timeout"),
                FuelPriceSource.PRETCARBURANT_DATA to FuelProviderHealthState(FuelPriceSource.PRETCARBURANT_DATA, false, now, error = "HTTP 500"),
                FuelPriceSource.EU_WEEKLY_OIL_BULLETIN to FuelProviderHealthState(FuelPriceSource.EU_WEEKLY_OIL_BULLETIN, false, now, error = "HTTP 502"),
            ),
        )
        val manualFallback = healthService.getHealthStatus()
        assertEquals("FALLBACK", manualFallback.status)
        assertTrue(manualFallback.fallbackActive)
        assertEquals("MANUAL_SETTING", manualFallback.activeSource)
    }

    @Test
    fun `HttpFuelPriceProvider getProviderPriority returns default EXTERNAL_SOURCES when empty or corrupt`() {
        val appSettingRepository = mock(AppSettingRepository::class.java)
        val fxService = mock(FxService::class.java)
        val provider = HttpFuelPriceProvider(objectMapper, fxService, appSettingRepository)

        `when`(appSettingRepository.findById("fuel_provider_priority")).thenReturn(Optional.empty())
        assertEquals(HttpFuelPriceProvider.EXTERNAL_SOURCES, provider.getProviderPriority())

        `when`(appSettingRepository.findById("fuel_provider_priority")).thenReturn(
            Optional.of(AppSetting(key = "fuel_provider_priority", value = "not-valid-json", updatedAt = Instant.now())),
        )
        assertEquals(HttpFuelPriceProvider.EXTERNAL_SOURCES, provider.getProviderPriority())
    }

    @Test
    fun `HttpFuelPriceProvider saveProviderPriority persists deduplicated external sources excluding MANUAL_SETTING`() {
        val appSettingRepository = mock(AppSettingRepository::class.java)
        val fxService = mock(FxService::class.java)
        val provider = HttpFuelPriceProvider(objectMapper, fxService, appSettingRepository)

        provider.saveProviderPriority(
            listOf(
                FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
                FuelPriceSource.MANUAL_SETTING,
                FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
            ),
        )

        val captor = ArgumentCaptor.forClass(AppSetting::class.java)
        verify(appSettingRepository).save(captor.capture())
        assertEquals("fuel_provider_priority", captor.value.key)
        assertEquals(
            listOf(
                FuelPriceSource.EU_WEEKLY_OIL_BULLETIN.name,
                FuelPriceSource.PRETCARBURANT_LIVE.name,
                FuelPriceSource.PRETCARBURANT_DATA.name,
            ),
            objectMapper.readValue(captor.value.value, List::class.java),
        )
    }

    @Test
    fun `HttpFuelPriceProvider resolvePriorityForDate swaps PRETCARBURANT_LIVE and PRETCARBURANT_DATA for historical dates`() {
        val appSettingRepository = mock(AppSettingRepository::class.java)
        val fxService = mock(FxService::class.java)
        val provider = HttpFuelPriceProvider(objectMapper, fxService, appSettingRepository)
        val configured = listOf(
            FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
            FuelPriceSource.PRETCARBURANT_LIVE,
            FuelPriceSource.PRETCARBURANT_DATA,
        )
        `when`(appSettingRepository.findById("fuel_provider_priority")).thenReturn(
            Optional.of(
                AppSetting(
                    key = "fuel_provider_priority",
                    value = objectMapper.writeValueAsString(configured.map { it.name }),
                    updatedAt = Instant.now(),
                ),
            ),
        )

        val today = LocalDate.parse("2026-11-21")
        assertEquals(configured, provider.resolvePriorityForDate(today, today))
        assertEquals(
            listOf(
                FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
                FuelPriceSource.PRETCARBURANT_DATA,
                FuelPriceSource.PRETCARBURANT_LIVE,
            ),
            provider.resolvePriorityForDate(today.minusDays(1), today),
        )
    }

    @Test
    fun `FuelPriceHealthService getHealthStatus reflects custom priority order`() {
        val provider = mock(HttpFuelPriceProvider::class.java)
        val repo = mock(FuelPriceRepository::class.java)
        val healthService = FuelPriceHealthService(provider, repo, scheduledEnabled = false)

        val customPriority = listOf(
            FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
            FuelPriceSource.PRETCARBURANT_DATA,
            FuelPriceSource.PRETCARBURANT_LIVE,
        )
        `when`(provider.getProviderPriority()).thenReturn(customPriority)
        val now = Instant.parse("2026-11-21T10:00:00Z")
        `when`(provider.getProviderStates()).thenReturn(
            mapOf(
                FuelPriceSource.EU_WEEKLY_OIL_BULLETIN to FuelProviderHealthState(
                    provider = FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
                    healthy = true,
                    checkedAt = now,
                    sourceDate = LocalDate.parse("2026-11-16"),
                    dieselRon = BigDecimal("10.72"),
                ),
                FuelPriceSource.PRETCARBURANT_DATA to FuelProviderHealthState(
                    provider = FuelPriceSource.PRETCARBURANT_DATA,
                    healthy = true,
                    checkedAt = now,
                ),
            ),
        )

        val status = healthService.getHealthStatus()
        assertEquals("HEALTHY", status.status)
        assertEquals(FuelPriceSource.EU_WEEKLY_OIL_BULLETIN.name, status.primaryProvider)
        assertEquals(FuelPriceSource.EU_WEEKLY_OIL_BULLETIN.name, status.activeSource)
        assertEquals(3, status.providers.size)

        assertEquals(FuelPriceSource.EU_WEEKLY_OIL_BULLETIN.name, status.providers[0].provider)
        assertEquals(1, status.providers[0].priority)
        assertTrue(status.providers[0].isPrimary)
        assertTrue(status.providers[0].active)

        assertEquals(FuelPriceSource.PRETCARBURANT_DATA.name, status.providers[1].provider)
        assertEquals(2, status.providers[1].priority)
        assertFalse(status.providers[1].isPrimary)
        assertFalse(status.providers[1].active)

        assertEquals(FuelPriceSource.PRETCARBURANT_LIVE.name, status.providers[2].provider)
        assertEquals(3, status.providers[2].priority)
        assertFalse(status.providers[2].isPrimary)
        assertFalse(status.providers[2].active)
    }
}
