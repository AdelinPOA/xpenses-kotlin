package eu.nt.xpenses.dto.dashboard

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.dto.expense.ExpenseOut
import java.math.BigDecimal

data class DashboardStats(
    @JsonProperty("expense_count_total") val expenseCountTotal: Int,
    @JsonProperty("expense_count_month") val expenseCountMonth: Int,
    @JsonProperty("total_last_report_eur") val totalLastReportEur: BigDecimal,
    @JsonProperty("draft_count") val draftCount: Int,
    @JsonProperty("submitted_count") val submittedCount: Int,
    @JsonProperty("paid_count") val paidCount: Int,
    @JsonProperty("pending_approval_count") val pendingApprovalCount: Int = 0,
    @JsonProperty("pending_payment_count") val pendingPaymentCount: Int = 0,
    @JsonProperty("spend_by_category") val spendByCategory: List<CategorySpend>,
    @JsonProperty("recent_expenses") val recentExpenses: List<ExpenseOut>
)
