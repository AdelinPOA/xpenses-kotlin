package eu.nt.xpenses.mileage

import eu.nt.xpenses.services.AppSettingsService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.fuel.FuelPriceService
import eu.nt.xpenses.services.fuel.ResolvedFuelPrice
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.LocalDate

fun interface MileageFxRatePort {
    fun getRateToEur(fromCurrency: String, businessDate: String): BigDecimal
}

fun interface MileageFuelPricePort {
    fun resolveFuelPrice(vehicleFuelType: String?, date: LocalDate): ResolvedFuelPrice
}

data class MileageRatesConfig(
    val grossRate: BigDecimal,
    val defaultFuelConsumption: BigDecimal,
    val defaultFuelPriceRonPerLiter: BigDecimal,
    val pensionRate: BigDecimal,
    val healthRate: BigDecimal,
    val incomeTaxRate: BigDecimal,
    val taxDeductionEur: BigDecimal,
)

fun interface MileageRatesConfigPort {
    fun currentRates(): MileageRatesConfig
}

@Component
class FxServiceMileageAdapter(
    private val fxService: FxService,
) : MileageFxRatePort {
    override fun getRateToEur(fromCurrency: String, businessDate: String): BigDecimal =
        fxService.getRate(fromCurrency, businessDate)
}

@Component
class FuelPriceServiceMileageAdapter(
    private val fuelPriceService: FuelPriceService,
) : MileageFuelPricePort {
    override fun resolveFuelPrice(vehicleFuelType: String?, date: LocalDate): ResolvedFuelPrice =
        fuelPriceService.resolveFuelPrice(vehicleFuelType, date)
}

@Component
class AppSettingsMileageRatesAdapter(
    private val appSettingsService: AppSettingsService,
) : MileageRatesConfigPort {
    override fun currentRates(): MileageRatesConfig {
        val rates = appSettingsService.getMileageRates()
        return MileageRatesConfig(
            grossRate = rates.mileageRateBeforeTax,
            defaultFuelConsumption = rates.fuelConsumptionLitersPer100Km,
            defaultFuelPriceRonPerLiter = rates.fuelPriceRonPerLiter,
            pensionRate = rates.pensionRate,
            healthRate = rates.healthRate,
            incomeTaxRate = rates.incomeTaxRate,
            taxDeductionEur = rates.taxDeductionEur,
        )
    }
}
