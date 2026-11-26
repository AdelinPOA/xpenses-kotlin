package eu.nt.xpenses.mileage

import eu.nt.xpenses.dto.settings.MileageRatesOut
import eu.nt.xpenses.dto.settings.MileageRatesUpdate
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.fuel.ManualFuelPricePort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant

/**
 * Owns mileage rate and manual fallback fuel price settings in `app_settings`.
 */
@Service
class MileageRatesService(
    private val appSettingRepository: AppSettingRepository,
) : ManualFuelPricePort {
    fun getMileageRates(): MileageRatesOut {
        fun optionalValue(key: String) =
            appSettingRepository
                .findById(key)
                .orElse(null)
                ?.value
                ?.let { BigDecimal(it) }

        fun value(
            key: String,
            default: String,
        ) = optionalValue(key) ?: BigDecimal(default)

        val dieselPrice = value("mileage_fuel_price_ron_per_liter", "9.20")
        val petrolPrice = value("mileage_fuel_price_petrol_ron_per_liter", "9.20")
        val lpgPrice = value("mileage_fuel_price_lpg_ron_per_liter", "4.85")
        val electricPrice = optionalValue("mileage_fuel_price_electric_ron_per_liter") ?: dieselPrice

        return MileageRatesOut(
            mileageRateBeforeTax = value("mileage_rate_before_tax", "0.60"),
            mileageRateAfterTax = value("mileage_rate_after_tax", "0.40"),
            fuelConsumptionLitersPer100Km = value("mileage_fuel_consumption_l_per_100km", "7.5"),
            fuelPriceRonPerLiter = dieselPrice,
            fuelPricePetrolRonPerLiter = petrolPrice,
            fuelPriceLpgRonPerLiter = lpgPrice,
            fuelPriceElectricRonPerLiter = electricPrice,
            pensionRate = value("mileage_pension_rate", "0.25"),
            healthRate = value("mileage_health_rate", "0.10"),
            incomeTaxRate = value("mileage_income_tax_rate", "0.10"),
            taxDeductionEur = value("mileage_tax_deduction_eur", "0.00"),
        )
    }

    override fun getManualFuelPrice(vehicleFuelType: String?): BigDecimal {
        val rates = getMileageRates()
        return when (vehicleFuelType?.trim()?.lowercase()) {
            "petrol", "hybrid" -> rates.fuelPricePetrolRonPerLiter
            "lpg" -> rates.fuelPriceLpgRonPerLiter
            "electric" -> rates.fuelPriceElectricRonPerLiter
            else -> rates.fuelPriceRonPerLiter
        }
    }

    @Transactional
    fun updateMileageRates(body: MileageRatesUpdate): MileageRatesOut {
        val now = Instant.now()
        body.mileageRateBeforeTax?.let { appSettingRepository.save(AppSetting("mileage_rate_before_tax", it.toString(), now)) }
        body.mileageRateAfterTax?.let { appSettingRepository.save(AppSetting("mileage_rate_after_tax", it.toString(), now)) }
        mapOf(
            "mileage_fuel_consumption_l_per_100km" to body.fuelConsumptionLitersPer100Km,
            "mileage_fuel_price_ron_per_liter" to body.fuelPriceRonPerLiter,
            "mileage_fuel_price_petrol_ron_per_liter" to body.fuelPricePetrolRonPerLiter,
            "mileage_fuel_price_lpg_ron_per_liter" to body.fuelPriceLpgRonPerLiter,
            "mileage_fuel_price_electric_ron_per_liter" to body.fuelPriceElectricRonPerLiter,
            "mileage_pension_rate" to body.pensionRate,
            "mileage_health_rate" to body.healthRate,
            "mileage_income_tax_rate" to body.incomeTaxRate,
            "mileage_tax_deduction_eur" to body.taxDeductionEur,
        ).forEach { (key, value) -> value?.let { appSettingRepository.save(AppSetting(key, it.toString(), now)) } }
        return getMileageRates()
    }
}
