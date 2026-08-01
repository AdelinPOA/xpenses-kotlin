## 1. Lifecycle Foundation

- [x] 1.1 Add typed internal Expense Report lifecycle state conversion for existing status strings.
- [x] 1.2 Add lifecycle command/outcome/event types for report actions.
- [x] 1.3 Add a focused Expense Report lifecycle module with repository, authorization, Expense deletion, and notification dependencies injected.

## 2. Transition Implementation

- [x] 2.1 Move attach behavior into the lifecycle module and preserve existing validation errors.
- [x] 2.2 Move submit behavior into the lifecycle module, including Expense status mirroring, total recalculation, submitted timestamp, and submitted event emission.
- [x] 2.3 Move recall behavior into the lifecycle module, including Expense status mirroring and submitted timestamp clearing.
- [x] 2.4 Move approve behavior into the lifecycle module, including actor checks, Expense status mirroring, approver timestamp fields, and approved event emission.
- [x] 2.5 Move reject behavior into the lifecycle module, including actor checks, Expense status mirroring, rejection fields, and rejected event emission.
- [x] 2.6 Move pay behavior into the lifecycle module, including finance checks, Expense status mirroring, paid timestamp, and paid event emission.
- [x] 2.7 Move sign behavior into the lifecycle module while preserving existing signature requirements and response semantics.
- [x] 2.8 Move draft deletion behavior into the lifecycle module, preserving detach-vs-delete-expenses behavior and Hibernate soft delete.

## 3. Notification Adapter

- [x] 3.1 Add a lifecycle notification adapter that sends emails from returned lifecycle events.
- [x] 3.2 Remove direct lifecycle email sending from transition implementation.
- [x] 3.3 Ensure notification dispatch only happens after successful lifecycle operations.

## 4. Controller Adapter Cleanup

- [x] 4.1 Update `ReportController` lifecycle routes to authenticate, parse input, call the lifecycle module, dispatch events, and map output.
- [x] 4.2 Remove lifecycle transition logic and repeated lifecycle authorization checks from `ReportController`.
- [x] 4.3 Keep non-lifecycle report routes and export behavior unchanged.
- [x] 4.4 Update or retire `ReportService` methods that are replaced by the lifecycle module without breaking other callers.

## 5. Tests

- [x] 5.1 Add lifecycle interface tests for all valid transitions and Expense status mirroring.
- [x] 5.2 Add lifecycle interface tests for invalid transitions and actor permission failures.
- [x] 5.3 Add lifecycle interface tests for emitted lifecycle events.
- [x] 5.4 Keep route compatibility tests for existing lifecycle endpoints and response status behavior.
- [x] 5.5 Update existing `ReportStateMachineTest` coverage to avoid duplicate MockMvc-only transition matrix assertions.

## 6. Verification

- [x] 6.1 Run `./gradlew test --no-daemon`.
- [x] 6.2 Run `./gradlew bootJar --no-daemon`.
- [x] 6.3 Run `docker compose build` if backend verification passes.
