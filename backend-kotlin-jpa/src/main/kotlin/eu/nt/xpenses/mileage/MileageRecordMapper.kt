package eu.nt.xpenses.mileage

import eu.nt.xpenses.dto.report.MileageRecordOut
import eu.nt.xpenses.model.MileageRecord
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Duration

data class TripSheetDownload(
    val filename: String,
    val bytes: ByteArray,
)

fun toMileageRecordOut(m: MileageRecord): MileageRecordOut {
    val durationMins = Duration.between(m.startTime, m.endTime).toMillis() / 60000.0
    return MileageRecordOut(
        id = m.id ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Entity has no ID"),
        reportId = m.report.id ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Entity has no ID"),
        userId = m.user.id ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Entity has no ID"),
        origin = m.origin,
        destination = m.destination,
        distanceKm = m.distanceKm,
        rateBeforeTax = m.rateBeforeTax,
        rateAfterTax = m.rateAfterTax,
        amountBeforeTax = m.amountBeforeTax,
        amountEur = m.amountEur,
        amountOriginal = m.amountOriginal,
        fuelConsumptionLitersPer100Km = m.fuelConsumptionLitersPer100Km,
        fuelPriceRonPerLiter = m.fuelPriceRonPerLiter,
        fuelPriceSource = m.fuelPriceSource,
        fuelExchangeRate = m.fuelExchangeRate,
        fuelCostEur = m.fuelCostEur,
        taxableAmount = m.taxableAmount,
        withholdingAmount = m.withholdingAmount,
        pensionRate = m.pensionRate,
        healthRate = m.healthRate,
        incomeTaxRate = m.incomeTaxRate,
        taxDeductionEur = m.taxDeductionEur,
        currencyOriginal = m.currencyOriginal,
        fxRate = m.fxRate,
        startTime = m.startTime,
        endTime = m.endTime,
        description = m.description,
        createdAt = m.createdAt,
        updatedAt = m.updatedAt,
        durationMinutes = durationMins,
        vehicleId = m.vehicle?.id,
        vehiclePlate = m.vehiclePlate,
        vehicleMakeModel = m.vehicleMakeModel,
        vehicleFuelType = m.vehicleFuelType,
        vehicleCategory = m.vehicleCategory,
        roundTrip = m.roundTrip,
    )
}
