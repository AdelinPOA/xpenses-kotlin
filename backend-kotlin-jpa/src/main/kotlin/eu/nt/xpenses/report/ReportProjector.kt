package eu.nt.xpenses.report

import eu.nt.xpenses.dto.report.AdvancePaymentOut
import eu.nt.xpenses.dto.report.ReportOut
import eu.nt.xpenses.mileage.toMileageRecordOut
import eu.nt.xpenses.model.AdvancePayment
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.expense.ExpenseProjector
import org.springframework.stereotype.Component
import java.math.BigDecimal

@Component
class ReportProjector(
    private val expenseProjector: ExpenseProjector,
    private val dailyAllowanceRatePort: DailyAllowanceRatePort,
) {
    fun toReportOut(report: ExpenseReport): ReportOut =
        toReportOut(report, dailyAllowanceRatePort.currentDailyAllowanceRate())

    fun toReportOuts(reports: List<ExpenseReport>): List<ReportOut> {
        if (reports.isEmpty()) return emptyList()
        val rate = dailyAllowanceRatePort.currentDailyAllowanceRate()
        return reports.map { toReportOut(it, rate) }
    }

    fun toReportOut(report: ExpenseReport, dailyRate: BigDecimal): ReportOut {
        val expensesOut = report.expenses.sortedBy { it.date }.map { expenseProjector.toExpenseOut(it) }
        val advancesOut = report.advances.sortedBy { it.date }.map { mapAdvanceToOut(it) }
        val mileageOut = report.mileageRecords.sortedBy { it.startTime }.map { toMileageRecordOut(it) }
        val totals = ReportTotals.calculate(report, dailyRate)

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
            totalAdvances = totals.totalPaidAdvancesEur,
            mileageRecords = mileageOut,
            totalMileageEur = totals.totalMileageEur,
            dailyAllowance = totals.dailyAllowanceEur,
            totalReimbursable = totals.apiReimbursableEur,
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
            techniker = report.techniker,
            startingOdometerKm = report.startingOdometerKm,
        )
    }

    internal fun mapAdvanceToOut(adv: AdvancePayment): AdvancePaymentOut =
        AdvancePaymentOut(
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
        )
}
