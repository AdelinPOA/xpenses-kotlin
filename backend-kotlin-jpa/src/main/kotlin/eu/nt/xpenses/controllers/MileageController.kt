package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.report.MileageRecordCreate
import eu.nt.xpenses.dto.report.MileageRecordOut
import eu.nt.xpenses.dto.report.MileageRecordUpdate
import eu.nt.xpenses.model.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.FxService
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

@RestController
@RequestMapping("/api/reports/{reportId}/mileage")
class MileageController(
    private val mileageRecordRepository: MileageRecordRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val appSettingRepository: AppSettingRepository,
    private val reportOwnership: ReportOwnership,
    private val fxService: FxService
) {

    private fun getMileageRates(): Pair<BigDecimal, BigDecimal> {
        val rateBt = appSettingRepository.findById("mileage_rate_before_tax").orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal("0.60")
        val rateAt = appSettingRepository.findById("mileage_rate_after_tax").orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal("0.40")
        return Pair(rateBt, rateAt)
    }

    @GetMapping
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
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "end_time must be after start_time")
        }

        val (rateBt, rateAt) = getMileageRates()
        val distanceBd = BigDecimal.valueOf(body.distanceKm)
        val amountBeforeTax = distanceBd.multiply(rateBt).setScale(2, RoundingMode.HALF_UP)
        val amountOriginal = distanceBd.multiply(rateAt).setScale(2, RoundingMode.HALF_UP)
        val fxRate = resolveFxRate(body.startTime)
        val amountEur = amountOriginal.multiply(fxRate).setScale(2, RoundingMode.HALF_UP)

        val record = MileageRecord(
            report = report,
            user = currentUser,
            origin = body.origin,
            destination = body.destination,
            distanceKm = body.distanceKm,
            rateBeforeTax = rateBt,
            rateAfterTax = rateAt,
            amountBeforeTax = amountBeforeTax,
            amountEur = amountEur,
            amountOriginal = amountOriginal,
            currencyOriginal = "EUR",
            fxRate = fxRate,
            startTime = body.startTime,
            endTime = body.endTime,
            description = body.description,
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

        val previousBusinessDate = businessDate(rec.startTime)
        if (body.startTime != null) rec.startTime = body.startTime
        if (body.endTime != null) rec.endTime = body.endTime

        if (rec.endTime.isBefore(rec.startTime) || rec.endTime == rec.startTime) {
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "end_time must be after start_time")
        }

        if (body.distanceKm != null) {
            rec.distanceKm = body.distanceKm
            val distanceBd = BigDecimal.valueOf(body.distanceKm)
            rec.amountBeforeTax = distanceBd.multiply(rec.rateBeforeTax).setScale(2, RoundingMode.HALF_UP)
            rec.amountOriginal = distanceBd.multiply(rec.rateAfterTax).setScale(2, RoundingMode.HALF_UP)
            rec.amountEur = rec.amountOriginal.multiply(rec.fxRate).setScale(2, RoundingMode.HALF_UP)
        }

        if (businessDate(rec.startTime) != previousBusinessDate) {
            rec.fxRate = resolveFxRate(rec.startTime)
            rec.amountEur = rec.amountOriginal.multiply(rec.fxRate).setScale(2, RoundingMode.HALF_UP)
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
            currencyOriginal = m.currencyOriginal,
            fxRate = m.fxRate,
            startTime = m.startTime,
            endTime = m.endTime,
            description = m.description,
            createdAt = m.createdAt,
            updatedAt = m.updatedAt,
            durationMinutes = durationMins
        )
    }

    private fun businessDate(startTime: Instant): String =
        startTime.atZone(ZoneOffset.UTC).toLocalDate().toString()

    private fun resolveFxRate(startTime: Instant): BigDecimal = try {
        fxService.getRate("EUR", businessDate(startTime))
    } catch (e: Exception) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
    }
}
