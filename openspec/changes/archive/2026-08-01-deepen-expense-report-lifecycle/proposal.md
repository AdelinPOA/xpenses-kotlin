## Why

Expense Report lifecycle behavior is split across `ReportService`, `ReportController`, raw status strings, and MockMvc-heavy tests, so understanding one transition requires bouncing between multiple shallow modules. This change deepens the lifecycle into one module so transition rules, authorization, Expense status mirroring, timestamps, and emitted events have locality.

## What Changes

- Add a deep Expense Report lifecycle module that owns `attach`, `submit`, `recall`, `approve`, `reject`, `pay`, `sign`, and draft deletion.
- Introduce typed internal lifecycle states while preserving existing database and JSON status strings.
- Move lifecycle authorization decisions into the lifecycle module, using the existing `Authorization` module as a dependency.
- Have lifecycle operations emit domain events for notification-worthy transitions instead of sending email directly.
- Slim controller modules into HTTP adapters that authenticate, parse input, call lifecycle operations, map output, and dispatch notification events.
- Move core lifecycle tests from controller-first assertions toward tests that exercise the lifecycle interface directly.

## Capabilities

### New Capabilities
- `expense-report-lifecycle`: Covers valid Expense Report transitions, actor permissions for lifecycle actions, Expense status mirroring, lifecycle timestamps, emitted lifecycle events, and controller adapter behavior.

### Modified Capabilities

None.

## Impact

- Backend modules affected: `ReportService.kt`, `ReportController.kt`, `ExpenseReport.kt`, `Expense.kt`, `Authorization.kt`, report mappers, and report lifecycle tests.
- Public HTTP routes and JSON status values remain compatible.
- No database migration is expected for this phase; typed states are internal conversion around the existing string column.
- Notification delivery becomes an adapter around lifecycle events, reducing direct lifecycle coupling to email delivery.
