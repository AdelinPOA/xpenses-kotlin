package eu.nt.xpenses.report.review

import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.services.Authorization
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class ReviewQueueReader(
    private val expenseReportRepository: ExpenseReportRepository,
    private val authorization: Authorization
) {
    fun read(actor: User): List<ReviewQueueItem> {
        if (!authorization.canManage(actor)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden: manager access required")
        }

        val actorId = actor.id
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user has no ID")

        return expenseReportRepository.findReviewQueue(actorId).map { projection ->
            ReviewQueueItem(
                id = projection.id,
                title = projection.title,
                userId = projection.userId,
                userName = projection.userName,
                dateSubmitted = projection.dateSubmitted,
                dateFrom = projection.dateFrom,
                dateTo = projection.dateTo,
                description = projection.description,
                expenseCount = projection.expenseCount.toInt(),
                totalAmountEur = projection.totalAmountEur,
                currency = projection.currency,
                status = projection.status
            )
        }
    }
}
