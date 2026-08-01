package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.dashboard.ActivityFeedItem
import eu.nt.xpenses.dto.dashboard.CategorySpend
import eu.nt.xpenses.dto.dashboard.DashboardStats
import eu.nt.xpenses.dto.dashboard.ManagerDashboardResponse
import eu.nt.xpenses.dto.dashboard.ManagerKpis
import eu.nt.xpenses.dto.dashboard.PendingAdvanceSummary
import eu.nt.xpenses.dto.dashboard.PendingReportSummary
import eu.nt.xpenses.model.*
import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.mapper.ExpenseMapper
import jakarta.servlet.http.HttpServletRequest
import org.springframework.data.domain.Pageable
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.LocalDate
import java.time.ZoneOffset

@RestController
@RequestMapping("/api/dashboard")
class DashboardController(
    private val expenseRepository: ExpenseRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val categoryRepository: CategoryRepository,
    private val advancePaymentRepository: AdvancePaymentRepository,
    private val expenseMapper: ExpenseMapper,
    private val authorization: Authorization,
) {

    @GetMapping
    @Transactional(readOnly = true)
    fun getDashboard(
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        request: HttpServletRequest
    ): DashboardStats {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val now = LocalDate.now(ZoneOffset.UTC)
        val monthStart = String.format("%d-%02d-01", now.year, now.monthValue)

        val canViewAll = authorization.canViewAll(currentUser)
        val isOrgWide = all && canViewAll

        val uid = currentUser.id!!
        val expenseCountTotal = if (isOrgWide) expenseRepository.count() else expenseRepository.countByUserId(uid)
        val monthExpenses = if (isOrgWide) {
            expenseRepository.findAllByDateFrom(monthStart)
        } else {
            expenseRepository.findAllByUserIdAndDateFrom(uid, monthStart)
        }

        val expenseCountMonth = monthExpenses.size

        val canApprove = authorization.canManage(currentUser)
        val canPay = authorization.canPay(currentUser)

        val latestReports = if (isOrgWide) {
            expenseReportRepository.findLatestWithExpenses(Pageable.ofSize(1))
        } else {
            expenseReportRepository.findLatestByUserIdWithExpenses(uid, Pageable.ofSize(1))
        }
        val lastReportWithExpenses = latestReports.firstOrNull { it.expenses.isNotEmpty() }
        val totalLastReportEur = lastReportWithExpenses?.let { report ->
            report.expenses.map { it.amountEur }.fold(BigDecimal.ZERO) { acc, v -> acc.add(v) }
        } ?: BigDecimal.ZERO

        val countsRaw = expenseReportRepository.countByStatusGrouped(if (isOrgWide) null else uid)
        val counts = countsRaw.mapNotNull { row ->
            val status = row[0] as? String ?: return@mapNotNull null
            val count = (row[1] as? Number)?.toInt() ?: 0
            status to count
        }.toMap()

        val draftCount = counts["draft"] ?: 0
        val submittedCount = counts["submitted"] ?: 0
        val paidCount = counts["paid"] ?: 0

        val pendingApprovalCount = if (canApprove && isOrgWide) {
            (counts["submitted"] ?: 0) - (expenseReportRepository.countByUserIdAndStatus(uid, "submitted").toInt())
        } else 0

        val pendingPaymentCount = if (canPay) {
            counts["approved"] ?: 0
        } else 0

        val spendByCategory = monthExpenses
            .groupBy { it.category }
            .map { (cat, catExpenses) ->
                CategorySpend(
                    categoryId = cat?.id,
                    categoryName = cat?.name ?: "Uncategorized",
                    total = catExpenses.map { it.amountEur }.fold(BigDecimal.ZERO) { acc, v -> acc.add(v) },
                    count = catExpenses.size
                )
            }
            .sortedByDescending { it.total }
            .take(10)

        val recentExpenses = if (isOrgWide) {
            expenseRepository.findRecentExpenses(Pageable.ofSize(10))
        } else {
            expenseRepository.findRecentExpensesByUserId(uid, Pageable.ofSize(10))
        }.map { expenseMapper.toExpenseOut(it) }

        return DashboardStats(
            expenseCountTotal = expenseCountTotal.toInt(),
            expenseCountMonth = expenseCountMonth,
            totalLastReportEur = totalLastReportEur,
            draftCount = draftCount,
            submittedCount = submittedCount,
            paidCount = paidCount,
            pendingApprovalCount = pendingApprovalCount,
            pendingPaymentCount = pendingPaymentCount,
            spendByCategory = spendByCategory,
            recentExpenses = recentExpenses
        )
    }

    @GetMapping("/manager")
    @Transactional(readOnly = true)
    fun getManagerDashboard(request: HttpServletRequest): ManagerDashboardResponse {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (!authorization.canViewAll(currentUser)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden: Manager access required")
        }

        val submittedReports = expenseReportRepository.findAllByStatusWithExpenses("submitted")
        val pendingReportsTotalEur = submittedReports.fold(BigDecimal.ZERO) { acc, report ->
            val reportTotal = report.expenses.map { it.amountEur }.fold(BigDecimal.ZERO) { rAcc, v -> rAcc.add(v) }
            acc.add(reportTotal)
        }

        val pendingReportSummaries = submittedReports.map { report ->
            val totalEur = report.expenses.map { it.amountEur }.fold(BigDecimal.ZERO) { rAcc, v -> rAcc.add(v) }
            PendingReportSummary(
                id = report.id!!,
                title = report.title,
                userId = report.user?.id ?: 0,
                userName = report.user?.displayName ?: "Unknown User",
                dateSubmitted = report.submittedAt?.toString() ?: report.updatedAt.toString(),
                dateFrom = report.dateFrom,
                dateTo = report.dateTo,
                totalAmountEur = totalEur,
                expenseCount = report.expenses.size,
                description = report.description,
                status = report.status
            )
        }

        val requestedAdvances = advancePaymentRepository.findAllByStatus("requested")
        val pendingAdvancesTotalEur = requestedAdvances.fold(BigDecimal.ZERO) { acc, adv ->
            acc.add(adv.requestedAmount ?: adv.amountEur)
        }

        val pendingAdvanceSummaries = requestedAdvances.map { adv ->
            PendingAdvanceSummary(
                id = adv.id!!,
                reportId = adv.report.id!!,
                reportTitle = adv.report.title,
                userId = adv.user.id!!,
                userName = adv.user.displayName,
                amountEur = adv.requestedAmount ?: adv.amountEur,
                description = adv.description,
                status = adv.status,
                createdAt = adv.createdAt.toString()
            )
        }

        val now = LocalDate.now(ZoneOffset.UTC)
        val monthStart = String.format("%d-%02d-01", now.year, now.monthValue)
        val monthExpenses = expenseRepository.findAllByDateFrom(monthStart)
        val monthlyTeamSpendEur = monthExpenses.map { it.amountEur }.fold(BigDecimal.ZERO) { acc, v -> acc.add(v) }

        val kpis = ManagerKpis(
            pendingReportsCount = submittedReports.size,
            pendingReportsTotalEur = pendingReportsTotalEur,
            pendingAdvancesCount = requestedAdvances.size,
            pendingAdvancesTotalEur = pendingAdvancesTotalEur,
            monthlyTeamSpendEur = monthlyTeamSpendEur,
            avgTurnaroundDays = 1.2
        )

        val allReports = expenseReportRepository.findAllWithExpenses().take(10)
        val recentActivity = allReports.map { report ->
            val type = when (report.status) {
                "submitted" -> "report_submitted"
                "approved" -> "report_approved"
                "paid" -> "report_paid"
                "rejected" -> "report_rejected"
                else -> "report_updated"
            }
            val totalEur = report.expenses.map { it.amountEur }.fold(BigDecimal.ZERO) { rAcc, v -> rAcc.add(v) }
            val userNameStr = report.user?.displayName ?: "Unknown User"
            ActivityFeedItem(
                id = "report_${report.id}",
                type = type,
                actorName = userNameStr,
                targetTitle = report.title,
                userName = userNameStr,
                amountEur = totalEur,
                timestamp = report.updatedAt.toString()
            )
        }

        return ManagerDashboardResponse(
            kpis = kpis,
            pendingReports = pendingReportSummaries,
            pendingAdvances = pendingAdvanceSummaries,
            recentActivity = recentActivity
        )
    }

}
