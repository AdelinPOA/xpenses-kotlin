package eu.nt.xpenses.services

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class MileageCalculationServiceTest {
    private val service = MileageCalculationService()

    @Test
    fun `matches workbook fuel and withholding calculation`() {
        val result = service.calculate(
            BigDecimal("670"),
            BigDecimal("5.09"),
            MileageCalculationSettings(
                grossRate = BigDecimal("0.60"),
                fuelConsumption = BigDecimal("7.5"),
                fuelPriceRonPerLiter = BigDecimal("9.20"),
                pensionRate = BigDecimal("0.25"),
                healthRate = BigDecimal("0.10"),
                incomeTaxRate = BigDecimal("0.10"),
                deduction = BigDecimal.ZERO
            )
        )

        assertEquals(BigDecimal("402.000000"), result.grossAmount.setScale(6))
        assertEquals(BigDecimal("50.250000"), result.fuelLiters.setScale(6))
        assertEquals(BigDecimal("90.825147"), result.fuelCostEur.setScale(6))
        assertEquals(BigDecimal("311.174853"), result.taxableAmount.setScale(6))
        assertEquals(BigDecimal("129.137564"), result.withholdingAmount.setScale(6))
        assertEquals(BigDecimal("272.862436"), result.netAmount.setScale(6))
        assertEquals(BigDecimal("0.407257"), result.netRate.setScale(6))
    }
}
