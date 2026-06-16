package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.ExpenseMapper
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@RestController
@RequestMapping("/api/dashboard")
class DashboardController(
    private val expenseRepository: ExpenseRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseMapper: ExpenseMapper
) {

    @GetMapping
    fun getDashboard(
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        request: HttpServletRequest
    ): DashboardStats {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val now = LocalDate.now(ZoneOffset.UTC)
        val monthStart = String.format("%d-%02d-01", now.year, now.monthValue)

        val isOrgWide = currentUser.role in listOf("chef_finance", "mod") || (all && currentUser.role == "manager")

        // 1. Get Expenses
        val expenses = if (isOrgWide) {
            expenseRepository.findAll()
        } else {
            expenseRepository.findAllByUserId(currentUser.id!!)
        }

        val expenseCountTotal = expenses.size
        val monthExpenses = expenses.filter { it.date >= monthStart }
        val expenseCountMonth = monthExpenses.size
        val totalMonthEur = monthExpenses.sumOf { it.amountEur }

        // 2. Get Reports
        val canApprove = currentUser.role in listOf("manager", "chef_finance", "mod")
        val canPay = currentUser.role in listOf("chef_finance", "mod")

        val reports = expenseReportRepository.findAll()
        val userOrOrgReports = if (isOrgWide) reports else reports.filter { it.user?.id == currentUser.id }

        val draftCount = userOrOrgReports.count { it.status == "draft" }
        val submittedCount = userOrOrgReports.count { it.status == "submitted" }
        val paidCount = userOrOrgReports.count { it.status == "paid" }

        val pendingApprovalCount = if (canApprove) {
            reports.count { it.status == "submitted" && it.user?.id != currentUser.id }
        } else 0

        val pendingPaymentCount = if (canPay) {
            reports.count { it.status == "approved" }
        } else 0

        // 3. Category Spend
        val spendByCategory = monthExpenses
            .groupBy { it.category }
            .map { (cat, catExpenses) ->
                CategorySpend(
                    categoryId = cat?.id,
                    categoryName = cat?.name ?: "Uncategorized",
                    total = catExpenses.sumOf { it.amountEur },
                    count = catExpenses.size
                )
            }
            .sortedByDescending { it.total }
            .take(10)

        // 4. Recent Expenses
        val recentExpenses = expenses
            .sortedByDescending { it.createdAt }
            .take(10)
            .map { expenseMapper.toExpenseOut(it) }

        return DashboardStats(
            expenseCountTotal = expenseCountTotal,
            expenseCountMonth = expenseCountMonth,
            totalMonthEur = totalMonthEur,
            draftCount = draftCount,
            submittedCount = submittedCount,
            paidCount = paidCount,
            pendingApprovalCount = pendingApprovalCount,
            pendingPaymentCount = pendingPaymentCount,
            spendByCategory = spendByCategory,
            recentExpenses = recentExpenses
        )
    }

}

data class CategorySpend(
    @JsonProperty("category_id") val categoryId: Int?,
    @JsonProperty("category_name") val categoryName: String,
    val total: Double,
    val count: Int
)

data class DashboardStats(
    @JsonProperty("expense_count_total") val expenseCountTotal: Int,
    @JsonProperty("expense_count_month") val expenseCountMonth: Int,
    @JsonProperty("total_month_eur") val totalMonthEur: Double,
    @JsonProperty("draft_count") val draftCount: Int,
    @JsonProperty("submitted_count") val submittedCount: Int,
    @JsonProperty("paid_count") val paidCount: Int,
    @JsonProperty("pending_approval_count") val pendingApprovalCount: Int = 0,
    @JsonProperty("pending_payment_count") val pendingPaymentCount: Int = 0,
    @JsonProperty("spend_by_category") val spendByCategory: List<CategorySpend>,
    @JsonProperty("recent_expenses") val recentExpenses: List<ExpenseOut>
)
