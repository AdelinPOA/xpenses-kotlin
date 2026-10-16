# Xpenses

Expense management for a field-service organization: technicians submit receipts, expenses and advance payments are reviewed by finance and reimbursed.

## Language

**Receipt**:
A proof-of-purchase document (paper or electronic) uploaded by a technician. Contains at least an amount and a currency.
_Avoid_: recipe

**OCR source**:
A temporary, Technician-owned representation submitted for Receipt OCR before an Expense or Receipt exists. On successful OCR completion it is promoted to the Receipt of an automatically created Expense; on permanent OCR failure it may support a photo-only draft, otherwise it is discarded after cancellation or expiry.
_Avoid_: OCR receipt, uploaded Receipt

**Expense**:
A logged claim of money spent by a technician, created from a receipt (or manually), carrying the original amount and currency.
_Avoid_: entry, claim

**Original currency**:
The currency printed on the receipt, as detected by OCR or entered by the technician.

**EUR amount**:
The canonical reporting value of an expense, advance or mileage record: the original amount converted to EUR. All report totals, PDFs and dashboards are expressed in EUR.
_Avoid_: converted amount

**FX rate**:
The stored conversion factor for one expense: how many EUR one unit of the original currency is worth on the expense date. EUR itself has rate 1.
_Avoid_: exchange rate, kurs

**FX margin**:
A per-currency markup applied on top of the BNR reference rate to approximate what a Romanian bank actually debits for a card payment in a foreign currency. Configured in `fx_margins` app setting.
_Avoid_: spread, commission

**Manual rate**:
An FX rate entered by a technician instead of the automatic one. Marked `fx_rate_manual` and shown in reports; used when the automatic rate visibly differs from the bank statement debit.

**Debited amount**:
The amount actually charged by the bank for an expense, in the card's billing currency. When known, it is ground truth over any reference rate: the expense's FX rate is derived so the recorded EUR amount matches it.
_Avoid_: final amount, charged amount

**Debit currency**:
The currency in which the bank charged an expense, shown on the bank statement. May differ from both the original currency and EUR.
_Avoid_: billing currency, settlement currency

**Advance**:
A payment given to a technician in advance of expected expenses, later settled against a report.
_Avoid_: pre-payment, avans

**ExpenseReport**:
A formal container of one or more Expenses submitted by a Technician for review and reimbursement, settled against any Advances and expressed in total EUR amount.
_Avoid_: expense folder, expense pack, claim

**Technician**:
An employee who incurs and submits expenses. A `User` with role `technician`; reimbursed for the exact EUR amount debited from their bank account.
_Avoid_: employee, worker, user

**Delegation email**:
An incoming email from an active Technician that contains the information needed to create a draft ExpenseReport for a work assignment.
_Avoid_: email import, incoming expense

**Rejected delegation email**:
A delegation email that cannot be accepted because its sender or content is permanently invalid. It creates no ExpenseReport and requires explicit administrative retry if circumstances change.
_Avoid_: failed email

**Durably processed delegation**:
A delegation email for which the draft ExpenseReport and its association with the source message are committed together. This is distinct from the mailbox acknowledgement.
_Avoid_: sent email, completed acknowledgement

**Mailbox acknowledgement**:
The external IMAP operation that marks a durably processed or rejected delegation email as seen. It may be retried independently without creating another ExpenseReport.
_Avoid_: processing, completion

**OcrJob**:
A durable, Technician-owned work record for OCR and its staged promotion into one draft Expense and one Receipt. Its persisted stage is `OCR`, `EXPENSE`, or `RECEIPT`; its status describes control flow independently of stage.
_Avoid_: transient OCR request, in-memory scan

**OCR stage**:
The current durable step of an OcrJob: provider OCR, draft Expense creation, or Receipt attachment. A successful stage transition advances the same OcrJob rather than creating a new job.

**OCR lease**:
An opaque token and expiry held by one worker for one OcrJob stage. Database compare-and-set writes require the token, so an expired or stale worker cannot persist a result.

**OcrJob outcome**:
The current durable lifecycle outcome of an OcrJob, describing control flow independently of its stage:
- **Pending**: Work is queued and eligible for processing.
- **In progress**: Exactly one worker holds an active lease for the current step (internally `PROCESSING`).
- **Retryable failure**: The step failed with a transient error; the source remains eligible for scheduled retry (`RETRY_WAIT`).
- **Permanent failure**: The step cannot complete automatically (`PERMANENT_FAILURE`). If stage is `OCR`, this may produce a photo-only draft Expense.
- **Completed**: The draft Expense and Receipt were successfully created and linked (`COMPLETED`).
- **Cancelled**: The Technician explicitly cancelled the job before completion (`CANCELLED`).
- **Expired**: The retention window elapsed before the job could finish (`EXPIRED`).
- **Unrecoverable**: The source was never durably stored or was corrupted (`UNRECOVERABLE`).
_Avoid_: claimed status, raw worker state

**Storage context**:
A domain categorization of stored files (`RECEIPT`, `SIGNATURE`, `OCR_SOURCE`) defining per-context rules: allowed file extensions, maximum payload size, magic-byte validation, and relative path construction.
_Avoid_: storage bucket, file category

**OCR service**:
The service responsible for optical character recognition on receipt uploads. OCR rate-limiting, queuing, and provider concurrency control live internally within this service.
_Avoid_: scanner service

**PDF report reimbursement**:
The net settlement amount displayed in the generated Expense Report PDF summary (`totalReimbursable`). By explicit Accounting policy, mileage is excluded from this PDF reimbursement total (`totalEur + allowance - totalAdv`). Mileage is tracked and listed separately in the report, but is not included in the PDF reimbursement settlement.
_Avoid_: reporting mileage exclusion as a bug

