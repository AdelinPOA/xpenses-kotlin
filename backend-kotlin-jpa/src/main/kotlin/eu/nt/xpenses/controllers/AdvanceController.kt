package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.FxService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

@RestController
class AdvanceController(
    private val advancePaymentRepository: AdvancePaymentRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val userRepository: UserRepository,
    private val fxService: FxService
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

    @GetMapping("/api/reports/{reportId}/advances")
    fun listAdvances(
        @PathVariable reportId: Int,
        @RequestParam(value = "status", required = false) status: String?,
        request: HttpServletRequest
    ): List<AdvancePaymentOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        verifyReportOwnership(reportId, currentUser)

        val advances = if (status != null) {
            advancePaymentRepository.findAllByReportId(reportId).filter { it.status == status }
        } else {
            advancePaymentRepository.findAllByReportId(reportId)
        }

        return advances.sortedBy { it.date }.map { mapAdvanceToOut(it) }
    }

    @PostMapping("/api/reports/{reportId}/advances")
    fun createAdvance(
        @PathVariable reportId: Int,
        @RequestBody body: AdvancePaymentCreate,
        request: HttpServletRequest
    ): ResponseEntity<AdvancePaymentOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = verifyReportOwnership(reportId, currentUser)
        val isOwner = report.user?.id == currentUser.id
        val isPrivileged = currentUser.role in listOf("manager", "chef_finance", "mod")

        val now = Instant.now()

        if (body.type == "request") {
            if (!isOwner) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the report owner can request advances")
            }
            val advance = AdvancePayment(
                report = report,
                user = currentUser,
                amountOriginal = 0.0,
                currencyOriginal = body.currency.uppercase(),
                amountEur = 0.0,
                fxRate = 0.0,
                date = "",
                description = body.description,
                status = "requested",
                requestedAmount = body.amount,
                requestedCurrency = body.currency.uppercase(),
                createdAt = now,
                updatedAt = now
            )
            val saved = advancePaymentRepository.save(advance)
            return ResponseEntity.status(HttpStatus.CREATED).body(mapAdvanceToOut(saved))
        }

        // type == "paid"
        if (isOwner && report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Technicians can only add self-paid advances to draft reports")
        }
        if (!isOwner && !isPrivileged) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }
        if (body.date.isNullOrEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Date is required for paid advances")
        }

        val fxRate = try {
            fxService.getRate(body.currency, body.date)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
        }

        val amountEur = BigDecimal(body.amount * fxRate).setScale(2, RoundingMode.HALF_UP).toDouble()

        val advance = AdvancePayment(
            report = report,
            user = if (isOwner) currentUser else report.user!!,
            amountOriginal = body.amount,
            currencyOriginal = body.currency.uppercase(),
            amountEur = amountEur,
            fxRate = fxRate,
            date = body.date,
            description = body.description,
            status = "paid",
            paidBy = if (isPrivileged) currentUser else null,
            paidAt = if (isPrivileged) now else null,
            createdAt = now,
            updatedAt = now
        )

        val saved = advancePaymentRepository.save(advance)
        return ResponseEntity.status(HttpStatus.CREATED).body(mapAdvanceToOut(saved))
    }

    @PatchMapping("/api/reports/{reportId}/advances/{advanceId}")
    fun updateAdvance(
        @PathVariable reportId: Int,
        @PathVariable advanceId: Int,
        @RequestBody body: AdvancePaymentUpdate,
        request: HttpServletRequest
    ): AdvancePaymentOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = verifyReportOwnership(reportId, currentUser)
        val isPrivileged = currentUser.role in listOf("manager", "chef_finance", "mod")
        if (!isPrivileged && report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the report owner can modify advance payments")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft reports can be modified")
        }

        val adv = advancePaymentRepository.findById(advanceId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Advance payment not found")
        }

        if (adv.report.id != reportId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Advance payment not in this report")
        }

        val needFxRecalc = body.amount != null || body.currency != null || body.date != null
        if (needFxRecalc) {
            val effAmount = body.amount ?: adv.amountOriginal
            val effCurrency = (body.currency ?: adv.currencyOriginal).uppercase()
            val effDate = body.date ?: adv.date
            
            if (effDate.isEmpty()) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Date is required for paid advances")
            }

            val fxRate = try {
                fxService.getRate(effCurrency, effDate)
            } catch (e: Exception) {
                throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
            }

            adv.amountOriginal = effAmount
            adv.currencyOriginal = effCurrency
            adv.fxRate = fxRate
            adv.amountEur = BigDecimal(effAmount * fxRate).setScale(2, RoundingMode.HALF_UP).toDouble()
        }

        if (body.date != null) adv.date = body.date
        if (body.description != null) adv.description = body.description

        adv.updatedAt = Instant.now()
        val saved = advancePaymentRepository.save(adv)
        return mapAdvanceToOut(saved)
    }

    @DeleteMapping("/api/reports/{reportId}/advances/{advanceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteAdvance(
        @PathVariable reportId: Int,
        @PathVariable advanceId: Int,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val report = verifyReportOwnership(reportId, currentUser)
        val adv = advancePaymentRepository.findById(advanceId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Advance payment not found")
        }

        if (adv.report.id != reportId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Advance payment not in this report")
        }

        val isOwner = report.user?.id == currentUser.id
        val isPrivileged = currentUser.role in listOf("manager", "chef_finance", "mod")

        if (adv.status == "requested") {
            if (!isOwner) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the request owner can cancel")
            }
        } else if (adv.status == "paid") {
            if (report.status != "draft") {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Can only delete paid advances on draft reports")
            }
            if (!isOwner && !isPrivileged) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
            }
        } else if (adv.status == "rejected") {
            if (!isOwner) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can delete rejected advances")
            }
        }

        advancePaymentRepository.delete(adv)
    }

    @PostMapping("/api/reports/{reportId}/advances/{advanceId}/pay")
    fun payAdvance(
        @PathVariable reportId: Int,
        @PathVariable advanceId: Int,
        @RequestBody body: AdvancePayBody,
        request: HttpServletRequest
    ): AdvancePaymentOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (currentUser.role !in listOf("manager", "chef_finance")) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        verifyReportOwnership(reportId, currentUser)

        val adv = advancePaymentRepository.findById(advanceId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Advance payment not found")
        }

        if (adv.report.id != reportId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Advance payment not in this report")
        }

        if (adv.status != "requested") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only requested advances can be paid")
        }

        val fxRate = try {
            fxService.getRate(body.currency, body.date)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
        }

        val amountEur = BigDecimal(body.amount * fxRate).setScale(2, RoundingMode.HALF_UP).toDouble()
        val now = Instant.now()

        adv.amountOriginal = body.amount
        adv.currencyOriginal = body.currency.uppercase()
        adv.amountEur = amountEur
        adv.fxRate = fxRate
        adv.date = body.date
        adv.status = "paid"
        adv.paidBy = currentUser
        adv.paidAt = now
        adv.updatedAt = now

        val saved = advancePaymentRepository.save(adv)
        return mapAdvanceToOut(saved)
    }

    @PostMapping("/api/reports/{reportId}/advances/{advanceId}/reject")
    fun rejectAdvance(
        @PathVariable reportId: Int,
        @PathVariable advanceId: Int,
        @RequestBody(required = false) body: AdvanceRejectBody?,
        request: HttpServletRequest
    ): AdvancePaymentOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (currentUser.role !in listOf("manager", "chef_finance")) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        verifyReportOwnership(reportId, currentUser)

        val adv = advancePaymentRepository.findById(advanceId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Advance payment not found")
        }

        if (adv.report.id != reportId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Advance payment not in this report")
        }

        if (adv.status != "requested") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only requested advances can be rejected")
        }

        val reason = body?.reason ?: ""
        val now = Instant.now()

        adv.status = "rejected"
        adv.rejectedBy = currentUser
        adv.rejectedAt = now
        adv.updatedAt = now
        if (reason.isNotEmpty()) {
            adv.description = if (adv.description.isNullOrEmpty()) {
                "[Rejected: $reason]"
            } else {
                "${adv.description} [Rejected: $reason]"
            }
        }

        val saved = advancePaymentRepository.save(adv)
        return mapAdvanceToOut(saved)
    }

    @GetMapping("/api/advances/pending")
    fun listPendingAdvances(request: HttpServletRequest): List<PendingAdvanceOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (currentUser.role !in listOf("manager", "chef_finance", "mod")) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden")
        }

        val pending = advancePaymentRepository.findAllByStatus("requested")
        return pending.map { mapAdvanceToPendingOut(it) }
    }

    private fun mapAdvanceToOut(adv: AdvancePayment): AdvancePaymentOut {
        return AdvancePaymentOut(
            id = adv.id!!,
            reportId = adv.report.id!!,
            userId = adv.user.id!!,
            status = adv.status,
            amountOriginal = adv.amountOriginal,
            currencyOriginal = adv.currencyOriginal,
            amountEur = adv.amountEur,
            fxRate = adv.fxRate,
            date = adv.date,
            description = adv.description,
            requestedAmount = adv.requestedAmount,
            requestedCurrency = adv.requestedCurrency,
            paidBy = adv.paidBy?.id,
            paidByName = adv.paidBy?.displayName,
            paidAt = adv.paidAt,
            rejectedBy = adv.rejectedBy?.id,
            rejectedByName = adv.rejectedBy?.displayName,
            rejectedAt = adv.rejectedAt,
            createdAt = adv.createdAt,
            updatedAt = adv.updatedAt
        )
    }

    private fun mapAdvanceToPendingOut(adv: AdvancePayment): PendingAdvanceOut {
        return PendingAdvanceOut(
            id = adv.id!!,
            reportId = adv.report.id!!,
            userId = adv.user.id!!,
            status = adv.status,
            amountOriginal = adv.amountOriginal,
            currencyOriginal = adv.currencyOriginal,
            amountEur = adv.amountEur,
            fxRate = adv.fxRate,
            date = adv.date,
            description = adv.description,
            requestedAmount = adv.requestedAmount,
            requestedCurrency = adv.requestedCurrency,
            paidBy = adv.paidBy?.id,
            paidByName = adv.paidBy?.displayName,
            paidAt = adv.paidAt,
            rejectedBy = adv.rejectedBy?.id,
            rejectedByName = adv.rejectedBy?.displayName,
            rejectedAt = adv.rejectedAt,
            createdAt = adv.createdAt,
            updatedAt = adv.updatedAt,
            userDisplayName = adv.user.displayName,
            reportTitle = adv.report.title
        )
    }
}

data class AdvancePaymentCreate(
    val type: String = "paid",
    val amount: Double,
    val currency: String = "EUR",
    val date: String? = null,
    val description: String? = null
)

data class AdvancePaymentUpdate(
    val amount: Double? = null,
    val currency: String? = null,
    val date: String? = null,
    val description: String? = null
)

data class AdvancePayBody(
    val amount: Double,
    val currency: String = "EUR",
    val date: String
)

data class AdvanceRejectBody(
    val reason: String = ""
)

data class AdvancePaymentOut(
    val id: Int,
    @JsonProperty("report_id") val reportId: Int,
    @JsonProperty("user_id") val userId: Int,
    val status: String,
    @JsonProperty("amount_original") val amountOriginal: Double,
    @JsonProperty("currency_original") val currencyOriginal: String,
    @JsonProperty("amount_eur") val amountEur: Double,
    @JsonProperty("fx_rate") val fxRate: Double,
    val date: String,
    val description: String?,
    @JsonProperty("requested_amount") val requestedAmount: Double?,
    @JsonProperty("requested_currency") val requestedCurrency: String?,
    @JsonProperty("paid_by") val paidBy: Int?,
    @JsonProperty("paid_by_name") val paidByName: String?,
    @JsonProperty("paid_at") val paidAt: Instant?,
    @JsonProperty("rejected_by") val rejectedBy: Int?,
    @JsonProperty("rejected_by_name") val rejectedByName: String?,
    @JsonProperty("rejected_at") val rejectedAt: Instant?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant
)

data class PendingAdvanceOut(
    val id: Int,
    @JsonProperty("report_id") val reportId: Int,
    @JsonProperty("user_id") val userId: Int,
    val status: String,
    @JsonProperty("amount_original") val amountOriginal: Double,
    @JsonProperty("currency_original") val currencyOriginal: String,
    @JsonProperty("amount_eur") val amountEur: Double,
    @JsonProperty("fx_rate") val fxRate: Double,
    val date: String,
    val description: String?,
    @JsonProperty("requested_amount") val requestedAmount: Double?,
    @JsonProperty("requested_currency") val requestedCurrency: String?,
    @JsonProperty("paid_by") val paidBy: Int?,
    @JsonProperty("paid_by_name") val paidByName: String?,
    @JsonProperty("paid_at") val paidAt: Instant?,
    @JsonProperty("rejected_by") val rejectedBy: Int?,
    @JsonProperty("rejected_by_name") val rejectedByName: String?,
    @JsonProperty("rejected_at") val rejectedAt: Instant?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant,
    @JsonProperty("user_display_name") val userDisplayName: String,
    @JsonProperty("report_title") val reportTitle: String
)
