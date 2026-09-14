package eu.nt.xpenses.report.lifecycle

import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.ExpenseService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant

@Service
class ExpenseReportLifecycle(
    private val reportRepository: ExpenseReportRepository,
    private val expenseRepository: ExpenseRepository,
    private val expenseService: ExpenseService,
    private val authorization: Authorization
) {
    @Transactional
    fun attach(reportId: Int, command: AttachExpensesCommand, actor: User): ExpenseReportLifecycleOutcome {
        val report = loadReport(reportId)
        requireOwner(report, actor, "Only the owner can modify report expenses")
        requireState(report, ExpenseReportLifecycleState.DRAFT, "Only draft reports can be modified")
        if (command.expenseIds.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one expense is required")
        }

        attachDraftExpenses(report, command.expenseIds, actor, Instant.now())
        report.updatedAt = Instant.now()
        return ExpenseReportLifecycleOutcome(reportRepository.save(report))
    }

    @Transactional
    fun submit(reportId: Int, command: SubmitReportCommand, actor: User): ExpenseReportLifecycleOutcome {
        val report = loadReport(reportId)
        requireOwner(report, actor, "Only the owner can submit a report")
        requireState(report, ExpenseReportLifecycleState.DRAFT, "Report is not in draft status")

        val now = Instant.now()
        val expenseIds = command.expenseIds
        if (!expenseIds.isNullOrEmpty()) {
            attachDraftExpenses(report, expenseIds, actor, now)
        }

        val updatedReport = loadReport(reportId, "Report not found after refresh")
        if (updatedReport.expenses.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No expenses attached to this report")
        }

        updateExpenseStatuses(updatedReport.expenses, ExpenseReportLifecycleState.SUBMITTED, now)
        val totalAmount = updatedReport.expenses.map { it.amountEur }
            .fold(BigDecimal.ZERO) { acc, amount -> acc.add(amount) }
        updatedReport.status = ExpenseReportLifecycleState.SUBMITTED.value
        updatedReport.submittedAt = now
        updatedReport.totalAmount = totalAmount
        updatedReport.updatedAt = now

        val saved = reportRepository.save(updatedReport)
        return ExpenseReportLifecycleOutcome(
            report = saved,
            events = listOf(
                ExpenseReportLifecycleEvent.ReportSubmitted(
                    reportTitle = saved.title,
                    ownerDisplayName = actor.displayName,
                    totalAmount = totalAmount,
                    currency = saved.currency
                )
            )
        )
    }

    @Transactional
    fun recall(reportId: Int, actor: User): ExpenseReportLifecycleOutcome {
        val report = loadReport(reportId)
        requireOwner(report, actor, "Only the owner can recall a report")
        val state = ExpenseReportLifecycleState.from(report.status)
        if (state !in setOf(ExpenseReportLifecycleState.SUBMITTED, ExpenseReportLifecycleState.REJECTED)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted or rejected reports can be recalled")
        }

        val now = Instant.now()
        report.status = ExpenseReportLifecycleState.DRAFT.value
        report.submittedAt = null
        report.updatedAt = now
        updateExpenseStatuses(report.expenses, ExpenseReportLifecycleState.DRAFT, now)

        return ExpenseReportLifecycleOutcome(reportRepository.save(report))
    }

    @Transactional
    fun approve(reportId: Int, actor: User): ExpenseReportLifecycleOutcome {
        if (!authorization.canManage(actor)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        val report = loadReport(reportId)
        requireState(report, ExpenseReportLifecycleState.SUBMITTED, "Only submitted reports can be approved")
        if (report.user?.id == actor.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot approve your own report")
        }

        val now = Instant.now()
        report.status = ExpenseReportLifecycleState.APPROVED.value
        report.approvedBy = actor
        report.approvedAt = now
        report.updatedAt = now
        updateExpenseStatuses(report.expenses, ExpenseReportLifecycleState.APPROVED, now)

        val saved = reportRepository.save(report)
        val owner = saved.user
        return ExpenseReportLifecycleOutcome(
            report = saved,
            events = listOf(
                ExpenseReportLifecycleEvent.ReportApproved(
                    reportTitle = saved.title,
                    ownerEmail = owner?.email,
                    ownerNotificationsEnabled = owner?.notificationsEnabled ?: false,
                    approverDisplayName = actor.displayName
                )
            )
        )
    }

    @Transactional
    fun reject(reportId: Int, command: RejectReportCommand, actor: User): ExpenseReportLifecycleOutcome {
        if (!authorization.canManage(actor)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized")
        }

        val report = loadReport(reportId)
        requireState(report, ExpenseReportLifecycleState.SUBMITTED, "Only submitted reports can be rejected")
        if (report.user?.id == actor.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot reject your own report")
        }

        val now = Instant.now()
        report.status = ExpenseReportLifecycleState.REJECTED.value
        report.rejectedBy = actor
        report.rejectedAt = now
        report.rejectedReason = command.reason
        report.updatedAt = now
        updateExpenseStatuses(report.expenses, ExpenseReportLifecycleState.DRAFT, now)

        val saved = reportRepository.save(report)
        val owner = saved.user
        return ExpenseReportLifecycleOutcome(
            report = saved,
            events = listOf(
                ExpenseReportLifecycleEvent.ReportRejected(
                    reportTitle = saved.title,
                    ownerEmail = owner?.email,
                    ownerNotificationsEnabled = owner?.notificationsEnabled ?: false,
                    rejecterDisplayName = actor.displayName,
                    reason = command.reason
                )
            )
        )
    }

    @Transactional
    fun pay(reportId: Int, actor: User): ExpenseReportLifecycleOutcome {
        if (!authorization.canPay(actor)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only chef_finance can perform payment")
        }

        val report = loadReport(reportId)
        if (report.user?.id == actor.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot pay your own report")
        }
        requireState(report, ExpenseReportLifecycleState.APPROVED, "Only approved reports can be marked as paid")

        val now = Instant.now()
        report.status = ExpenseReportLifecycleState.PAID.value
        report.paidAt = now
        report.updatedAt = now
        updateExpenseStatuses(report.expenses, ExpenseReportLifecycleState.PAID, now)

        val saved = reportRepository.save(report)
        val owner = saved.user
        return ExpenseReportLifecycleOutcome(
            report = saved,
            events = listOf(
                ExpenseReportLifecycleEvent.ReportPaid(
                    reportTitle = saved.title,
                    ownerEmail = owner?.email,
                    ownerNotificationsEnabled = owner?.notificationsEnabled ?: false
                )
            )
        )
    }

    @Transactional
    fun sign(reportId: Int, actor: User): ExpenseReportLifecycleOutcome {
        val report = loadReport(reportId)
        requireOwner(report, actor, "Only the report owner can sign")
        if (actor.signaturePath.isNullOrEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No signature saved. Record your signature first.")
        }

        val state = ExpenseReportLifecycleState.from(report.status)
        if (state !in setOf(ExpenseReportLifecycleState.SUBMITTED, ExpenseReportLifecycleState.APPROVED)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only submitted or approved reports can be signed")
        }

        val now = Instant.now()
        report.signer = actor
        report.signedAt = now
        report.updatedAt = now

        return ExpenseReportLifecycleOutcome(reportRepository.save(report))
    }

    @Transactional
    fun deleteDraft(reportId: Int, command: DeleteDraftReportCommand, actor: User) {
        val report = loadReport(reportId)
        requireOwner(report, actor, "Only the owner can delete a report")
        requireState(report, ExpenseReportLifecycleState.DRAFT, "Only draft reports can be deleted")

        val now = Instant.now()
        val expensesList = report.expenses.toList()
        if (command.deleteExpenses) {
            for (expense in expensesList) {
                expenseService.deleteExpense(expense.id!!, actor)
            }
        } else {
            for (expense in expensesList) {
                expense.report = null
                expense.status = ExpenseReportLifecycleState.DRAFT.value
                expense.updatedAt = now
                expenseRepository.save(expense)
            }
        }
        report.expenses.clear()
        reportRepository.delete(report)
    }

    private fun loadReport(reportId: Int, notFoundMessage: String = "Report not found"): ExpenseReport {
        return reportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, notFoundMessage)
        }
    }

    private fun requireOwner(report: ExpenseReport, actor: User, message: String) {
        if (report.user?.id != actor.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, message)
        }
    }

    private fun requireState(
        report: ExpenseReport,
        expected: ExpenseReportLifecycleState,
        message: String
    ) {
        if (ExpenseReportLifecycleState.from(report.status) != expected) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)
        }
    }

    private fun attachDraftExpenses(
        report: ExpenseReport,
        expenseIds: List<Int>,
        actor: User,
        now: Instant
    ) {
        val expenses = expenseRepository.findAllById(expenseIds)
        val valid = expenses.filter {
            it.status == ExpenseReportLifecycleState.DRAFT.value &&
                it.user?.id == actor.id &&
                it.amountOriginal.signum() > 0
        }

        for (expense in valid) {
            if (expense.report?.id != null && expense.report?.id != report.id) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Expense already attached to another report")
            }
        }

        val invalid = expenseIds.toSet() - valid.map { it.id!! }.toSet()
        if (invalid.isNotEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid, incomplete, non-draft, or not-owned expense IDs: $invalid")
        }

        for (expense in valid) {
            expense.report = report
            if (report.expenses.none { it.id == expense.id }) {
                report.expenses.add(expense)
            }
            expense.updatedAt = now
            expenseRepository.save(expense)
        }
    }

    private fun updateExpenseStatuses(
        expenses: Collection<Expense>,
        state: ExpenseReportLifecycleState,
        now: Instant
    ) {
        for (expense in expenses) {
            expense.status = state.value
            expense.updatedAt = now
            expenseRepository.save(expense)
        }
    }
}
