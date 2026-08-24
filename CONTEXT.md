# Xpenses

Expense management for a field-service organization: technicians submit receipts, expenses and advance payments are reviewed by finance and reimbursed.

## Language

**Receipt**:
A proof-of-purchase document (paper or electronic) uploaded by a technician. Contains at least an amount and a currency.
_Avoid_: recipe

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

**Technician**:
An employee who incurs and submits expenses. A `User` with role `technician`; reimbursed for the exact EUR amount debited from their bank account.
_Avoid_: employee, worker, user
