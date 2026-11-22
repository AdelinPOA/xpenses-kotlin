package eu.nt.xpenses.mileage

import java.math.BigDecimal
import java.math.RoundingMode

internal data class MileageCalculationSettings(
    val grossRate: BigDecimal,
    val fuelConsumption: BigDecimal,
    val fuelPriceRonPerLiter: BigDecimal,
    val pensionRate: BigDecimal,
    val healthRate: BigDecimal,
    val incomeTaxRate: BigDecimal,
    val deduction: BigDecimal,
)

internal data class MileageCalculation(
    val grossAmount: BigDecimal,
    val fuelLiters: BigDecimal,
    val fuelCostRon: BigDecimal,
    val fuelCostEur: BigDecimal,
    val taxableAmount: BigDecimal,
    val pensionAmount: BigDecimal,
    val healthAmount: BigDecimal,
    val incomeTaxAmount: BigDecimal,
    val withholdingAmount: BigDecimal,
    val netAmount: BigDecimal,
    val netRate: BigDecimal,
)

internal class MileageCalculator {
    fun calculate(
        distanceKm: BigDecimal,
        fuelExchangeRate: BigDecimal,
        settings: MileageCalculationSettings,
    ): MileageCalculation {
        require(fuelExchangeRate > BigDecimal.ZERO) { "Fuel exchange rate must be positive" }
        val gross = distanceKm.multiply(settings.grossRate)
        val liters = distanceKm.multiply(settings.fuelConsumption).divide(BigDecimal(100), 12, RoundingMode.HALF_UP)
        val fuelRon = liters.multiply(settings.fuelPriceRonPerLiter)
        val fuelEur = fuelRon.divide(fuelExchangeRate, 12, RoundingMode.HALF_UP)
        val taxable = gross.subtract(fuelEur).max(BigDecimal.ZERO)
        val pension = taxable.multiply(settings.pensionRate)
        val health = taxable.multiply(settings.healthRate)
        val incomeTaxBase = taxable.subtract(pension).subtract(health).subtract(settings.deduction).max(BigDecimal.ZERO)
        val incomeTax = incomeTaxBase.multiply(settings.incomeTaxRate)
        val withholding = pension.add(health).add(incomeTax)
        val net = gross.subtract(withholding).max(BigDecimal.ZERO)
        val netRate = if (distanceKm.signum() == 0) BigDecimal.ZERO else net.divide(distanceKm, 12, RoundingMode.HALF_UP)
        return MileageCalculation(
            grossAmount = gross,
            fuelLiters = liters,
            fuelCostRon = fuelRon,
            fuelCostEur = fuelEur,
            taxableAmount = taxable,
            pensionAmount = pension,
            healthAmount = health,
            incomeTaxAmount = incomeTax,
            withholdingAmount = withholding,
            netAmount = net,
            netRate = netRate,
        )
    }
}
