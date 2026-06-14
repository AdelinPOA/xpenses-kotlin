package eu.nt.xpenses.services

import eu.nt.xpenses.models.ExpenseReport
import eu.nt.xpenses.repositories.ExpenseReportRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ReportService(private val reportRepository: ExpenseReportRepository) {

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
            println("Processing Report: ${report.title} (Status: ${report.status})")
            for (expense in report.expenses) {
                println(" - Expense: ${expense.description} of ${expense.amountOriginal} ${expense.currencyOriginal}")
            }
        }
    }
}
