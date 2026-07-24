package eu.nt.xpenses.services.mapper

import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.report.AdvancePaymentOut
import eu.nt.xpenses.dto.report.MileageRecordOut
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.model.AdvancePayment
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.MileageRecord
import eu.nt.xpenses.repositories.AppSettingRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Duration

@Component
class ReportMapper(
    private val expenseMapper: ExpenseMapper,
    private val appSettingRepository: AppSettingRepository
) {
    private val log = LoggerFactory.getLogger(ReportMapper::class.java)

    fun mapAdvanceToOut(adv: AdvancePayment): AdvancePaymentOut {
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

    fun mapRecordToOut(m: MileageRecord): MileageRecordOut {
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

    fun getDailyAllowanceRate(): BigDecimal =
        appSettingRepository.findById("daily_allowance_rate").orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal("50.00")

    fun calculateDailyAllowance(dateFrom: String?, dateTo: String?): BigDecimal {
        if (dateFrom.isNullOrEmpty() || dateTo.isNullOrEmpty()) return BigDecimal.ZERO
        return try {
            val formatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
            val dFrom = java.time.LocalDate.parse(dateFrom.take(10), formatter)
            val dTo = java.time.LocalDate.parse(dateTo.take(10), formatter)
            val days = java.time.Duration.between(dFrom.atStartOfDay(), dTo.atStartOfDay()).toDays() + 1

            val rate = appSettingRepository.findById("daily_allowance_rate").orElse(null)?.value?.let { BigDecimal(it) } ?: BigDecimal("50.00")
            if (days > 0) rate.multiply(BigDecimal.valueOf(days)) else BigDecimal.ZERO
        } catch (e: Exception) {
            log.warn("Exception in calculateDailyAllowance: {}", e.message)
            BigDecimal.ZERO
        }
    }

    fun mapReportToOut(report: ExpenseReport): ReportOut {
        val expensesOut = report.expenses.sortedBy { it.date }.map { expenseMapper.toExpenseOut(it) }
        val advancesOut = report.advances.sortedBy { it.date }.map { mapAdvanceToOut(it) }
        val mileageOut = report.mileageRecords.sortedBy { it.startTime }.map { mapRecordToOut(it) }

        val totalExpenses = expensesOut.map { it.amountEur }.fold(BigDecimal.ZERO) { acc, v -> acc.add(v) }
        val totalAdvances = advancesOut.filter { it.status == "paid" }.map { it.amountEur }.fold(BigDecimal.ZERO) { acc, v -> acc.add(v) }
        val totalMileage = mileageOut.map { it.amountEur }.fold(BigDecimal.ZERO) { acc, v -> acc.add(v) }
        val allowance = calculateDailyAllowance(report.dateFrom, report.dateTo)
        val totalReimbursable = totalExpenses.add(allowance).add(totalMileage).subtract(totalAdvances)

        return ReportOut(
            id = report.id!!,
            userId = report.user?.id,
            userDisplayName = report.user?.displayName,
            title = report.title,
            description = report.description,
            dateFrom = report.dateFrom,
            dateTo = report.dateTo,
            status = report.status,
            submittedAt = report.submittedAt,
            paidAt = report.paidAt,
            approvedBy = report.approvedBy?.id,
            approvedAt = report.approvedAt,
            rejectedBy = report.rejectedBy?.id,
            rejectedAt = report.rejectedAt,
            rejectedReason = report.rejectedReason,
            signerId = report.signer?.id,
            signedAt = report.signedAt,
            totalAmount = report.totalAmount,
            currency = report.currency,
            createdAt = report.createdAt,
            updatedAt = report.updatedAt,
            expenses = expensesOut,
            advances = advancesOut,
            totalAdvances = totalAdvances,
            mileageRecords = mileageOut,
            totalMileageEur = totalMileage,
            dailyAllowance = allowance,
            totalReimbursable = totalReimbursable,
            kundenauftrag = report.kundenauftrag,
            auftragsart = report.auftragsart,
            positionstyp = report.positionstyp,
            technplatzRaw = report.technplatzRaw,
            technplatzLine = report.technplatzLine,
            kundeCode = report.kundeCode,
            kundeName = report.kundeName,
            adresse = report.adresse,
            vorgang = report.vorgang,
            arbeitsplatz = report.arbeitsplatz,
            techniker = report.techniker
        )
    }
}
