package eu.nt.xpenses.services.fuel

import eu.nt.xpenses.dto.settings.FuelLastDbPriceOut
import eu.nt.xpenses.dto.settings.FuelPriceHealthStatusOut
import eu.nt.xpenses.dto.settings.FuelProviderHealthItemOut
import eu.nt.xpenses.repositories.FuelPriceRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.time.ZoneId

/**
 * Monitors live reachability and fallback status across external fuel price sources
 * so outages are immediately surfaced in the sidebar and admin settings GUI.
 */
@Service
class FuelPriceHealthService(
    private val httpFuelPriceProvider: HttpFuelPriceProvider,
    private val fuelPriceRepository: FuelPriceRepository,
    @Value("\${fuel.health.scheduled-enabled:true}")
    private val scheduledEnabled: Boolean = true,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(
        initialDelayString = "\${fuel.health.initial-delay-ms:15000}",
        fixedDelayString = "\${fuel.health.check-interval-ms:3600000}",
    )
    fun scheduledHealthCheck() {
        if (!scheduledEnabled) return
        try {
            runHealthCheck()
        } catch (e: Exception) {
            log.warn("Scheduled fuel price health check failed unexpectedly: {}", e.message)
        }
    }

    /** Probe all configured external fuel price providers bypassing TTL caches and return aggregated status. */
    fun runHealthCheck(
        date: LocalDate = LocalDate.now(ZoneId.of("Europe/Bucharest")),
    ): FuelPriceHealthStatusOut {
        val priority = httpFuelPriceProvider.getProviderPriority().ifEmpty { HttpFuelPriceProvider.EXTERNAL_SOURCES }
        for (source in priority) {
            httpFuelPriceProvider.probeProvider(source, date, bypassCache = true)
        }
        val snapshot = getHealthStatus()
        when (snapshot.status) {
            "HEALTHY" -> {
                val primaryState = snapshot.providers.firstOrNull { it.active }
                log.info(
                    "Fuel price health HEALTHY: primary={} active={} dieselRon={} petrolRon={} lpgRon={} sourceDate={}",
                    snapshot.primaryProvider,
                    snapshot.activeSource,
                    primaryState?.dieselRon,
                    primaryState?.petrolRon,
                    primaryState?.lpgRon,
                    primaryState?.sourceDate,
                )
            }
            "FALLBACK" -> {
                log.warn(
                    "Fuel price health FALLBACK: primary={} failed ({}) -> active fallback={}",
                    snapshot.primaryProvider,
                    snapshot.primaryError,
                    snapshot.activeSource,
                )
            }
        }
        return snapshot
    }

    /** Compute current fuel provider health snapshot from probe/resolve states and latest cached DB price. */
    fun getHealthStatus(): FuelPriceHealthStatusOut {
        val priority = httpFuelPriceProvider.getProviderPriority().ifEmpty { HttpFuelPriceProvider.EXTERNAL_SOURCES }
        val states = httpFuelPriceProvider.getProviderStates()
        val primary = priority.first()
        val anyChecked = priority.any { states[it] != null }
        val activeExternal = priority.firstOrNull { states[it]?.healthy == true }

        val activeSource = when {
            !anyChecked -> null
            activeExternal != null -> activeExternal.name
            else -> FuelPriceSource.MANUAL_SETTING.name
        }
        val status = when {
            !anyChecked -> "UNKNOWN"
            activeExternal == primary -> "HEALTHY"
            else -> "FALLBACK"
        }

        val lastCheckedAt = states.values.maxOfOrNull { it.checkedAt }
        val primaryError = states[primary]?.takeIf { !it.healthy }?.error

        val items = priority.mapIndexed { idx, source ->
            val state = states[source]
            FuelProviderHealthItemOut(
                provider = source.name,
                priority = idx + 1,
                healthy = state?.healthy == true,
                active = activeExternal == source,
                isPrimary = idx == 0,
                checkedAt = state?.checkedAt,
                sourceDate = state?.sourceDate?.toString(),
                dieselRon = state?.dieselRon,
                petrolRon = state?.petrolRon,
                lpgRon = state?.lpgRon,
                latencyMs = state?.latencyMs,
                error = state?.error,
            )
        }

        val lastDbPrice = try {
            fuelPriceRepository.findTopByOrderByFetchedAtDesc()?.let { rec ->
                FuelLastDbPriceOut(
                    fuelType = rec.fuelType,
                    priceDate = rec.priceDate,
                    sourceDate = rec.sourceDate.toString(),
                    source = rec.source.name,
                    priceRonPerLiter = rec.priceRonPerLiter,
                    fetchedAt = rec.fetchedAt,
                )
            }
        } catch (e: Exception) {
            log.debug("Could not fetch latest DB fuel price summary: {}", e.message)
            null
        }

        return FuelPriceHealthStatusOut(
            status = status,
            primaryProvider = primary.name,
            activeSource = activeSource,
            fallbackActive = status == "FALLBACK",
            lastCheckedAt = lastCheckedAt,
            primaryError = primaryError,
            providers = items,
            lastDbPrice = lastDbPrice,
        )
    }
}
