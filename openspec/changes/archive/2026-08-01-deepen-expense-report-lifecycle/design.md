## Context

Expense Report lifecycle behavior currently lives in several places:

- `ReportService.kt` owns most transitions: attach, submit, recall, approve, reject, and pay.
- `ReportController.kt` still owns lifecycle-adjacent behavior such as create, update, delete, sign, export routing, and repeated authorization/current-user handling.
- `ExpenseReport.status` and `Expense.status` are raw strings persisted and serialized as `draft`, `submitted`, `approved`, `rejected`, and `paid`.
- `ReportStateMachineTest.kt` verifies many lifecycle rules through MockMvc, which keeps the HTTP adapter as the main test surface.

The target architecture is one deep Expense Report lifecycle module with a small interface and enough implementation behind it to give callers leverage and maintainers locality.

## Goals / Non-Goals

**Goals:**

- Put all lifecycle actions behind one backend module: `attach`, `submit`, `recall`, `approve`, `reject`, `pay`, `sign`, and draft deletion.
- Use typed internal lifecycle states while preserving current string database values and JSON values.
- Centralize actor authorization for lifecycle actions inside the lifecycle module while reusing the existing `Authorization` module.
- Emit lifecycle events for notification-worthy transitions, with email delivery handled by an adapter.
- Reduce controller modules to HTTP adapters for lifecycle actions.
- Make the lifecycle interface the primary test surface for transition rules and side effects.

**Non-Goals:**

- No public route changes.
- No database migration for status columns in this phase.
- No frontend behavior changes beyond preserving compatibility with existing responses.
- No redesign of Advance Payment or Mileage lifecycle.
- No generic event bus dependency unless existing Spring primitives are already sufficient.

## Decisions

### Decision: Introduce an Expense Report lifecycle module

Create a backend module named around the domain concept, for example `ExpenseReportLifecycle`, under the service package or a dedicated report package. Its interface accepts the actor `User`, report id, and command input, then returns an outcome containing the updated `ExpenseReport` and emitted lifecycle events.

Alternatives considered:

- Keep expanding `ReportService`: lower churn, but the current module already exposes mixed read, transition, notification, and helper behavior.
- Move only controller-only actions into `ReportService`: improves locality a little, but leaves the interface broad and lifecycle events implicit.

Rationale: the deletion test says deleting the lifecycle module should force transition rules to reappear across controllers, models, and tests. That means it is earning depth.

### Decision: Keep persisted statuses as strings, use typed internal states

Introduce a small enum or value type for lifecycle states, with conversion from and to existing status strings. The lifecycle module converts at the seam and uses typed states internally.

Alternatives considered:

- Migrate entity fields to enums immediately: stronger typing at persistence, but more migration and serialization risk than this refactor needs.
- Keep strings everywhere: lowest churn, but preserves the main source of scattered transition risk.

Rationale: internal typing improves locality without breaking the public interface.

### Decision: Lifecycle module owns authorization decisions

Each lifecycle action checks ownership and role policy inside the lifecycle module, using `Authorization` for existing role predicates.

Alternatives considered:

- Controllers authorize before calling lifecycle: keeps controllers coupled to lifecycle rules and makes the lifecycle interface shallow.
- Replace `Authorization` with a generic action/resource policy first: potentially useful later, but not necessary to deepen this module.

Rationale: callers should not need to know whether `approve`, `pay`, or `submit` is owner-only, manager-only, or finance-only.

### Decision: Lifecycle operations emit events; notification is an adapter

Operations such as submit, approve, reject, and pay emit lifecycle events. A notification adapter sends email from those events after the lifecycle operation succeeds.

Alternatives considered:

- Keep direct email calls in lifecycle implementation: fewer files, but lifecycle tests need email setup and transition implementation stays coupled to delivery.
- Publish events through a full eventing library: unnecessary for in-process notifications.

Rationale: the lifecycle module decides what happened; the email adapter decides how to deliver it.

### Decision: Replace controller-first lifecycle tests with interface-first tests

Keep a small set of MockMvc tests for route compatibility and authorization wiring. Move transition matrix coverage to tests that call the lifecycle interface directly.

Alternatives considered:

- Keep all `ReportStateMachineTest` coverage at HTTP level: realistic but noisy, slow, and tightly coupled to Hibernate session behavior.

Rationale: the interface is the test surface. The controller adapter should not be the only way to verify lifecycle rules.

## Risks / Trade-offs

- Typed state conversion may miss an existing unknown status string -> Mitigation: fail with a clear 500/error during conversion and add tests for all known persisted values.
- Event emission could send emails before transaction commit if implemented naively -> Mitigation: have controllers/adapters dispatch after successful lifecycle return, or use transaction-aware Spring events if already available.
- Moving delete/sign may accidentally change HTTP semantics -> Mitigation: preserve controller response codes and add adapter regression tests.
- Lifecycle module could become a large shallow interface -> Mitigation: group operations by command objects and keep helper modules private to the implementation.
- Soft delete behavior uses Hibernate annotations -> Mitigation: lifecycle draft deletion should continue calling repository delete rather than bypassing ORM behavior.
