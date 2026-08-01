package eu.nt.xpenses.report.lifecycle

import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

enum class ExpenseReportLifecycleState(val value: String) {
    DRAFT("draft"),
    SUBMITTED("submitted"),
    APPROVED("approved"),
    REJECTED("rejected"),
    PAID("paid");

    companion object {
        fun from(status: String): ExpenseReportLifecycleState {
            return entries.firstOrNull { it.value == status }
                ?: throw ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Unknown expense report status: $status"
                )
        }
    }
}
