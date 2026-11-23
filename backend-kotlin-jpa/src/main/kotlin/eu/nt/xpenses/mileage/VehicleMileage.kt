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
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
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
    private val transactionManager: PlatformTransactionManager? = null,
) {
    companion object {
        private val ALLOWED_FUEL_TYPES = setOf("petrol", "diesel", "hybrid", "electric", "lpg")
        private val MIN_CONSUMPTION = BigDecimal("0.01")
        private val MAX_CONSUMPTION = BigDecimal("50.00")
        private val MIN_ODOMETER_KM = BigDecimal.ZERO
        private val MAX_ODOMETER_KM = BigDecimal("9999999.9")
        private const val MIN_DISTANCE_KM = 0.01
        private const val MAX_DISTANCE_KM = 100000.0
        private const val MAX_ROUTE_TEXT_LENGTH = 255
        private const val MAX_DESCRIPTION_LENGTH = 1000
        private val MIN_TRIP_TIMESTAMP: Instant = Instant.parse("2020-01-01T00:00:00Z")
        private const val DEFAULT_VEHICLE_CATEGORY = "M1"
        private const val MAX_PLATE_LENGTH = 32
        private const val MAX_MAKE_MODEL_LENGTH = 120
        private const val MAX_VEHICLE_CATEGORY_LENGTH = 16
        private const val SANITIZED_FX_ERROR = "Exchange rate service unavailable. Please try again."
        private val BUCHAREST_ZONE: ZoneId = ZoneId.of("Europe/Bucharest")
    }

    private data class CreatePhase1(
        val vehicleFuelType: String?,
        val vehicleConsumption: BigDecimal?,
    )

    private data class UpdatePhase1(
        val phase1Version: Int,
        val targetStartTime: Instant,
        val targetBusinessDate: String,
        val hasFuelFields: Boolean,
        val distanceChanged: Boolean,
        val dateChanged: Boolean,
        val vehicleChanged: Boolean,
        val targetFuelType: String?,
        val targetVehicleConsumption: BigDecimal?,
        val needsFuelPrice: Boolean,
        val needsModernFx: Boolean,
        val needsLegacyFx: Boolean,
    )

    private val log = LoggerFactory.getLogger(VehicleMileage::class.java)
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

    fun createMileage(reportId: Int, body: MileageRecordCreate, actor: User): MileageRecordOut {
        val actorId = requireActorId(actor)
        val normalizedOrigin = normalizeRequiredRouteText(body.origin, "origin")
        val normalizedDestination = normalizeRequiredRouteText(body.destination, "destination")
        val normalizedDescription = normalizeDescription(body.description)
        requireValidDistance(body.distanceKm)
        requireTimestampInWindow(body.startTime, "start_time")
        requireTimestampInWindow(body.endTime, "end_time")
        requireValidTimeRange(body.startTime, body.endTime)

        val phase1 = runReadTx {
            requireEditableDraftReport(reportId, actor)
            val vehicle = body.vehicleId?.let { resolveOwnedVehicle(it, actorId) }
            CreatePhase1(
                vehicleFuelType = vehicle?.fuelType,
                vehicleConsumption = vehicle?.fuelConsumptionLitersPer100Km,
            )
        }

        val targetBusinessDate = businessDate(body.startTime)
        val fxRate = resolveFuelExchangeRate(body.startTime, actorId, reportId, null)
        val resolvedFuel = fuelPricePort.resolveFuelPrice(
            phase1.vehicleFuelType,
            LocalDate.parse(targetBusinessDate),
        )

        return runWriteTx {
            userVehicleRepository.acquireUserLock(actorId)
            val report = requireLockedEditableDraftReport(reportId, actorId)
            val vehicle = body.vehicleId?.let { resolveOwnedVehicle(it, actorId) }
            if (vehicle?.fuelType != phase1.vehicleFuelType ||
                !sameDecimal(vehicle?.fuelConsumptionLitersPer100Km, phase1.vehicleConsumption)
            ) {
                throw OptimisticLockingFailureException("Vehicle changed during mileage creation")
            }

            val config = ratesConfigPort.currentRates()
            val distanceBd = BigDecimal.valueOf(body.distanceKm)
            val settings = MileageCalculationSettings(
                grossRate = config.grossRate,
                fuelConsumption = vehicle?.fuelConsumptionLitersPer100Km ?: config.defaultFuelConsumption,
                fuelPriceRonPerLiter = resolvedFuel.priceRonPerLiter,
                pensionRate = config.pensionRate,
                healthRate = config.healthRate,
                incomeTaxRate = config.incomeTaxRate,
                deduction = config.taxDeductionEur,
            )
            val now = Instant.now()
            val record = MileageRecord(
                report = report,
                user = actor,
                origin = normalizedOrigin,
                destination = normalizedDestination,
                distanceKm = body.distanceKm,
                rateBeforeTax = settings.grossRate,
                rateAfterTax = BigDecimal.ZERO,
                amountBeforeTax = BigDecimal.ZERO,
                amountEur = BigDecimal.ZERO,
                amountOriginal = BigDecimal.ZERO,
                currencyOriginal = "EUR",
                fxRate = BigDecimal.ONE,
                fuelConsumptionLitersPer100Km = settings.fuelConsumption,
                fuelPriceRonPerLiter = settings.fuelPriceRonPerLiter,
                fuelPriceSource = resolvedFuel.source.name,
                fuelExchangeRate = fxRate,
                pensionRate = settings.pensionRate,
                healthRate = settings.healthRate,
                incomeTaxRate = settings.incomeTaxRate,
                taxDeductionEur = settings.deduction,
                startTime = body.startTime,
                endTime = body.endTime,
                description = normalizedDescription,
                roundTrip = body.roundTrip,
                createdAt = now,
                updatedAt = now,
            )
            applyVehicleSnapshot(record, vehicle)
            applyModernCalculation(record, distanceBd, fxRate, settings)

            val saved = mileageRecordRepository.saveAndFlush(record)
            log.info(
                "mileage_created actorId={} reportId={} mileageId={} recalcPath=modern startTime={} businessDate={} distanceKm={} amountBeforeTax={} amountEur={} fuelPriceRonPerLiter={} fuelPriceSource={} fuelExchangeRate={} vehiclePlate={}",
                actorId,
                reportId,
                saved.id,
                saved.startTime,
                targetBusinessDate,
                saved.distanceKm,
                saved.amountBeforeTax,
                saved.amountEur,
                saved.fuelPriceRonPerLiter,
                saved.fuelPriceSource,
                saved.fuelExchangeRate,
                saved.vehiclePlate,
            )
            toMileageRecordOut(saved)
        }
    }

    fun updateMileage(reportId: Int, mileageId: Int, body: MileageRecordUpdate, actor: User): MileageRecordOut {
        val actorId = requireActorId(actor)
        if (body.clearVehicle && body.vehicleId != null) {
            throw badRequest("Cannot specify both vehicle_id and clear_vehicle")
        }
        val normalizedOrigin = body.origin?.let { normalizeRequiredRouteText(it, "origin") }
        val normalizedDestination = body.destination?.let { normalizeRequiredRouteText(it, "destination") }
        val hasDescriptionUpdate = body.description != null
        val normalizedDescription = if (hasDescriptionUpdate) normalizeDescription(body.description) else null
        body.distanceKm?.let(::requireValidDistance)
        body.startTime?.let { requireTimestampInWindow(it, "start_time") }
        body.endTime?.let { requireTimestampInWindow(it, "end_time") }

        val phase1 = runReadTx {
            requireEditableDraftReport(reportId, actor)
            val rec = loadMileageRecordInReport(mileageId, reportId)
            if (body.version != null && rec.version != body.version) {
                throw OptimisticLockingFailureException(
                    "Mileage record version mismatch: expected ${body.version}, actual ${rec.version}"
                )
            }

            val targetStartTime = body.startTime ?: rec.startTime
            val targetEndTime = body.endTime ?: rec.endTime
            requireValidTimeRange(targetStartTime, targetEndTime)

            val distanceChanged = body.distanceKm != null &&
                BigDecimal.valueOf(body.distanceKm).compareTo(BigDecimal.valueOf(rec.distanceKm)) != 0
            val targetBusinessDate = businessDate(targetStartTime)
            val dateChanged = targetBusinessDate != businessDate(rec.startTime)
            val vehicleChanged = (body.clearVehicle && hasVehicleOrSnapshot(rec)) ||
                (body.vehicleId != null && body.vehicleId != rec.vehicle?.id)

            val targetVehicle = if (vehicleChanged && !body.clearVehicle) {
                resolveOwnedVehicle(body.vehicleId!!, actorId)
            } else {
                null
            }
            val hasFuelFields = hasModernFuelFields(rec)
            val targetFuelType = if (vehicleChanged) targetVehicle?.fuelType else rec.vehicleFuelType
            val hasValidStoredFuelFx = rec.fuelExchangeRate != null && rec.fuelExchangeRate!! > BigDecimal.ZERO
            val anyPricingDelta = distanceChanged || dateChanged || vehicleChanged

            UpdatePhase1(
                phase1Version = rec.version,
                targetStartTime = targetStartTime,
                targetBusinessDate = targetBusinessDate,
                hasFuelFields = hasFuelFields,
                distanceChanged = distanceChanged,
                dateChanged = dateChanged,
                vehicleChanged = vehicleChanged,
                targetFuelType = targetFuelType,
                targetVehicleConsumption = targetVehicle?.fuelConsumptionLitersPer100Km,
                needsFuelPrice = hasFuelFields && (dateChanged || vehicleChanged),
                needsModernFx = hasFuelFields && anyPricingDelta && (dateChanged || !hasValidStoredFuelFx),
                needsLegacyFx = !hasFuelFields && dateChanged,
            )
        }

        val resolvedFuel = if (phase1.needsFuelPrice) {
            fuelPricePort.resolveFuelPrice(
                phase1.targetFuelType,
                LocalDate.parse(phase1.targetBusinessDate),
            )
        } else {
            null
        }
        val resolvedModernFx = if (phase1.needsModernFx) {
            resolveFuelExchangeRate(phase1.targetStartTime, actorId, reportId, mileageId)
        } else {
            null
        }
        val resolvedLegacyFx = if (phase1.needsLegacyFx) {
            resolveFxRate(phase1.targetStartTime, actorId, reportId, mileageId)
        } else {
            null
        }

        return runWriteTx {
            userVehicleRepository.acquireUserLock(actorId)
            requireLockedEditableDraftReport(reportId, actorId)
            val rec = loadMileageRecordInReport(mileageId, reportId)

            val expectedVersion = body.version ?: phase1.phase1Version
            if (rec.version != expectedVersion) {
                throw OptimisticLockingFailureException(
                    "Mileage record version mismatch: expected $expectedVersion, actual ${rec.version}"
                )
            }

            val beforeDistance = rec.distanceKm
            val beforeAmountBeforeTax = rec.amountBeforeTax
            val beforeAmountEur = rec.amountEur
            val beforeFuelPrice = rec.fuelPriceRonPerLiter
            val beforeFuelPriceSource = rec.fuelPriceSource
            val beforeFuelFx = rec.fuelExchangeRate
            val beforePlate = rec.vehiclePlate

            if (normalizedOrigin != null) rec.origin = normalizedOrigin
            if (normalizedDestination != null) rec.destination = normalizedDestination
            if (hasDescriptionUpdate) rec.description = normalizedDescription
            if (body.roundTrip != null) rec.roundTrip = body.roundTrip

            val previousBusinessDate = businessDate(rec.startTime)
            if (body.startTime != null) rec.startTime = body.startTime
            if (body.endTime != null) rec.endTime = body.endTime
            requireValidTimeRange(rec.startTime, rec.endTime)

            val currentBusinessDate = businessDate(rec.startTime)
            val distanceChanged = body.distanceKm != null &&
                BigDecimal.valueOf(body.distanceKm).compareTo(BigDecimal.valueOf(rec.distanceKm)) != 0
            val dateChanged = currentBusinessDate != previousBusinessDate
            val vehicleChanged = (body.clearVehicle && hasVehicleOrSnapshot(rec)) ||
                (body.vehicleId != null && body.vehicleId != rec.vehicle?.id)
            val hasFuelFields = hasModernFuelFields(rec)

            if (distanceChanged != phase1.distanceChanged ||
                dateChanged != phase1.dateChanged ||
                vehicleChanged != phase1.vehicleChanged ||
                hasFuelFields != phase1.hasFuelFields
            ) {
                throw OptimisticLockingFailureException("Mileage record state changed during update")
            }

            if (distanceChanged) {
                rec.distanceKm = body.distanceKm
            }

            if (vehicleChanged) {
                val newVehicle = if (body.clearVehicle) {
                    null
                } else {
                    resolveOwnedVehicle(body.vehicleId!!, actorId)
                }
                if (newVehicle?.fuelType != phase1.targetFuelType ||
                    !sameDecimal(newVehicle?.fuelConsumptionLitersPer100Km, phase1.targetVehicleConsumption)
                ) {
                    throw OptimisticLockingFailureException("Vehicle pricing inputs changed during mileage update")
                }
                applyVehicleSnapshot(rec, newVehicle)
                if (hasFuelFields) {
                    rec.fuelConsumptionLitersPer100Km =
                        newVehicle?.fuelConsumptionLitersPer100Km ?: ratesConfigPort.currentRates().defaultFuelConsumption
                }
            }

            var recalcPath = "none"
            if (distanceChanged || dateChanged || vehicleChanged) {
                if (hasFuelFields) {
                    recalcPath = "modern"
                    if (resolvedFuel != null) {
                        rec.fuelPriceRonPerLiter = resolvedFuel.priceRonPerLiter
                        rec.fuelPriceSource = resolvedFuel.source.name
                    }
                    val fuelFx = resolvedModernFx
                        ?: rec.fuelExchangeRate?.takeIf { it > BigDecimal.ZERO }
                        ?: throw OptimisticLockingFailureException("Missing fuel exchange rate during mileage update")
                    val settings = MileageCalculationSettings(
                        grossRate = rec.rateBeforeTax,
                        fuelConsumption = rec.fuelConsumptionLitersPer100Km!!,
                        fuelPriceRonPerLiter = rec.fuelPriceRonPerLiter!!,
                        pensionRate = rec.pensionRate!!,
                        healthRate = rec.healthRate!!,
                        incomeTaxRate = rec.incomeTaxRate!!,
                        deduction = rec.taxDeductionEur!!,
                    )
                    applyModernCalculation(rec, BigDecimal.valueOf(rec.distanceKm), fuelFx, settings)
                } else {
                    recalcPath = "legacy"
                    if (dateChanged) {
                        rec.fxRate = resolvedLegacyFx
                            ?: throw OptimisticLockingFailureException("Missing legacy FX rate during mileage update")
                    }
                    if (distanceChanged) {
                        val distanceBd = BigDecimal.valueOf(rec.distanceKm)
                        rec.amountBeforeTax = rec.rateBeforeTax.multiply(distanceBd).setScale(2, RoundingMode.HALF_UP)
                        rec.amountOriginal = rec.rateAfterTax.multiply(distanceBd).setScale(2, RoundingMode.HALF_UP)
                    }
                    if (distanceChanged || dateChanged) {
                        rec.amountEur = rec.amountOriginal.multiply(rec.fxRate).setScale(2, RoundingMode.HALF_UP)
                    }
                }
            }

            rec.updatedAt = Instant.now()
            val saved = mileageRecordRepository.saveAndFlush(rec)
            log.info(
                "mileage_updated actorId={} reportId={} mileageId={} distanceChanged={} dateChanged={} vehicleChanged={} recalcPath={} startTime={} businessDate={} distanceKm={}->{} amountBeforeTax={}->{} amountEur={}->{} fuelPriceRonPerLiter={}->{} fuelPriceSource={}->{} fuelExchangeRate={}->{} vehiclePlate={}->{}",
                actorId,
                reportId,
                saved.id,
                distanceChanged,
                dateChanged,
                vehicleChanged,
                recalcPath,
                saved.startTime,
                currentBusinessDate,
                beforeDistance,
                saved.distanceKm,
                beforeAmountBeforeTax,
                saved.amountBeforeTax,
                beforeAmountEur,
                saved.amountEur,
                beforeFuelPrice,
                saved.fuelPriceRonPerLiter,
                beforeFuelPriceSource,
                saved.fuelPriceSource,
                beforeFuelFx,
                saved.fuelExchangeRate,
                beforePlate,
                saved.vehiclePlate,
            )
            toMileageRecordOut(saved)
        }
    }

    @Transactional
    fun deleteMileage(reportId: Int, mileageId: Int, actor: User) {
        val actorId = requireActorId(actor)
        userVehicleRepository.acquireUserLock(actorId)
        requireLockedEditableDraftReport(reportId, actorId)

        val rec = loadMileageRecordInReport(mileageId, reportId)
        val deletedDistance = rec.distanceKm
        val deletedAmountBeforeTax = rec.amountBeforeTax
        val deletedAmountEur = rec.amountEur
        val deletedStartTime = rec.startTime
        val deletedPlate = rec.vehiclePlate
        mileageRecordRepository.delete(rec)
        log.info(
            "mileage_deleted actorId={} reportId={} mileageId={} startTime={} businessDate={} distanceKm={} amountBeforeTax={} amountEur={} vehiclePlate={}",
            actorId,
            reportId,
            mileageId,
            deletedStartTime,
            businessDate(deletedStartTime),
            deletedDistance,
            deletedAmountBeforeTax,
            deletedAmountEur,
            deletedPlate,
        )
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
        if (startingOdometerKm == null) {
            log.info("odometer_advance_skipped reportId={} reason=no_starting_odometer", reportId)
            return
        }
        val ownerId = expenseReportRepository.findById(reportId).orElse(null)?.user?.id
        if (ownerId == null) {
            log.info("odometer_advance_skipped reportId={} reason=report_not_found", reportId)
            return
        }
        userVehicleRepository.acquireUserLock(ownerId)
        val sortedRecords = mileageRecordRepository.findAllByReportId(reportId)
            .sortedWith(compareBy<MileageRecord>({ it.startTime }, { it.id ?: Int.MAX_VALUE }))
        val primaryVehicleId = sortedRecords.firstOrNull()?.vehicle?.id
        if (primaryVehicleId == null) {
            log.info("odometer_advance_skipped reportId={} reason=primary_trip_has_no_live_vehicle", reportId)
            return
        }
        val totalPrimaryKm = sortedRecords
            .filter { it.vehicle?.id == primaryVehicleId }
            .fold(BigDecimal.ZERO) { acc, r -> acc.add(BigDecimal.valueOf(r.distanceKm)) }
        val endingOdometer = startingOdometerKm
            .add(totalPrimaryKm)
            .setScale(1, RoundingMode.HALF_UP)
        if (endingOdometer.compareTo(MAX_ODOMETER_KM) <= 0) {
            userVehicleRepository.advanceLastOdometerIfGreater(primaryVehicleId, endingOdometer, Instant.now())
            log.info(
                "odometer_advanced reportId={} primaryVehicleId={} endingOdometer={}",
                reportId,
                primaryVehicleId,
                endingOdometer,
            )
        } else {
            log.warn(
                "odometer_advance_skipped reportId={} primaryVehicleId={} endingOdometer={} reason=exceeds_max_odometer",
                reportId,
                primaryVehicleId,
                endingOdometer,
            )
        }
    }

    private fun <T> runReadTx(block: () -> T): T {
        val tm = transactionManager ?: return block()
        val template = TransactionTemplate(tm).apply { isReadOnly = true }
        return template.execute { block() }
    }

    private fun <T> runWriteTx(block: () -> T): T {
        val tm = transactionManager ?: return block()
        val template = TransactionTemplate(tm)
        return template.execute { block() }
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

    private fun requireLockedEditableDraftReport(reportId: Int, actorId: Int): ExpenseReport {
        val report = expenseReportRepository.findByIdForUpdate(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }
        if (report.user?.id != actorId) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the report owner can modify mileage records")
        }
        if (report.status != "draft") {
            throw badRequest("Only draft reports can be modified")
        }
        return report
    }

    private fun loadMileageRecordInReport(mileageId: Int, reportId: Int): MileageRecord {
        val rec = mileageRecordRepository.findById(mileageId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Mileage record not found")
        }
        if (rec.report.id != reportId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Mileage record not in this report")
        }
        return rec
    }

    private fun normalizeRequiredRouteText(raw: String, fieldName: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) {
            throw badRequest("$fieldName must not be blank")
        }
        if (trimmed.length > MAX_ROUTE_TEXT_LENGTH) {
            throw badRequest("$fieldName must be at most $MAX_ROUTE_TEXT_LENGTH characters")
        }
        return trimmed
    }

    private fun normalizeDescription(raw: String?): String? {
        if (raw == null) return null
        val trimmed = raw.trim()
        if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
            throw badRequest("description must be at most $MAX_DESCRIPTION_LENGTH characters")
        }
        return trimmed.ifEmpty { null }
    }

    private fun requireValidDistance(distanceKm: Double) {
        if (!distanceKm.isFinite() || distanceKm < MIN_DISTANCE_KM || distanceKm > MAX_DISTANCE_KM) {
            throw badRequest("distance_km must be between $MIN_DISTANCE_KM and $MAX_DISTANCE_KM")
        }
    }

    private fun requireTimestampInWindow(timestamp: Instant, fieldName: String) {
        val maxAllowed = ZonedDateTime.now(ZoneOffset.UTC).plusYears(1).toInstant()
        if (timestamp.isBefore(MIN_TRIP_TIMESTAMP) || timestamp.isAfter(maxAllowed)) {
            throw badRequest("$fieldName must be between 2020-01-01 and 1 year from now")
        }
    }

    private fun requireValidTimeRange(startTime: Instant, endTime: Instant) {
        if (endTime.isBefore(startTime) || endTime == startTime) {
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, "end_time must be after start_time")
        }
    }

    private fun resolveOwnedVehicle(vehicleId: Int, userId: Int): UserVehicle =
        userVehicleRepository.findByIdAndUserId(vehicleId, userId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found")

    private fun hasVehicleOrSnapshot(rec: MileageRecord): Boolean =
        rec.vehicle != null ||
            rec.vehiclePlate != null ||
            rec.vehicleMakeModel != null ||
            rec.vehicleFuelType != null ||
            rec.vehicleCategory != null

    private fun hasModernFuelFields(rec: MileageRecord): Boolean =
        rec.fuelConsumptionLitersPer100Km != null &&
            rec.fuelPriceRonPerLiter != null &&
            rec.pensionRate != null &&
            rec.healthRate != null &&
            rec.incomeTaxRate != null &&
            rec.taxDeductionEur != null

    private fun applyVehicleSnapshot(rec: MileageRecord, vehicle: UserVehicle?) {
        rec.vehicle = vehicle
        rec.vehiclePlate = vehicle?.plateNumber
        rec.vehicleMakeModel = vehicle?.makeModel
        rec.vehicleFuelType = vehicle?.fuelType
        rec.vehicleCategory = vehicle?.vehicleCategory
    }

    private fun applyModernCalculation(
        rec: MileageRecord,
        distance: BigDecimal,
        fuelFx: BigDecimal,
        settings: MileageCalculationSettings,
    ) {
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

    private fun sameDecimal(a: BigDecimal?, b: BigDecimal?): Boolean =
        if (a == null && b == null) true
        else if (a == null || b == null) false
        else a.compareTo(b) == 0

    private fun businessDate(startTime: Instant): String =
        startTime.atZone(ZoneOffset.UTC).toLocalDate().toString()

    private fun resolveFxRate(startTime: Instant, actorId: Int, reportId: Int, mileageId: Int?): BigDecimal {
        val date = businessDate(startTime)
        return try {
            fxRatePort.getRateToEur("EUR", date)
        } catch (e: Exception) {
            log.warn(
                "FX rate lookup failed actorId={} reportId={} mileageId={} businessDate={}",
                actorId,
                reportId,
                mileageId,
                date,
                e,
            )
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, SANITIZED_FX_ERROR)
        }
    }

    private fun resolveFuelExchangeRate(startTime: Instant, actorId: Int, reportId: Int, mileageId: Int?): BigDecimal {
        val date = businessDate(startTime)
        return try {
            val ronToEur = fxRatePort.getRateToEur("RON", date)
            if (ronToEur <= BigDecimal.ZERO) throw IllegalArgumentException("RON FX rate must be positive")
            BigDecimal.ONE.divide(ronToEur, 12, RoundingMode.HALF_UP)
        } catch (e: Exception) {
            log.warn(
                "RON fuel exchange rate lookup failed actorId={} reportId={} mileageId={} businessDate={}",
                actorId,
                reportId,
                mileageId,
                date,
                e,
            )
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, SANITIZED_FX_ERROR)
        }
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
