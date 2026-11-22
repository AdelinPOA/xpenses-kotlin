package eu.nt.xpenses.mileage

import eu.nt.xpenses.controllers.ReportOwnership
import eu.nt.xpenses.dto.report.MileageRecordCreate
import eu.nt.xpenses.dto.report.MileageRecordOut
import eu.nt.xpenses.dto.report.MileageRecordUpdate
import eu.nt.xpenses.dto.vehicle.UserVehicleCreate
import eu.nt.xpenses.dto.vehicle.UserVehicleOut
import eu.nt.xpenses.dto.vehicle.UserVehicleUpdate
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.MileageRecord
import eu.nt.xpenses.model.User
import eu.nt.xpenses.model.UserVehicle
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.MileageRecordRepository
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.repositories.UserVehicleRepository
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale

@Service
class VehicleMileage @Autowired constructor(
    private val mileageRecordRepository: MileageRecordRepository,
    private val userVehicleRepository: UserVehicleRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val userRepository: UserRepository,
    private val reportOwnership: ReportOwnership,
    private val fxRatePort: MileageFxRatePort,
    private val fuelPricePort: MileageFuelPricePort,
    private val ratesConfigPort: MileageRatesConfigPort,
    @Value("\${company.name:Newtech Automation}")
    companyName: String = "Newtech Automation",
) {
    companion object {
        private val ALLOWED_FUEL_TYPES = setOf("petrol", "diesel", "hybrid", "electric", "lpg")
        private val MIN_CONSUMPTION = BigDecimal("0.01")
        private val MAX_CONSUMPTION = BigDecimal("50.00")
        private val MIN_ODOMETER_KM = BigDecimal.ZERO
        private val MAX_ODOMETER_KM = BigDecimal("9999999.9")
        private const val DEFAULT_VEHICLE_CATEGORY = "M1"
        private const val MAX_PLATE_LENGTH = 32
        private const val MAX_MAKE_MODEL_LENGTH = 120
        private const val MAX_VEHICLE_CATEGORY_LENGTH = 16
        private val BUCHAREST_ZONE: ZoneId = ZoneId.of("Europe/Bucharest")
    }

    private val calculator = MileageCalculator()
    private val tripSheetExporter = TripSheetExporter(companyName)

    @Transactional(readOnly = true)
    fun listMileage(reportId: Int, actor: User): List<MileageRecordOut> {
        reportOwnership.verifyOwnership(reportId, actor)
        return mileageRecordRepository.findAllByReportId(reportId)
            .sortedBy { it.startTime }
            .map(::toMileageRecordOut)
    }

    @Transactional(readOnly = true)
    fun exportTripSheet(reportId: Int, actor: User): TripSheetDownload {
        val report = reportOwnership.verifyOwnership(reportId, actor)
        val records = mileageRecordRepository.findAllByReportId(reportId)
        if (records.isEmpty()) {
            throw badRequest("Report has no mileage records")
        }

        val bytes = tripSheetExporter.buildTripSheet(report, records)
        val today = LocalDate.now(BUCHAREST_ZONE)
        return TripSheetDownload(
            filename = "foaie_parcurs_raport_${reportId}_${today}.xlsx",
            bytes = bytes,
        )
    }

    @Transactional
    fun createMileage(reportId: Int, body: MileageRecordCreate, actor: User): MileageRecordOut {
        val actorId = requireActorId(actor)
        val report = requireEditableDraftReport(reportId, actor)
        requireValidTimeRange(body.startTime, body.endTime)

        val vehicle = body.vehicleId?.let { resolveOwnedVehicle(it, actorId) }
        val distanceBd = BigDecimal.valueOf(body.distanceKm)
        val fxRate = resolveFuelExchangeRate(body.startTime)
        val resolvedFuel = fuelPricePort.resolveFuelPrice(
            vehicle?.fuelType,
            LocalDate.parse(businessDate(body.startTime)),
        )
        val config = ratesConfigPort.currentRates()
        val settings = MileageCalculationSettings(
            grossRate = config.grossRate,
            fuelConsumption = vehicle?.fuelConsumptionLitersPer100Km ?: config.defaultFuelConsumption,
            fuelPriceRonPerLiter = resolvedFuel.priceRonPerLiter,
            pensionRate = config.pensionRate,
            healthRate = config.healthRate,
            incomeTaxRate = config.incomeTaxRate,
            deduction = config.taxDeductionEur,
        )
        val calculation = calculator.calculate(distanceBd, fxRate, settings)
        val amountBeforeTax = calculation.grossAmount.setScale(2, RoundingMode.HALF_UP)
        val amountOriginal = calculation.netAmount.setScale(2, RoundingMode.HALF_UP)
        val amountEur = amountOriginal
        val now = Instant.now()

        val record = MileageRecord(
            report = report,
            user = actor,
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
            fuelPriceSource = resolvedFuel.source.name,
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
            createdAt = now,
            updatedAt = now,
        )

        val saved = mileageRecordRepository.save(record)
        return toMileageRecordOut(saved)
    }

    @Transactional
    fun updateMileage(reportId: Int, mileageId: Int, body: MileageRecordUpdate, actor: User): MileageRecordOut {
        val actorId = requireActorId(actor)
        requireEditableDraftReport(reportId, actor)

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
        requireValidTimeRange(rec.startTime, rec.endTime)

        val distanceChanged = body.distanceKm != null
        val dateChanged = businessDate(rec.startTime) != previousBusinessDate
        if (body.distanceKm != null) {
            rec.distanceKm = body.distanceKm
        }

        val vehicleChanged = body.clearVehicle || body.vehicleId != null
        if (vehicleChanged) {
            val newVehicle = if (body.clearVehicle) {
                null
            } else {
                resolveOwnedVehicle(body.vehicleId!!, actorId)
            }
            rec.vehicle = newVehicle
            rec.vehiclePlate = newVehicle?.plateNumber
            rec.vehicleMakeModel = newVehicle?.makeModel
            rec.vehicleFuelType = newVehicle?.fuelType
            rec.vehicleCategory = newVehicle?.vehicleCategory
            rec.fuelConsumptionLitersPer100Km =
                newVehicle?.fuelConsumptionLitersPer100Km ?: ratesConfigPort.currentRates().defaultFuelConsumption
        }

        if (distanceChanged || dateChanged || vehicleChanged) {
            if (dateChanged || vehicleChanged) {
                val resolvedFuel = fuelPricePort.resolveFuelPrice(
                    rec.vehicleFuelType,
                    LocalDate.parse(businessDate(rec.startTime)),
                )
                rec.fuelPriceRonPerLiter = resolvedFuel.priceRonPerLiter
                rec.fuelPriceSource = resolvedFuel.source.name
            }
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
        return toMileageRecordOut(saved)
    }

    @Transactional
    fun deleteMileage(reportId: Int, mileageId: Int, actor: User) {
        requireEditableDraftReport(reportId, actor)

        val rec = mileageRecordRepository.findById(mileageId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Mileage record not found")
        }
        if (rec.report.id != reportId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Mileage record not in this report")
        }

        mileageRecordRepository.delete(rec)
    }

    @Transactional(readOnly = true)
    fun listVehicles(actor: User): List<UserVehicleOut> {
        val userId = requireActorId(actor)
        return userVehicleRepository.findAllByUserIdOrderByIsDefaultDescCreatedAtAsc(userId)
            .map(UserVehicleOut::from)
    }

    @Transactional
    fun createVehicle(body: UserVehicleCreate, actor: User): UserVehicleOut {
        val userId = requireActorId(actor)
        userVehicleRepository.acquireUserLock(userId)

        val plateNumber = normalizePlate(body.plateNumber)
            ?: throw badRequest("plate_number is required and must be at most $MAX_PLATE_LENGTH characters")
        val makeModel = normalizeMakeModel(body.makeModel)
        val fuelType = validateFuelType(body.fuelType)
        val normalizedConsumption = body.fuelConsumptionLitersPer100Km?.let(::validateAndNormalizeConsumption)
        val vehicleCategory = normalizeVehicleCategory(body.vehicleCategory, defaultWhenBlank = true)
            ?: throw badRequest("vehicle_category must be at most $MAX_VEHICLE_CATEGORY_LENGTH characters")
        val normalizedLastOdometer = body.lastOdometerKm?.let { validateAndNormalizeOdometerKm(it, "last_odometer_km") }

        val now = Instant.now()
        val hasExisting = userVehicleRepository.countByUserId(userId) > 0
        val shouldBeDefault = body.isDefault == true || !hasExisting

        if (shouldBeDefault && hasExisting) {
            userVehicleRepository.clearDefaultForUser(userId, now)
        }

        val userRef = userRepository.getReferenceById(userId)
        val saved = userVehicleRepository.saveAndFlush(
            UserVehicle(
                user = userRef,
                plateNumber = plateNumber,
                makeModel = makeModel,
                fuelType = fuelType,
                fuelConsumptionLitersPer100Km = normalizedConsumption,
                vehicleCategory = vehicleCategory,
                lastOdometerKm = normalizedLastOdometer,
                isDefault = shouldBeDefault,
                createdAt = now,
                updatedAt = now,
            )
        )
        return UserVehicleOut.from(saved)
    }

    @Transactional
    fun updateVehicle(vehicleId: Int, body: UserVehicleUpdate, actor: User): UserVehicleOut {
        val userId = requireActorId(actor)
        userVehicleRepository.acquireUserLock(userId)

        val normalizedPlate = if (body.plateNumber != null) {
            normalizePlate(body.plateNumber)
                ?: throw badRequest("plate_number must be non-blank and at most $MAX_PLATE_LENGTH characters")
        } else {
            null
        }
        val normalizedMakeModel = if (!body.clearMakeModel && body.makeModel != null) {
            normalizeMakeModel(body.makeModel)
        } else {
            null
        }
        val normalizedFuelType = if (!body.clearFuelType && body.fuelType != null) {
            validateFuelType(body.fuelType)
        } else {
            null
        }
        val normalizedConsumption = if (!body.clearFuelConsumption && body.fuelConsumptionLitersPer100Km != null) {
            validateAndNormalizeConsumption(body.fuelConsumptionLitersPer100Km)
        } else {
            null
        }
        val normalizedCategory = if (body.vehicleCategory != null) {
            normalizeVehicleCategory(body.vehicleCategory, defaultWhenBlank = false)
                ?: throw badRequest("vehicle_category must be non-blank and at most $MAX_VEHICLE_CATEGORY_LENGTH characters")
        } else {
            null
        }
        val normalizedLastOdometer = if (!body.clearLastOdometer && body.lastOdometerKm != null) {
            validateAndNormalizeOdometerKm(body.lastOdometerKm, "last_odometer_km")
        } else {
            null
        }

        val existing = resolveOwnedVehicle(vehicleId, userId)
        if (existing.isDefault && body.isDefault == false) {
            throw badRequest("Cannot unset default vehicle directly; set another vehicle as default instead")
        }

        val now = Instant.now()
        val vehicle = if (body.isDefault == true && !existing.isDefault) {
            // clearDefaultForUser uses clearAutomatically = true, so re-fetch the target entity after clearing
            userVehicleRepository.clearDefaultForUser(userId, now)
            resolveOwnedVehicle(vehicleId, userId)
        } else {
            existing
        }

        if (normalizedPlate != null) {
            vehicle.plateNumber = normalizedPlate
        }
        if (body.clearMakeModel) {
            vehicle.makeModel = null
        } else if (body.makeModel != null) {
            vehicle.makeModel = normalizedMakeModel
        }
        if (body.clearFuelType) {
            vehicle.fuelType = null
        } else if (body.fuelType != null) {
            vehicle.fuelType = normalizedFuelType
        }
        if (body.clearFuelConsumption) {
            vehicle.fuelConsumptionLitersPer100Km = null
        } else if (normalizedConsumption != null) {
            vehicle.fuelConsumptionLitersPer100Km = normalizedConsumption
        }
        if (normalizedCategory != null) {
            vehicle.vehicleCategory = normalizedCategory
        }
        if (body.clearLastOdometer) {
            vehicle.lastOdometerKm = null
        } else if (normalizedLastOdometer != null) {
            vehicle.lastOdometerKm = normalizedLastOdometer
        }
        if (body.isDefault != null) {
            vehicle.isDefault = body.isDefault
        }
        vehicle.updatedAt = now

        val saved = userVehicleRepository.saveAndFlush(vehicle)
        return UserVehicleOut.from(saved)
    }

    @Transactional
    fun deleteVehicle(vehicleId: Int, actor: User) {
        val userId = requireActorId(actor)
        userVehicleRepository.acquireUserLock(userId)

        val vehicle = resolveOwnedVehicle(vehicleId, userId)
        val wasDefault = vehicle.isDefault
        userVehicleRepository.delete(vehicle)
        userVehicleRepository.flush()

        if (wasDefault) {
            val remaining = userVehicleRepository.findAllByUserIdOrderByIsDefaultDescCreatedAtAsc(userId)
            remaining.firstOrNull()?.let { nextDefault ->
                nextDefault.isDefault = true
                nextDefault.updatedAt = Instant.now()
                userVehicleRepository.saveAndFlush(nextDefault)
            }
        }
    }

    fun validateAndNormalizeOdometerKm(value: BigDecimal, fieldName: String = "starting_odometer_km"): BigDecimal {
        val valid = value.compareTo(MIN_ODOMETER_KM) >= 0 &&
            value.compareTo(MAX_ODOMETER_KM) <= 0 &&
            value.stripTrailingZeros().scale() <= 1
        if (!valid) {
            throw badRequest("$fieldName must be between 0.0 and 9999999.9 with at most 1 decimal place")
        }
        return value.setScale(1, RoundingMode.HALF_UP)
    }

    @Transactional
    fun advancePrimaryVehicleOdometer(reportId: Int, startingOdometerKm: BigDecimal?) {
        if (startingOdometerKm == null) return
        val ownerId = expenseReportRepository.findById(reportId).orElse(null)?.user?.id ?: return
        userVehicleRepository.acquireUserLock(ownerId)
        val sortedRecords = mileageRecordRepository.findAllByReportId(reportId)
            .sortedWith(compareBy<MileageRecord>({ it.startTime }, { it.id ?: Int.MAX_VALUE }))
        val primaryVehicleId = sortedRecords.firstOrNull()?.vehicle?.id ?: return
        val totalPrimaryKm = sortedRecords
            .filter { it.vehicle?.id == primaryVehicleId }
            .fold(BigDecimal.ZERO) { acc, r -> acc.add(BigDecimal.valueOf(r.distanceKm)) }
        val endingOdometer = startingOdometerKm
            .add(totalPrimaryKm)
            .setScale(1, RoundingMode.HALF_UP)
        if (endingOdometer.compareTo(MAX_ODOMETER_KM) <= 0) {
            userVehicleRepository.advanceLastOdometerIfGreater(primaryVehicleId, endingOdometer, Instant.now())
        }
    }

    private fun requireActorId(actor: User): Int =
        actor.id ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

    private fun requireEditableDraftReport(reportId: Int, actor: User): ExpenseReport {
        val report = reportOwnership.verifyOwnership(reportId, actor)
        if (report.user?.id != actor.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the report owner can modify mileage records")
        }
        if (report.status != "draft") {
            throw badRequest("Only draft reports can be modified")
        }
        return report
    }

    private fun requireValidTimeRange(startTime: Instant, endTime: Instant) {
        if (endTime.isBefore(startTime) || endTime == startTime) {
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, "end_time must be after start_time")
        }
    }

    private fun resolveOwnedVehicle(vehicleId: Int, userId: Int): UserVehicle =
        userVehicleRepository.findByIdAndUserId(vehicleId, userId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found")

    private fun businessDate(startTime: Instant): String =
        startTime.atZone(ZoneOffset.UTC).toLocalDate().toString()

    private fun resolveFxRate(startTime: Instant): BigDecimal = try {
        fxRatePort.getRateToEur("EUR", businessDate(startTime))
    } catch (e: Exception) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
    }

    private fun resolveFuelExchangeRate(startTime: Instant): BigDecimal = try {
        val ronToEur = fxRatePort.getRateToEur("RON", businessDate(startTime))
        if (ronToEur <= BigDecimal.ZERO) throw IllegalArgumentException("RON FX rate must be positive")
        BigDecimal.ONE.divide(ronToEur, 12, RoundingMode.HALF_UP)
    } catch (e: Exception) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch RON exchange rate: ${e.message}")
    }

    private fun recalculate(rec: MileageRecord, distance: BigDecimal) {
        val fuelFx = resolveFuelExchangeRate(rec.startTime)
        val settings = MileageCalculationSettings(
            grossRate = rec.rateBeforeTax,
            fuelConsumption = rec.fuelConsumptionLitersPer100Km ?: return,
            fuelPriceRonPerLiter = rec.fuelPriceRonPerLiter ?: return,
            pensionRate = rec.pensionRate ?: return,
            healthRate = rec.healthRate ?: return,
            incomeTaxRate = rec.incomeTaxRate ?: return,
            deduction = rec.taxDeductionEur ?: return,
        )
        val calculation = calculator.calculate(distance, fuelFx, settings)
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

    private fun normalizePlate(raw: String?): String? {
        val normalized = raw?.trim()?.uppercase(Locale.ROOT) ?: return null
        if (normalized.isEmpty() || normalized.length > MAX_PLATE_LENGTH) return null
        return normalized
    }

    private fun normalizeMakeModel(raw: String?): String? {
        val trimmed = raw?.trim() ?: return null
        if (trimmed.length > MAX_MAKE_MODEL_LENGTH) {
            throw badRequest("make_model must be at most $MAX_MAKE_MODEL_LENGTH characters")
        }
        return trimmed.ifEmpty { null }
    }

    private fun validateFuelType(raw: String?): String? {
        val normalized = raw?.trim()?.lowercase(Locale.ROOT) ?: return null
        if (normalized.isEmpty()) return null
        if (normalized !in ALLOWED_FUEL_TYPES) {
            throw badRequest("Invalid fuel_type. Must be one of: $ALLOWED_FUEL_TYPES")
        }
        return normalized
    }

    private fun validateAndNormalizeConsumption(value: BigDecimal): BigDecimal {
        val valid = value.compareTo(MIN_CONSUMPTION) >= 0 &&
            value.compareTo(MAX_CONSUMPTION) <= 0 &&
            value.stripTrailingZeros().scale() <= 2
        if (!valid) {
            throw badRequest("fuel_consumption_l_per_100km must be between 0.01 and 50.00 with at most 2 decimal places")
        }
        return value.setScale(2, RoundingMode.HALF_UP)
    }

    private fun normalizeVehicleCategory(raw: String?, defaultWhenBlank: Boolean): String? {
        val normalized = raw?.trim()?.uppercase(Locale.ROOT)
        if (normalized.isNullOrEmpty()) {
            return if (defaultWhenBlank) DEFAULT_VEHICLE_CATEGORY else null
        }
        if (normalized.length > MAX_VEHICLE_CATEGORY_LENGTH) return null
        return normalized
    }

    private fun badRequest(detail: String): ResponseStatusException =
        ResponseStatusException(HttpStatus.BAD_REQUEST, detail)
}
