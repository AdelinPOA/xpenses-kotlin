package eu.nt.xpenses.services.fx

import eu.nt.xpenses.dto.settings.FxHealthStatusOut
import eu.nt.xpenses.dto.settings.FxLastDbRateOut
import eu.nt.xpenses.dto.settings.FxProviderHealthItemOut
import eu.nt.xpenses.repositories.FxRateRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.time.ZoneId

/**
 * Tracks live reachability and fallback status across configured FX providers
 * and runs periodic background probes so failures (e.g. feed URL changes) are surfaced in the GUI.
 */
@Service
class FxProviderHealthService(
    private val httpFxRateProvider: HttpFxRateProvider,
    private val fxRateRepository: FxRateRepository,
    @Value("\${fx.health.scheduled-enabled:true}")
    private val scheduledEnabled: Boolean = true,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(
        initialDelayString = "\${fx.health.initial-delay-ms:10000}",
        fixedDelayString = "\${fx.health.check-interval-ms:1800000}",
    )
    fun scheduledHealthCheck() {
        if (!scheduledEnabled) return
        try {
            runHealthCheck()
        } catch (e: Exception) {
            log.warn("Scheduled FX health check failed unexpectedly: {}", e.message)
        }
    }

    /** Probe every configured FX provider in priority order and return the aggregated health snapshot. */
    fun runHealthCheck(
        date: LocalDate = LocalDate.now(ZoneId.of("Europe/Bucharest")),
    ): FxHealthStatusOut {
        val priority = httpFxRateProvider.getProviderPriority()
        for (source in priority) {
            httpFxRateProvider.probeProvider(source, "RON", date)
        }
        val snapshot = getHealthStatus()
        when (snapshot.status) {
            "HEALTHY" -> {
                val primaryState = snapshot.providers.firstOrNull { it.active }
                log.info(
                    "FX provider health HEALTHY: primary={} active={} ronPerEur={} sourceDate={}",
                    snapshot.primaryProvider,
                    snapshot.activeSource,
                    primaryState?.ronPerEur,
                    primaryState?.sourceDate,
                )
            }
            "FALLBACK" -> {
                log.warn(
                    "FX provider health FALLBACK: primary={} failed ({}) -> active fallback={}",
                    snapshot.primaryProvider,
                    snapshot.primaryError,
                    snapshot.activeSource,
                )
            }
            "DOWN" -> {
                log.warn(
                    "FX provider health DOWN: primary={} failed ({}) and no fallback succeeded",
                    snapshot.primaryProvider,
                    snapshot.primaryError,
                )
            }
        }
        return snapshot
    }

    /** Compute the current FX provider status from in-memory probe/resolve states and latest DB cache entry. */
    fun getHealthStatus(): FxHealthStatusOut {
        val priority = httpFxRateProvider.getProviderPriority()
        val states = httpFxRateProvider.getProviderStates()
        val primary = priority.first()
        val anyChecked = priority.any { states[it] != null }
        val activeSource = priority.firstOrNull { states[it]?.healthy == true }

        val status = when {
            !anyChecked -> "UNKNOWN"
            activeSource == null -> "DOWN"
            activeSource != primary -> "FALLBACK"
            else -> "HEALTHY"
        }

        val lastCheckedAt = states.values.maxOfOrNull { it.checkedAt }
        val primaryError = states[primary]?.takeIf { !it.healthy }?.error

        val items = priority.mapIndexed { idx, source ->
            val state = states[source]
            FxProviderHealthItemOut(
                provider = source.name,
                priority = idx + 1,
                healthy = state?.healthy == true,
                active = activeSource == source,
                isPrimary = idx == 0,
                checkedAt = state?.checkedAt,
                sourceDate = state?.sourceDate?.toString(),
                ronPerEur = state?.ronPerEur,
                latencyMs = state?.latencyMs,
                error = state?.error,
            )
        }

        val lastDbRate = try {
            fxRateRepository.findTopByOrderByFetchedAtDesc()?.let { rec ->
                FxLastDbRateOut(
                    fromCurrency = rec.fromCurrency,
                    rateDate = rec.rateDate,
                    sourceDate = rec.sourceDate.toString(),
                    source = rec.source.name,
                    rate = rec.rate,
                    fetchedAt = rec.fetchedAt,
                )
            }
        } catch (e: Exception) {
            log.debug("Could not fetch latest DB FX rate summary: {}", e.message)
            null
        }

        return FxHealthStatusOut(
            status = status,
            primaryProvider = primary.name,
            activeSource = activeSource?.name,
            fallbackActive = status == "FALLBACK",
            lastCheckedAt = lastCheckedAt,
            primaryError = primaryError,
            providers = items,
            lastDbRate = lastDbRate,
        )
    }
}
