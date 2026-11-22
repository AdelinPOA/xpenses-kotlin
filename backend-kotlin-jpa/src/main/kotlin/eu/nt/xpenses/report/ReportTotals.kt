package eu.nt.xpenses.report

import eu.nt.xpenses.model.AdvancePayment
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.MileageRecord
import eu.nt.xpenses.services.AppSettingsService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Duration
import java.time.LocalDate
import java.time.format.DateTimeFormatter

fun interface DailyAllowanceRatePort {
    fun currentDailyAllowanceRate(): BigDecimal
}

@Component
class AppSettingsDailyAllowanceAdapter(
    private val appSettingsService: AppSettingsService,
) : DailyAllowanceRatePort {
    override fun currentDailyAllowanceRate(): BigDecimal =
        appSettingsService.getDailyAllowanceRate()
}

data class ReportTotals(
    val totalExpensesEur: BigDecimal,
    val totalPaidAdvancesEur: BigDecimal,
    val totalMileageEur: BigDecimal,
    val dailyAllowanceEur: BigDecimal,
    val apiReimbursableEur: BigDecimal,
    val pdfReimbursableEur: BigDecimal,
) {
    companion object {
        private val log = LoggerFactory.getLogger(ReportTotals::class.java)
        private val DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd")
        val DEFAULT_DAILY_ALLOWANCE_RATE = BigDecimal("50.00")

        fun calculateDailyAllowance(
            dateFrom: String?,
            dateTo: String?,
            dailyRate: BigDecimal = DEFAULT_DAILY_ALLOWANCE_RATE,
        ): BigDecimal {
            if (dateFrom.isNullOrEmpty() || dateTo.isNullOrEmpty()) return BigDecimal.ZERO
            return try {
                val dFrom = LocalDate.parse(dateFrom.take(10), DATE_FMT)
                val dTo = LocalDate.parse(dateTo.take(10), DATE_FMT)
                val days = Duration.between(dFrom.atStartOfDay(), dTo.atStartOfDay()).toDays() + 1
                if (days > 0) dailyRate.multiply(BigDecimal.valueOf(days)) else BigDecimal.ZERO
            } catch (e: Exception) {
                log.warn("Exception in calculateDailyAllowance: {}", e.message)
                BigDecimal.ZERO
            }
        }

        fun calculate(
            dateFrom: String?,
            dateTo: String?,
            expenses: Collection<Expense>,
            advances: Collection<AdvancePayment>,
            mileage: Collection<MileageRecord>,
            dailyRate: BigDecimal = DEFAULT_DAILY_ALLOWANCE_RATE,
        ): ReportTotals {
            val totalExpensesEur = expenses.fold(BigDecimal.ZERO) { acc, e -> acc.add(e.amountEur) }
            val totalPaidAdvancesEur = advances
                .filter { it.status == "paid" }
                .fold(BigDecimal.ZERO) { acc, a -> acc.add(a.amountEur) }
            val totalMileageEur = mileage.fold(BigDecimal.ZERO) { acc, m -> acc.add(m.amountEur) }
            val dailyAllowanceEur = calculateDailyAllowance(dateFrom, dateTo, dailyRate)
            val apiReimbursableEur = totalExpensesEur
                .add(dailyAllowanceEur)
                .add(totalMileageEur)
                .subtract(totalPaidAdvancesEur)
            // Accounting policy explicitly excludes mileage from the PDF reimbursement total.
            val pdfReimbursableEur = totalExpensesEur
                .add(dailyAllowanceEur)
                .subtract(totalPaidAdvancesEur)
            return ReportTotals(
                totalExpensesEur = totalExpensesEur,
                totalPaidAdvancesEur = totalPaidAdvancesEur,
                totalMileageEur = totalMileageEur,
                dailyAllowanceEur = dailyAllowanceEur,
                apiReimbursableEur = apiReimbursableEur,
                pdfReimbursableEur = pdfReimbursableEur,
            )
        }

        fun calculate(
            report: ExpenseReport,
            dailyRate: BigDecimal = DEFAULT_DAILY_ALLOWANCE_RATE,
        ): ReportTotals =
            calculate(
                dateFrom = report.dateFrom,
                dateTo = report.dateTo,
                expenses = report.expenses,
                advances = report.advances,
                mileage = report.mileageRecords,
                dailyRate = dailyRate,
            )
    }
}
