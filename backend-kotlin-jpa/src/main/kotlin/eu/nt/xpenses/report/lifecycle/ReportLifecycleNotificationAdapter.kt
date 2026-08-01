package eu.nt.xpenses.report.lifecycle

import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.services.EmailSettingsService
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component
import java.math.RoundingMode

@Component
class ReportLifecycleNotificationAdapter(
    private val userRepository: UserRepository,
    private val emailSettingsService: EmailSettingsService
) {
    fun dispatch(events: List<ExpenseReportLifecycleEvent>) {
        for (event in events) {
            when (event) {
                is ExpenseReportLifecycleEvent.ReportSubmitted -> notifySubmitted(event)
                is ExpenseReportLifecycleEvent.ReportApproved -> notifyApproved(event)
                is ExpenseReportLifecycleEvent.ReportRejected -> notifyRejected(event)
                is ExpenseReportLifecycleEvent.ReportPaid -> notifyPaid(event)
            }
        }
    }

    @Async
    fun notifySubmitted(event: ExpenseReportLifecycleEvent.ReportSubmitted) {
        val approvers = userRepository.findAllByRoleInAndIsActive(listOf("manager", "chef_finance"), true)
        val subject = "New expense report submitted: ${event.reportTitle}"
        val content = "${event.ownerDisplayName} has submitted a new expense report: ${event.reportTitle}.\n" +
            "Total: ${event.totalAmount.setScale(2, RoundingMode.HALF_UP)} ${event.currency}."
        for (approver in approvers) {
            if (!approver.email.isNullOrEmpty() && approver.notificationsEnabled) {
                emailSettingsService.sendEmail(approver.email!!, subject, content)
            }
        }
    }

    @Async
    fun notifyApproved(event: ExpenseReportLifecycleEvent.ReportApproved) {
        if (!event.ownerEmail.isNullOrEmpty() && event.ownerNotificationsEnabled) {
            val subject = "Expense report approved: ${event.reportTitle}"
            val content = "Your expense report \"${event.reportTitle}\" has been approved by ${event.approverDisplayName}."
            emailSettingsService.sendEmail(event.ownerEmail, subject, content)
        }
    }

    @Async
    fun notifyRejected(event: ExpenseReportLifecycleEvent.ReportRejected) {
        if (!event.ownerEmail.isNullOrEmpty() && event.ownerNotificationsEnabled) {
            val subject = "Expense report rejected: ${event.reportTitle}"
            val content = "Your expense report \"${event.reportTitle}\" has been rejected by ${event.rejecterDisplayName}.\n" +
                "Reason: ${event.reason}."
            emailSettingsService.sendEmail(event.ownerEmail, subject, content)
        }
    }

    @Async
    fun notifyPaid(event: ExpenseReportLifecycleEvent.ReportPaid) {
        if (!event.ownerEmail.isNullOrEmpty() && event.ownerNotificationsEnabled) {
            val subject = "Expense report paid: ${event.reportTitle}"
            val content = "Your expense report \"${event.reportTitle}\" has been marked as paid."
            emailSettingsService.sendEmail(event.ownerEmail, subject, content)
        }
    }
}
