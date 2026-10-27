# Xpenses

Expense management for a field-service organization: users submit receipts, expenses and advance payments for finance review and reimbursement.

## Language

**Receipt**:
A proof-of-purchase document (paper or electronic) attached to an Expense by its owning User. Contains at least an amount and a currency.
_Avoid_: recipe

**OCR source**:
A Technician-owned staged upload submitted for Receipt OCR before an Expense or Receipt exists. A completed extraction, including partial results, can be promoted into a draft Expense and Receipt; permanent processing failure does not itself guarantee promotion or source deletion.
_Avoid_: OCR receipt, uploaded Receipt

**Expense**:
A logged record of money spent, submitted and owned by a User regardless of role. It may be created from a Receipt or manually and carries the original amount and currency.
_Avoid_: entry, claim

**Expense verification**:
The owning User's explicit, server-acknowledged completion of the initial review of an OCR-created Expense. It is recorded once; later edits or Receipt changes do not reopen that review or claim that the changed values were checked. It is independent of the Expense's financial status and is not financial approval.
_Avoid_: Expense approval, verified status

**Original currency**:
The currency printed on the receipt, as detected by OCR or entered by the technician.

**EUR amount**:
The canonical EUR reporting value of an expense, advance or mileage record. The denomination does not determine which components a particular report total includes; PDF reimbursement and API reimbursement have different mileage treatment.
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
A payment requested or given to a Technician in advance of expected expenses, later settled against a report.
_Avoid_: pre-payment, avans

**ExpenseReport**:
A formal container grouping Expenses, Advances and MileageRecords for review and reimbursement in EUR. A draft may be empty; submission requires at least one Expense.
_Avoid_: expense folder, expense pack, claim

**Technician**:
An employee who incurs and submits expenses, represented by a User with role `technician`. Exact bank-debit reimbursement is a policy goal; an automatically estimated FX rate alone does not establish the actual bank debit.
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

**Storage context**:
A domain categorization of stored files (`RECEIPT`, `SIGNATURE`, `OCR_SOURCE`) defining per-context rules: allowed file extensions, maximum payload size, magic-byte validation, and relative path construction.
_Avoid_: storage bucket, file category

**OCR service**:
The service responsible for extracting purchase information from receipt uploads.
_Avoid_: scanner service

**AI provider**:
An external or self-hosted service that makes AI models available for receipt OCR or delegation-email parsing.
_Avoid_: engine

**AI model**:
A model made available by an AI provider and configured for a specific application workflow, such as receipt OCR or delegation-email parsing.
_Avoid_: engine, provider

**Model chain**:
The ordered AI models configured for one workflow: the first is primary, and later models are tried as fallbacks until one returns a valid result.
_Avoid_: model list

**Moderator**:
A user with the `mod` role, also labeled “admin” in some parts of the interface. These labels refer to the same role.
_Avoid_: administrator (when referring to a separate role)

**PDF report reimbursement**:
The net settlement amount displayed in the generated Expense Report PDF summary (`totalReimbursable`). By explicit Accounting policy, mileage is excluded from this PDF reimbursement total (`totalEur + allowance - totalAdv`). Mileage is tracked and listed separately in the report, but is not included in the PDF reimbursement settlement.
_Avoid_: reporting mileage exclusion as a bug
