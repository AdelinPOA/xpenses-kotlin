# Ingestion

## Overview
Polls technician delegation emails over IMAP, deduplicates and tracks processing/acknowledgement lifecycles in a durable PostgreSQL ledger with lease-based recovery, parses delegation payloads, and coordinates report creation and IMAP `SEEN` acknowledgement.

## Interface
- `[TechnicianEmailIngestion.kt:TechnicianEmailIngestion]` — Public interface with `poll(): PollSummary`, `listRecovery(): List<RecoveryItem>`, and `retry(messageKey: String): RecoveryResult`.
- `[TechnicianEmailIngestion.kt:MailboxAdapter]` — Port interface with `readUnseen(): List<InboundEmail>`, `find(messageKey: String): InboundEmail?`, and `markSeen(messageKey: String)`.
- `[TechnicianEmailIngestion.kt:DelegationEmailParser]` — Port interface with `parse(email: InboundEmail): ParseResult`.
- `[TechnicianEmailIngestion.kt:InboundEmail]` & `[TechnicianEmailIngestion.kt:ParseResult]` & `[TechnicianEmailIngestion.kt:DelegationDraft]` — Email payload DTO, sealed parse outcome (`Accepted`, `Rejected`, `RetryableFailure`), and delegation draft model (`fromParsedValues`).
- `[TechnicianEmailIngestion.kt:IngestionStatus]` & `[TechnicianEmailIngestion.kt:AcknowledgementStatus]` — Enums `{CLAIMED, FAILED, PROCESSED, REJECTED}` and `{NONE, PENDING, CONFIRMED}`.
- `[TechnicianEmailIngestion.kt:PollSummary]` & `[TechnicianEmailIngestion.kt:RecoveryItem]` & `[TechnicianEmailIngestion.kt:RecoveryResult]` & `[TechnicianEmailIngestion.kt:ProcessingClaim]` & `[TechnicianEmailIngestion.kt:AcknowledgementClaim]` & `[TechnicianEmailIngestion.kt:ClaimDecision]` — Ledger/polling status models and claim fencing tokens.
- `[DelegationEmailParserAdapter.kt:DelegationEmailParserAdapter]` — `@Component` implementing `DelegationEmailParser.parse`.
- `[ImapIngestionLedger.kt:ImapIngestionLedger]` — `@Repository` managing `imap_ingestion_messages` (`claim`, `markProcessed`, `markRejected`, `markFailed`, `markAcknowledged`, `markAcknowledgementFailed`, `listRecovery`, `requestRetry`) and `[ImapIngestionLedger.kt:IngestionLeaseLostException]`.
- `[ImapMessageKey.kt:ImapMessageKey]` — Singleton `object` exposing `from(message: Message): String`.
- `[JavaMailMailboxAdapter.kt:JavaMailMailboxAdapter]` — `@Component` implementing `MailboxAdapter` via JavaMail `Store`/`Folder`.
- `[TechnicianEmailIngestionScheduler.kt:TechnicianEmailIngestionScheduler]` — `@Component` running `@Async @Scheduled(fixedDelayString = "${imap.poll-interval:300000}") fun poll()`.
- `[TechnicianEmailIngestionService.kt:TechnicianEmailIngestionService]` — `@Service` implementing `TechnicianEmailIngestion`.

## Invariants
- `[ImapMessageKey.kt:ImapMessageKey.from]` — Uses `"message-id:" + trimmed first Message-ID` when present; otherwise computes `"fallback:" + SHA-256 hex` of `"from|sentDate.time|subject"`.
- `[ImapIngestionLedger.kt:ImapIngestionLedger.claim]` & `[ImapIngestionLedger.kt:ImapIngestionLedger.CLAIM_LEASE]` — Uses `SELECT ... FOR UPDATE` row locking on `imap_ingestion_messages` with a 15-minute `CLAIM_LEASE`; active `CLAIMED` rows are skipped until lease expiry, `FAILED` rows wait for `nextAttemptAt <= now`, and `PROCESSED`/`REJECTED` rows with `acknowledgementStatus == PENDING` return `ClaimDecision.Acknowledge` only when due and unleased.
- `[ImapIngestionLedger.kt:ImapIngestionLedger.requireClaimUpdate]` — Enforces optimistic fencing via `claim_token` / `acknowledgement_claim_token` and status guards, throwing `IngestionLeaseLostException` if 0 rows match; truncates error/rejection strings to 500 characters (`markRejected`, `markFailed`, `markAcknowledgementFailed`).
- `[ImapIngestionLedger.kt:ImapIngestionLedger.requestRetry]` — Permits manual retry only for `status IN ('FAILED','REJECTED')` or pending acknowledgement rows, resetting `REJECTED` rows to `status='FAILED'`, `rejection_reason=NULL`, `acknowledgement_status='NONE'`.
- `[TechnicianEmailIngestionService.kt:TechnicianEmailIngestionService.processClaim]` — Rejects missing `From` headers, explicit `"spf=fail"`/`"dkim=fail"`/`Received-SPF: fail` auth failures, inactive/unknown senders (`!emailImportService.hasActiveSender`), and null report outcomes; applies exponential backoff (`30s * 2^(attempt-1)`, exponent clamped `[0, 7]`, max `3600s`).
- `[DelegationEmailParserAdapter.kt:DelegationEmailParserAdapter.parse]` — Rejects when `emailImportService.parseDelegationEmailAsync` returns null or `DelegationDraft.fromParsedValues` yields a blank title.
- `[JavaMailMailboxAdapter.kt:JavaMailMailboxAdapter.readUnseen]` — Returns empty results (`find` returns `null`, `markSeen` throws `IllegalStateException`) when IMAP is disabled or host/user is blank.

## Side Effects
- `[TechnicianEmailIngestionScheduler.kt:TechnicianEmailIngestionScheduler.poll]` — Periodically triggers asynchronous IMAP polling on `${imap.poll-interval:300000}`.
- `[JavaMailMailboxAdapter.kt:JavaMailMailboxAdapter]` — Opens TLS/STARTTLS IMAP `Store` and `READ_WRITE` folder connections (10s connect/read timeouts), searches unseen/matching messages, and sets `Flags.Flag.SEEN = true`.
- `[ImapIngestionLedger.kt:ImapIngestionLedger]` — Acquires `FOR UPDATE` locks and inserts/updates rows in PostgreSQL table `imap_ingestion_messages`.
- `[TechnicianEmailIngestionService.kt:TechnicianEmailIngestionService]` — Invokes `emailImportService.createReportAndComplete` to create reports/delegations and logs poll errors, reclaimed leases, and IMAP flag failures.

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests '<ClassName>' --no-daemon` (targeted test per `AGENTS.md`) or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` (full backend suite in isolated/CI env).
