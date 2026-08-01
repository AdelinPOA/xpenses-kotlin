package eu.nt.xpenses.report.lifecycle

import eu.nt.xpenses.model.ExpenseReport
import java.math.BigDecimal

data class AttachExpensesCommand(
    val expenseIds: List<Int>
)

data class SubmitReportCommand(
    val expenseIds: List<Int>?
)

data class RejectReportCommand(
    val reason: String
)

data class DeleteDraftReportCommand(
    val deleteExpenses: Boolean
)

data class ExpenseReportLifecycleOutcome(
    val report: ExpenseReport,
    val events: List<ExpenseReportLifecycleEvent> = emptyList()
)

sealed interface ExpenseReportLifecycleEvent {
    data class ReportSubmitted(
        val reportTitle: String,
        val ownerDisplayName: String,
        val totalAmount: BigDecimal,
        val currency: String
    ) : ExpenseReportLifecycleEvent

    data class ReportApproved(
        val reportTitle: String,
        val ownerEmail: String?,
        val ownerNotificationsEnabled: Boolean,
        val approverDisplayName: String
    ) : ExpenseReportLifecycleEvent

    data class ReportRejected(
        val reportTitle: String,
        val ownerEmail: String?,
        val ownerNotificationsEnabled: Boolean,
        val rejecterDisplayName: String,
        val reason: String
    ) : ExpenseReportLifecycleEvent

    data class ReportPaid(
        val reportTitle: String,
        val ownerEmail: String?,
        val ownerNotificationsEnabled: Boolean
    ) : ExpenseReportLifecycleEvent
}
