package eu.nt.xpenses.services.fuel

import eu.nt.xpenses.model.FuelPrice
import eu.nt.xpenses.repositories.FuelPriceRepository
import eu.nt.xpenses.services.AppSettingsService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

data class ResolvedFuelPrice(
    val priceRonPerLiter: BigDecimal,
    val sourceDate: LocalDate,
    val source: FuelPriceSource,
    val fuelType: String,
)

/**
 * Resolves and caches daily average fuel prices in PostgreSQL (`fuel_prices`) per canonical fuel type and trip date,
 * falling back to per-fuel manual settings in `/admin/settings` when external sources do not cover the vehicle/date.
 */
@Service
class FuelPriceService @Autowired constructor(
    private val fuelPriceRepository: FuelPriceRepository,
    private val fuelPriceProvider: FuelPriceProvider,
    private val appSettingsService: AppSettingsService,
    private val transactionManager: PlatformTransactionManager? = null,
    @Value("\${fuel.price.live-enabled:true}")
    private val liveEnabled: Boolean = true,
) {
    constructor(
        fuelPriceRepository: FuelPriceRepository,
        fuelPriceProvider: FuelPriceProvider,
        appSettingsService: AppSettingsService,
    ) : this(fuelPriceRepository, fuelPriceProvider, appSettingsService, null, true)

    fun resolveFuelPrice(vehicleFuelType: String?, date: LocalDate): ResolvedFuelPrice {
        val normalized = vehicleFuelType?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
            ?: return manualFallback("default", null, date)

        if (normalized == "electric") {
            return manualFallback("electric", "electric", date)
        }

        val canonical = when (normalized) {
            "diesel" -> "diesel"
            "petrol", "hybrid" -> "petrol"
            "lpg" -> "lpg"
            else -> return manualFallback(normalized, normalized, date)
        }

        val dateKey = date.toString()
        val cached = fuelPriceRepository.findByFuelTypeAndPriceDate(canonical, dateKey)
        if (cached != null) {
            return ResolvedFuelPrice(
                priceRonPerLiter = cached.priceRonPerLiter,
                sourceDate = cached.sourceDate,
                source = cached.source,
                fuelType = canonical,
            )
        }

        if (liveEnabled) {
            val resolved = fuelPriceProvider.resolve(canonical, date)
            if (resolved != null) {
                val candidate = FuelPrice(
                    fuelType = canonical,
                    priceDate = dateKey,
                    sourceDate = resolved.sourceDate,
                    source = resolved.source,
                    priceRonPerLiter = resolved.priceRonPerLiter,
                    stationCount = resolved.stationCount,
                    fetchedAt = Instant.now(),
                )
                val persisted = persistCachedPrice(candidate, canonical, dateKey)
                return ResolvedFuelPrice(
                    priceRonPerLiter = persisted.priceRonPerLiter,
                    sourceDate = persisted.sourceDate,
                    source = persisted.source,
                    fuelType = canonical,
                )
            }
        }

        return manualFallback(canonical, canonical, date)
    }

    private fun manualFallback(
        labelFuelType: String,
        lookupFuelType: String?,
        date: LocalDate,
    ): ResolvedFuelPrice = ResolvedFuelPrice(
        priceRonPerLiter = appSettingsService.getManualFuelPrice(lookupFuelType),
        sourceDate = date,
        source = FuelPriceSource.MANUAL_SETTING,
        fuelType = labelFuelType,
    )

    // Persist in an independent transaction so duplicate concurrent inserts do not mark the caller's transaction rollback-only.
    private fun persistCachedPrice(
        candidate: FuelPrice,
        canonicalFuelType: String,
        dateKey: String,
    ): FuelPrice {
        if (transactionManager == null) {
            return try {
                fuelPriceRepository.save(candidate)
            } catch (ex: DataIntegrityViolationException) {
                fuelPriceRepository.findByFuelTypeAndPriceDate(canonicalFuelType, dateKey) ?: throw ex
            }
        }

        val requiresNew = TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }
        return try {
            requiresNew.execute { fuelPriceRepository.saveAndFlush(candidate) }
                ?: fuelPriceRepository.findByFuelTypeAndPriceDate(canonicalFuelType, dateKey)
                ?: candidate
        } catch (ex: DataIntegrityViolationException) {
            fuelPriceRepository.findByFuelTypeAndPriceDate(canonicalFuelType, dateKey) ?: throw ex
        }
    }
}
