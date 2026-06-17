package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.*
import eu.nt.xpenses.repositories.*
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant

@RestController
@RequestMapping("/api/reports/{reportId}/mileage")
class MileageController(
    private val mileageRecordRepository: MileageRecordRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val appSettingRepository: AppSettingRepository
) {

    private fun verifyReportOwnership(reportId: Int, currentUser: User): ExpenseReport {
        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }
        if (report.user?.id != currentUser.id && currentUser.role !in listOf("chef_finance", "mod", "manager")) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your report")
        }
        return report
    }

    private fun getMileageRates(): Pair<Double, Double> {
        val rateBt = appSettingRepository.findById("mileage_rate_before_tax").orElse(null)?.value?.toDoubleOrNull() ?: 0.60
        val rateAt = appSettingRepository.findById("mileage_rate_after_tax").orElse(null)?.value?.toDoubleOrNull() ?: 0.40
        return Pair(rateBt, rateAt)
    }

    @GetMapping
    fun listMileage(
        @PathVariable reportId: Int,
        request: HttpServletRequest
    ): List<MileageRecordOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        verifyReportOwnership(reportId, currentUser)

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

        val report = verifyReportOwnership(reportId, currentUser)
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
        val amountBeforeTax = BigDecimal.valueOf(body.distanceKm).multiply(BigDecimal.valueOf(rateBt)).setScale(2, RoundingMode.HALF_UP).toDouble()
        val amountEur = BigDecimal.valueOf(body.distanceKm).multiply(BigDecimal.valueOf(rateAt)).setScale(2, RoundingMode.HALF_UP).toDouble()

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

        val report = verifyReportOwnership(reportId, currentUser)
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

        if (body.startTime != null) rec.startTime = body.startTime
        if (body.endTime != null) rec.endTime = body.endTime

        if (rec.endTime.isBefore(rec.startTime) || rec.endTime == rec.startTime) {
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "end_time must be after start_time")
        }

        if (body.distanceKm != null) {
            rec.distanceKm = body.distanceKm
            rec.amountBeforeTax = BigDecimal.valueOf(body.distanceKm).multiply(BigDecimal.valueOf(rec.rateBeforeTax)).setScale(2, RoundingMode.HALF_UP).toDouble()
            rec.amountEur = BigDecimal.valueOf(body.distanceKm).multiply(BigDecimal.valueOf(rec.rateAfterTax)).setScale(2, RoundingMode.HALF_UP).toDouble()
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

        val report = verifyReportOwnership(reportId, currentUser)
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
            id = m.id!!,
            reportId = m.report.id!!,
            userId = m.user.id!!,
            origin = m.origin,
            destination = m.destination,
            distanceKm = m.distanceKm,
            rateBeforeTax = m.rateBeforeTax,
            rateAfterTax = m.rateAfterTax,
            amountBeforeTax = m.amountBeforeTax,
            amountEur = m.amountEur,
            startTime = m.startTime,
            endTime = m.endTime,
            description = m.description,
            createdAt = m.createdAt,
            updatedAt = m.updatedAt,
            durationMinutes = durationMins
        )
    }
}

data class MileageRecordCreate(
    @field:NotBlank val origin: String,
    @field:NotBlank val destination: String,
    @JsonProperty("distance_km") @field:Min(0) val distanceKm: Double,
    @JsonProperty("start_time") val startTime: Instant,
    @JsonProperty("end_time") val endTime: Instant,
    val description: String? = null
)

data class MileageRecordUpdate(
    val origin: String? = null,
    val destination: String? = null,
    @JsonProperty("distance_km") @field:Min(0) val distanceKm: Double? = null,
    @JsonProperty("start_time") val startTime: Instant? = null,
    @JsonProperty("end_time") val endTime: Instant? = null,
    val description: String? = null
)

data class MileageRecordOut(
    val id: Int,
    @JsonProperty("report_id") val reportId: Int,
    @JsonProperty("user_id") val userId: Int,
    val origin: String,
    val destination: String,
    @JsonProperty("distance_km") val distanceKm: Double,
    @JsonProperty("rate_before_tax") val rateBeforeTax: Double,
    @JsonProperty("rate_after_tax") val rateAfterTax: Double,
    @JsonProperty("amount_before_tax") val amountBeforeTax: Double,
    @JsonProperty("amount_eur") val amountEur: Double,
    @JsonProperty("start_time") val startTime: Instant,
    @JsonProperty("end_time") val endTime: Instant,
    val description: String?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant,
    @JsonProperty("duration_minutes") val durationMinutes: Double
)
