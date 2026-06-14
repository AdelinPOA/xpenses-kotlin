package eu.nt.xpenses.services

import eu.nt.xpenses.models.Report
import eu.nt.xpenses.repositories.ReportRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ReportService(private val reportRepository: ReportRepository) {

    @Transactional(readOnly = true)
    fun getReportWithExpenses(id: Long): Report? {
        return reportRepository.findByIdWithExpenses(id).orElse(null)
    }

    @Transactional(readOnly = true)
    fun processAllReportsEagerly() {
        // Safe database call ensuring children are eagerly fetched in a single query
        val reports = reportRepository.findAllWithExpenses()
        
        // This loop operates without triggering N+1 queries because r.expenses has already been loaded.
        for (report in reports) {
            println("Processing Report: ${report.title} (Status: ${report.status})")
            for (expense in report.expenses) {
                // Eagerly loaded; does not query database again
                println(" - Expense: ${expense.description} of ${expense.amount} ${expense.currency}")
            }
        }
    }
}
