# Report Lifecycle

## Overview
Transactional expense report state machine, command/event domain types, and asynchronous email notification adapter in `eu.nt.xpenses.report.lifecycle`.

## Interface
- `[ExpenseReportLifecycleState.kt:ExpenseReportLifecycleState]` — `enum class` with states `DRAFT("draft")`, `SUBMITTED("submitted")`, `APPROVED("approved")`, `REJECTED("rejected")`, `PAID("paid")`, plus `Companion.from(status: String)`
- `[ExpenseReportLifecycleTypes.kt:AttachExpensesCommand]` / `[ExpenseReportLifecycleTypes.kt:SubmitReportCommand]` / `[ExpenseReportLifecycleTypes.kt:RejectReportCommand]` / `[ExpenseReportLifecycleTypes.kt:DeleteDraftReportCommand]` — command payloads
- `[ExpenseReportLifecycleTypes.kt:ExpenseReportLifecycleOutcome]` — `data class ExpenseReportLifecycleOutcome(val report: ExpenseReport, val events: List<ExpenseReportLifecycleEvent> = emptyList())`
- `[ExpenseReportLifecycleTypes.kt:ExpenseReportLifecycleEvent]` — `sealed interface` with `ReportSubmitted`, `ReportApproved`, `ReportRejected`, and `ReportPaid`
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle]` — `@Service` orchestrating `@Transactional` lifecycle transitions: `attach`, `submit`, `recall`, `approve`, `reject`, `pay`, `sign`, and `deleteDraft`
- `[ReportLifecycleNotificationAdapter.kt:ReportLifecycleNotificationAdapter]` — `@Component` with `dispatch(events: List<ExpenseReportLifecycleEvent>)`
- `[ReportLifecycleNotificationAdapter.kt:AsyncReportLifecycleNotifier]` — `@Component` with `@Async` methods `notifySubmitted`, `notifyApproved`, `notifyRejected`, and `notifyPaid`

## Invariants
- `[ExpenseReportLifecycleState.kt:ExpenseReportLifecycleState.Companion.from]` — throws `ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR)` on unknown status strings
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle.attach]` — requires non-empty `expenseIds`, owner actor, `DRAFT` report, and expenses with `status == "draft"`, `user?.id == actor.id`, `amountOriginal.signum() > 0`, and no existing report attachment
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle.submit]` — requires owner actor, `DRAFT` report, and at least one attached expense after optional attach
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle.recall]` — requires owner actor and `SUBMITTED` or `REJECTED` state
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle.approve]` / `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle.reject]` — requires `authorization.canManage(actor)`, `SUBMITTED` state, and `report.user?.id != actor.id` (cannot approve/reject own report)
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle.pay]` — requires `authorization.canPay(actor)`, `APPROVED` state, and `report.user?.id != actor.id` (cannot pay own report)
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle.sign]` — requires owner actor, non-blank `actor.signaturePath`, and `SUBMITTED` or `APPROVED` state
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle.deleteDraft]` — requires owner actor and `DRAFT` state
- `[ReportLifecycleNotificationAdapter.kt:AsyncReportLifecycleNotifier]` — sends email only when recipient email is non-empty and `notificationsEnabled` is `true`

## Side Effects
- `[ExpenseReportLifecycle.kt:ExpenseReportLifecycle]` — reads and mutates `ExpenseReport` and `Expense` entities via `reportRepository` and `expenseRepository` (plus `expenseService.deleteExpense` during `deleteDraft(deleteExpenses = true)`), and emits `ExpenseReportLifecycleEvent` objects
- `[ReportLifecycleNotificationAdapter.kt:ReportLifecycleNotificationAdapter.dispatch]` / `[ReportLifecycleNotificationAdapter.kt:AsyncReportLifecycleNotifier]` — queries active `manager` and `chef_finance` users via `userRepository.findAllByRoleInAndIsActive` and dispatches `@Async` SMTP emails via `emailSettingsService.sendEmail`

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycleTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
