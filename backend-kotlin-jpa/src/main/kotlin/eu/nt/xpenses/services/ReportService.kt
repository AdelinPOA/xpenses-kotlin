package eu.nt.xpenses.services

import eu.nt.xpenses.models.ExpenseReport
import eu.nt.xpenses.models.User
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import org.springframework.http.HttpStatus
import java.math.BigDecimal
import java.time.Instant

@Service
class ReportService(
    private val reportRepository: ExpenseReportRepository,
    private val expenseRepository: ExpenseRepository,
    private val userRepository: UserRepository,
    private val emailSettingsService: EmailSettingsService
) {
    private val log = LoggerFactory.getLogger(ReportService::class.java)

    @Transactional(readOnly = true)
    fun getReportWithExpenses(id: Int): ExpenseReport? {
        return reportRepository.findByIdWithExpenses(id).orElse(null)
    }

    @Transactional(readOnly = true)
    fun getAllReportsWithExpenses(): List<ExpenseReport> {
        return reportRepository.findAllWithExpenses()
    }

    @Transactional(readOnly = true)
    fun processAllReportsEagerly() {
        val reports = reportRepository.findAllWithExpenses()
        for (report in reports) {
            log.info("Processing Report: {} (Status: {})", report.title, report.status)
            for (expense in report.expenses) {
                log.info(" - Expense: {} of {} {}", expense.description, expense.amountOriginal, expense.currencyOriginal)
            }
        }
    }

    @Transactional
    fun attachExpenses(reportId: Int, expenseIds: List<Int>, currentUser: User): ExpenseReport {
        val report = reportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can modify report expenses")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft reports can be modified")
        }
        if (expenseIds.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one expense is required")
        }

        val expenses = expenseRepository.findAllById(expenseIds)
        val valid = expenses.filter { it.status == "draft" && it.user?.id == currentUser.id }
        
        val invalid = expenseIds.toSet() - valid.map { it.id!! }.toSet()
        if (invalid.isNotEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid, non-draft, or not-owned expense IDs: $invalid")
        }

        val now = Instant.now()
        for (exp in valid) {
            exp.report = report
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        report.updatedAt = now
        return reportRepository.save(report)
    }

    @Transactional
    fun submitReport(reportId: Int, expenseIds: List<Int>?, currentUser: User): ExpenseReport {
        val report = reportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can submit a report")
        }
        if (report.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Report is not in draft status")
        }

        val now = Instant.now()

        // Attach first if IDs provided
        if (expenseIds != null && expenseIds.isNotEmpty()) {
            val expenses = expenseRepository.findAllById(expenseIds)
            val valid = expenses.filter { it.status == "draft" && it.user?.id == currentUser.id }
            for (exp in valid) {
                exp.report = report
                exp.updatedAt = now
                expenseRepository.save(exp)
            }
        }

        // Refresh report reference
        val updatedReport = reportRepository.findById(reportId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found after refresh") }
        if (updatedReport.expenses.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No expenses attached to this report")
        }

        // Set all expenses to submitted
        for (exp in updatedReport.expenses) {
            exp.status = "submitted"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val totalAmount = updatedReport.expenses.map { it.amountEur }.fold(BigDecimal.ZERO) { acc, v -> acc.add(v) }
        updatedReport.status = "submitted"
        updatedReport.submittedAt = now
        updatedReport.totalAmount = totalAmount
        updatedReport.updatedAt = now

        val saved = reportRepository.save(updatedReport)

        sendReportSubmittedNotification(saved.title, currentUser.displayName, totalAmount, saved.currency)

        return saved
    }

    @Async
    fun sendReportSubmittedNotification(reportTitle: String, userDisplayName: String, totalAmount: BigDecimal, currency: String) {
        val approvers = userRepository.findAllByRoleInAndIsActive(listOf("manager", "chef_finance"), true)
        val subject = "New expense report submitted: $reportTitle"
        val content = "${userDisplayName} has submitted a new expense report: $reportTitle.\nTotal: ${totalAmount.setScale(2, java.math.RoundingMode.HALF_UP)} $currency."
        for (appr in approvers) {
            if (!appr.email.isNullOrEmpty() && appr.notificationsEnabled) {
                emailSettingsService.sendEmail(appr.email!!, subject, content)
            }
        }
    }

    @Transactional
    fun recallReport(reportId: Int, currentUser: User): ExpenseReport {
        val report = reportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can recall a report")
        }
        if (report.status != "submitted" && report.status != "rejected") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted or rejected reports can be recalled")
        }

        val now = Instant.now()
        report.status = "draft"
        report.submittedAt = null
        report.updatedAt = now

        for (exp in report.expenses) {
            exp.status = "draft"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        return reportRepository.save(report)
    }

    @Transactional
    fun approveReport(reportId: Int, currentUser: User): ExpenseReport {
        if (currentUser.role !in listOf("manager", "chef_finance")) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        val report = reportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.status != "submitted") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted reports can be approved")
        }
        if (report.user?.id == currentUser.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot approve your own report")
        }

        val now = Instant.now()
        report.status = "approved"
        report.approvedBy = currentUser
        report.approvedAt = now
        report.updatedAt = now

        for (exp in report.expenses) {
            exp.status = "approved"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val saved = reportRepository.save(report)

        // Notify owner
        val owner = saved.user
        if (owner != null && !owner.email.isNullOrEmpty() && owner.notificationsEnabled) {
            val subject = "Expense report approved: ${saved.title}"
            val content = "Your expense report \"${saved.title}\" has been approved by ${currentUser.displayName}."
            emailSettingsService.sendEmail(owner.email!!, subject, content)
        }

        return saved
    }

    @Transactional
    fun rejectReport(reportId: Int, reason: String, currentUser: User): ExpenseReport {
        if (currentUser.role !in listOf("manager", "chef_finance")) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        val report = reportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.status != "submitted") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted reports can be rejected")
        }
        if (report.user?.id == currentUser.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot reject your own report")
        }

        val now = Instant.now()
        
        report.status = "rejected"

        report.rejectedBy = currentUser
        report.rejectedAt = now
        report.rejectedReason = reason
        report.updatedAt = now

        // Keep expenses attached to report but set back to draft
        for (exp in report.expenses) {
            exp.status = "draft"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val saved = reportRepository.save(report)

        // Notify owner
        val owner = saved.user
        if (owner != null && !owner.email.isNullOrEmpty() && owner.notificationsEnabled) {
            val subject = "Expense report rejected: ${saved.title}"
            val content = "Your expense report \"${saved.title}\" has been rejected by ${currentUser.displayName}.\nReason: $reason."
            emailSettingsService.sendEmail(owner.email!!, subject, content)
        }

        return saved
    }

    @Transactional
    fun payReport(reportId: Int, currentUser: User): ExpenseReport {
        if (currentUser.role != "chef_finance") {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only chef_finance can perform payment")
        }

        val report = reportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }

        if (report.user?.id == currentUser.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot pay your own report")
        }

        if (report.status != "approved") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only approved reports can be marked as paid")
        }

        val now = Instant.now()
        report.status = "paid"
        report.paidAt = now
        report.updatedAt = now

        for (exp in report.expenses) {
            exp.status = "paid"
            exp.updatedAt = now
            expenseRepository.save(exp)
        }

        val saved = reportRepository.save(report)

        // Notify report owner
        val owner = saved.user
        if (owner != null && !owner.email.isNullOrEmpty() && owner.notificationsEnabled) {
            val subject = "Expense report paid: ${saved.title}"
            val content = "Your expense report \"${saved.title}\" has been marked as paid."
            emailSettingsService.sendEmail(owner.email!!, subject, content)
        }

        return saved
    }
}
