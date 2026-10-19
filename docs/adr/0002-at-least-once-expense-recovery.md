# Expense recovery is at-least-once until idempotency exists

**Partially superseded by [ADR 0007](0007-durable-expense-save-idempotency.md):** keyed Expense creation and Receipt attachment now retain durable backend save identities. The original decision below remains historical context; unkeyed requests and historical unkeyed attempts retain these limitations.

The first Expense saving deepening will be frontend-only: once an Expense ID is known, Receipt attachment and offline recovery reuse that Expense, but lost create or upload responses may still produce duplicate work. We accept this at-least-once behavior for now rather than pretending the frontend can provide exactly-once semantics; preventing it requires backend-supported idempotency keys and is deferred to a separate decision.

## Consequences

- The recovery module must persist staged progress and never create a replacement Expense after an acknowledged creation.
- Tests must cover known-ID recovery while documenting response-loss limitations.
- Future backend idempotency work must cover both Expense creation and Receipt attachment.
