package eu.nt.xpenses.services

import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.User
import eu.nt.xpenses.report.lifecycle.AttachExpensesCommand
import eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycle
import eu.nt.xpenses.report.lifecycle.RejectReportCommand
import eu.nt.xpenses.report.lifecycle.SubmitReportCommand
import eu.nt.xpenses.repositories.ExpenseReportRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ReportService(
    private val reportRepository: ExpenseReportRepository,
    private val lifecycle: ExpenseReportLifecycle,
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
        return lifecycle.attach(reportId, AttachExpensesCommand(expenseIds), currentUser).report
    }

    @Transactional
    fun submitReport(reportId: Int, expenseIds: List<Int>?, currentUser: User): ExpenseReport {
        return lifecycle.submit(reportId, SubmitReportCommand(expenseIds), currentUser).report
    }

    @Transactional
    fun recallReport(reportId: Int, currentUser: User): ExpenseReport {
        return lifecycle.recall(reportId, currentUser).report
    }

    @Transactional
    fun approveReport(reportId: Int, currentUser: User): ExpenseReport {
        return lifecycle.approve(reportId, currentUser).report
    }

    @Transactional
    fun rejectReport(reportId: Int, reason: String, currentUser: User): ExpenseReport {
        return lifecycle.reject(reportId, RejectReportCommand(reason), currentUser).report
    }

    @Transactional
    fun payReport(reportId: Int, currentUser: User): ExpenseReport {
        return lifecycle.pay(reportId, currentUser).report
    }
}
