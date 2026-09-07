# Durable Technician email ingestion separates report completion from mailbox acknowledgement

Technician delegation emails are processed with a durable source-message ledger. Creating the draft `ExpenseReport` and recording the source message as durably processed, including the report ID, occur in one PostgreSQL transaction. Marking the external IMAP message as `SEEN` is a separate mailbox acknowledgement and may be retried without parsing or creating another report.

## Decision

- A valid delegation email is durably processed only when its draft `ExpenseReport` and source-message association commit together.
- A successful report transaction followed by an IMAP acknowledgement failure remains processed; only acknowledgement is retried.
- Missing or permanently invalid sender/content is a rejected delegation email, not a transient failure. It creates no report and is acknowledged as `SEEN`; administrative retry is explicit.
- Transient IMAP, parser-provider, or database failures remain retryable with capped backoff and are not made terminal solely by attempt count.
- Processing and acknowledgement claims use tokens so a stale worker cannot overwrite a message reclaimed by another worker.
- Missing SPF/DKIM headers are allowed when the authenticated mailbox and active Technician ownership establish trust; explicit SPF/DKIM failure is rejected.

## Consequences

- The ingestion ledger stores the report ID, processing and acknowledgement state, retry timestamps, and claim tokens.
- IMAP polling, parser selection, transaction completion, acknowledgement recovery, and retry classification live behind the `TechnicianEmailIngestion` module; scheduled callers and the minimal admin recovery surface do not manipulate the ledger directly.
- Tests must exercise the module seam with mailbox/parser adapters and PostgreSQL-backed transaction tests, including response/acknowledgement failure and stale-claim scenarios.
- The system provides durable at-least-once interaction with the external mailbox. Exactly-once external acknowledgement is not promised; duplicate report creation is prevented after durable completion.
- Administrative retry depends on locating the original message by its stable message key; mailbox providers that cannot do so require a future retention or replay decision.
