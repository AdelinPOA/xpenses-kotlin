package eu.nt.xpenses.controllers

import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.services.Authorization
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

@Component
class ReportOwnership(
    private val expenseReportRepository: ExpenseReportRepository,
    private val authorization: Authorization,
) {

    fun verifyOwnership(reportId: Int, currentUser: User): ExpenseReport {
        val report = expenseReportRepository.findById(reportId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        }
        if (!authorization.canView(currentUser, report.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your report")
        }
        return report
    }
}
