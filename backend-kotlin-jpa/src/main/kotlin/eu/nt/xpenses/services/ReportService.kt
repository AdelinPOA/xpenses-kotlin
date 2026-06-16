package eu.nt.xpenses.services

import eu.nt.xpenses.models.ExpenseReport
import eu.nt.xpenses.repositories.ExpenseReportRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ReportService(private val reportRepository: ExpenseReportRepository) {
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
}
