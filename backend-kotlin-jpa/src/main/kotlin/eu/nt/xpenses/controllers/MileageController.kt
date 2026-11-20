package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.report.MileageRecordCreate
import eu.nt.xpenses.dto.report.MileageRecordOut
import eu.nt.xpenses.dto.report.MileageRecordUpdate
import eu.nt.xpenses.model.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.MileageCalculationService
import eu.nt.xpenses.services.MileageCalculationSettings
import eu.nt.xpenses.services.TripSheetExportService
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

@RestController
@RequestMapping("/api/reports/{reportId}/mileage")
class MileageController(
    private val mileageRecordRepository: MileageRecordRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val appSettingRepository: AppSettingRepository,
    private val userVehicleRepository: UserVehicleRepository,
    private val reportOwnership: ReportOwnership,
    private val fxService: FxService,
    private val tripSheetExportService: TripSheetExportService,
    private val mileageCalculationService: MileageCalculationService = MileageCalculationService()
) {

    private fun getMileageRates(): Pair<BigDecimal, BigDecimal> {
        val rateBt = appSettingRepository.findById("mileage_rate_before_tax").orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal("0.60")
        val rateAt = appSettingRepository.findById("mileage_rate_after_tax").orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal("0.40")
        return Pair(rateBt, rateAt)
    }

    private fun getDefaultFuelConsumption(): BigDecimal =
        appSettingRepository.findById("mileage_fuel_consumption_l_per_100km").orElse(null)?.value?.let { BigDecimal(it) }
            ?: BigDecimal("7.5")

    private fun getCalculationSettings(fuelConsumptionOverride: BigDecimal? = null): MileageCalculationSettings {
        val (grossRate, _) = getMileageRates()
        fun setting(key: String, default: String) = appSettingRepository.findById(key).orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal(default)
        return MileageCalculationSettings(
            grossRate = grossRate,
            fuelConsumption = fuelConsumptionOverride ?: setting("mileage_fuel_consumption_l_per_100km", "7.5"),
            fuelPriceRonPerLiter = setting("mileage_fuel_price_ron_per_liter", "9.20"),
            pensionRate = setting("mileage_pension_rate", "0.25"),
            healthRate = setting("mileage_health_rate", "0.10"),
            incomeTaxRate = setting("mileage_income_tax_rate", "0.10"),
            deduction = setting("mileage_tax_deduction_eur", "0.00")
        )
    }

    @GetMapping
    @Transactional(readOnly = true)
    fun listMileage(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): List<MileageRecordOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        reportOwnership.verifyOwnership(reportId, currentUser)

        val records = mileageRecordRepository.findAllByReportId(reportId)
        return records.sortedBy { it.startTime }.map { mapRecordToOut(it) }
    }

    @GetMapping("/trip-sheet")
    @Transactional(readOnly = true)
    fun downloadTripSheet(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = reportOwnership.verifyOwnership(reportId, currentUser)
        val records = mileageRecordRepository.findAllByReportId(reportId)
        if (records.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Report has no mileage records")
        }

        val bytes = tripSheetExportService.buildTripSheet(report, records)
        val today = LocalDate.now(ZoneId.of("Europe/Bucharest"))
        val filename = "foaie_parcurs_raport_${reportId}_${today}.xlsx"

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$filename\"")
            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(bytes)
    }

    @PostMapping
    @Transactional
    fun createMileage(
        @PathVariable reportId: Int,
        @Valid @RequestBody body: MileageRecordCreate,
        request: HttpServletRequest
    ): ResponseEntity<MileageRecordOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = reportOwnership.verifyOwnership(reportId, currentUser)
        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the report owner can modify mileage records")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft reports can be modified")
        }

        if (body.endTime.isBefore(body.startTime) || body.endTime == body.startTime) {
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, "end_time must be after start_time")
        }

        val vehicle = body.vehicleId?.let { vehicleId ->
            userVehicleRepository.findByIdAndUserId(vehicleId, currentUser.id!!)
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found")
        }

        val distanceBd = BigDecimal.valueOf(body.distanceKm)
        val fxRate = resolveFuelExchangeRate(body.startTime)
        val settings = getCalculationSettings(vehicle?.fuelConsumptionLitersPer100Km)
        val calculation = mileageCalculationService.calculate(distanceBd, fxRate, settings)
        val amountBeforeTax = calculation.grossAmount.setScale(2, RoundingMode.HALF_UP)
        val amountOriginal = calculation.netAmount.setScale(2, RoundingMode.HALF_UP)
        val amountEur = amountOriginal

        val record = MileageRecord(
            report = report,
            user = currentUser,
            origin = body.origin,
            destination = body.destination,
            distanceKm = body.distanceKm,
            rateBeforeTax = settings.grossRate,
            rateAfterTax = calculation.netRate,
            amountBeforeTax = amountBeforeTax,
            amountEur = amountEur,
            amountOriginal = amountOriginal,
            currencyOriginal = "EUR",
            fxRate = BigDecimal.ONE,
            fuelConsumptionLitersPer100Km = settings.fuelConsumption,
            fuelPriceRonPerLiter = settings.fuelPriceRonPerLiter,
            fuelExchangeRate = fxRate,
            fuelCostEur = calculation.fuelCostEur,
            taxableAmount = calculation.taxableAmount,
            withholdingAmount = calculation.withholdingAmount,
            pensionRate = settings.pensionRate,
            healthRate = settings.healthRate,
            incomeTaxRate = settings.incomeTaxRate,
            taxDeductionEur = settings.deduction,
            startTime = body.startTime,
            endTime = body.endTime,
            description = body.description,
            vehicle = vehicle,
            vehiclePlate = vehicle?.plateNumber,
            vehicleMakeModel = vehicle?.makeModel,
            vehicleFuelType = vehicle?.fuelType,
            vehicleCategory = vehicle?.vehicleCategory,
            roundTrip = body.roundTrip,
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

        val saved = mileageRecordRepository.save(record)
        return ResponseEntity.status(HttpStatus.CREATED).body(mapRecordToOut(saved))
    }

    @PatchMapping("/{mileageId}")
    @Transactional
    fun updateMileage(
        @PathVariable reportId: Int,
        @PathVariable mileageId: Int,
        @Valid @RequestBody body: MileageRecordUpdate,
        request: HttpServletRequest
    ): MileageRecordOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = reportOwnership.verifyOwnership(reportId, currentUser)
        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the report owner can modify mileage records")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft reports can be modified")
        }

        val rec = mileageRecordRepository.findById(mileageId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Mileage record not found")
        }

        if (rec.report.id != reportId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Mileage record not in this report")
        }

        if (body.origin != null) rec.origin = body.origin
        if (body.destination != null) rec.destination = body.destination
        if (body.description != null) rec.description = body.description
        if (body.roundTrip != null) rec.roundTrip = body.roundTrip

        val previousBusinessDate = businessDate(rec.startTime)
        if (body.startTime != null) rec.startTime = body.startTime
        if (body.endTime != null) rec.endTime = body.endTime

        if (rec.endTime.isBefore(rec.startTime) || rec.endTime == rec.startTime) {
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, "end_time must be after start_time")
        }

        val distanceChanged = body.distanceKm != null
        val dateChanged = businessDate(rec.startTime) != previousBusinessDate
        if (distanceChanged) {
            rec.distanceKm = body.distanceKm
        }

        val vehicleChanged = body.clearVehicle || body.vehicleId != null
        if (vehicleChanged) {
            val newVehicle = if (body.clearVehicle) {
                null
            } else {
                userVehicleRepository.findByIdAndUserId(body.vehicleId!!, currentUser.id!!)
                    ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found")
            }
            rec.vehicle = newVehicle
            rec.vehiclePlate = newVehicle?.plateNumber
            rec.vehicleMakeModel = newVehicle?.makeModel
            rec.vehicleFuelType = newVehicle?.fuelType
            rec.vehicleCategory = newVehicle?.vehicleCategory
            rec.fuelConsumptionLitersPer100Km = newVehicle?.fuelConsumptionLitersPer100Km ?: getDefaultFuelConsumption()
        }

        if (distanceChanged || dateChanged || vehicleChanged) {
            val hasFuelFields = rec.fuelConsumptionLitersPer100Km != null &&
                rec.fuelPriceRonPerLiter != null &&
                rec.pensionRate != null &&
                rec.healthRate != null &&
                rec.incomeTaxRate != null &&
                rec.taxDeductionEur != null
            if (hasFuelFields) {
                recalculate(rec, BigDecimal.valueOf(rec.distanceKm))
            } else {
                if (dateChanged) {
                    rec.fxRate = resolveFxRate(rec.startTime)
                }
                if (distanceChanged) {
                    val distanceBd = BigDecimal.valueOf(rec.distanceKm)
                    rec.amountBeforeTax = rec.rateBeforeTax.multiply(distanceBd).setScale(2, RoundingMode.HALF_UP)
                    rec.amountOriginal = rec.rateAfterTax.multiply(distanceBd).setScale(2, RoundingMode.HALF_UP)
                }
                rec.amountEur = rec.amountOriginal.multiply(rec.fxRate).setScale(2, RoundingMode.HALF_UP)
            }
        }

        rec.updatedAt = Instant.now()
        val saved = mileageRecordRepository.save(rec)
        return mapRecordToOut(saved)
    }

    @DeleteMapping("/{mileageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    fun deleteMileage(
        @PathVariable reportId: Int,
        @PathVariable mileageId: Int,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = reportOwnership.verifyOwnership(reportId, currentUser)
        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the report owner can modify mileage records")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft reports can be modified")
        }

        val rec = mileageRecordRepository.findById(mileageId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Mileage record not found")
        }

        if (rec.report.id != reportId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Mileage record not in this report")
        }

        mileageRecordRepository.delete(rec)
    }

    private fun mapRecordToOut(m: MileageRecord): MileageRecordOut {
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
            roundTrip = m.roundTrip
        )
    }

    private fun businessDate(startTime: Instant): String =
        startTime.atZone(ZoneOffset.UTC).toLocalDate().toString()

    private fun resolveFxRate(startTime: Instant): BigDecimal = try {
        fxService.getRate("EUR", businessDate(startTime))
    } catch (e: Exception) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
    }

    private fun resolveFuelExchangeRate(startTime: Instant): BigDecimal = try {
        // FxService exposes RON->EUR; the workbook needs RON per EUR.
        val ronToEur = fxService.getRate("RON", businessDate(startTime))
        if (ronToEur <= BigDecimal.ZERO) throw IllegalArgumentException("RON FX rate must be positive")
        BigDecimal.ONE.divide(ronToEur, 12, RoundingMode.HALF_UP)
    } catch (e: Exception) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch RON exchange rate: ${e.message}")
    }

    private fun recalculate(rec: MileageRecord, distance: BigDecimal) {
        val fuelFx = resolveFuelExchangeRate(rec.startTime)
        val settings = getCalculationSettings().copy(
            grossRate = rec.rateBeforeTax,
            fuelConsumption = rec.fuelConsumptionLitersPer100Km ?: return,
            fuelPriceRonPerLiter = rec.fuelPriceRonPerLiter ?: return,
            pensionRate = rec.pensionRate ?: return,
            healthRate = rec.healthRate ?: return,
            incomeTaxRate = rec.incomeTaxRate ?: return,
            deduction = rec.taxDeductionEur ?: return
        )
        val calculation = mileageCalculationService.calculate(distance, fuelFx, settings)
        rec.rateAfterTax = calculation.netRate
        rec.amountBeforeTax = calculation.grossAmount.setScale(2, RoundingMode.HALF_UP)
        rec.amountOriginal = calculation.netAmount.setScale(2, RoundingMode.HALF_UP)
        rec.amountEur = rec.amountOriginal
        rec.fxRate = BigDecimal.ONE
        rec.fuelExchangeRate = fuelFx
        rec.fuelCostEur = calculation.fuelCostEur
        rec.taxableAmount = calculation.taxableAmount
        rec.withholdingAmount = calculation.withholdingAmount
    }
}
