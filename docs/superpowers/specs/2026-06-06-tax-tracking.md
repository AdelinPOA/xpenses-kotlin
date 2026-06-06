# Specification: Tax & VAT Tracking

## Overview
Currently, the application only tracks the `amount` (total value) of an expense. To support proper accounting, we need to track the Tax (VAT) amount separately from the base value, allowing finance teams to calculate deductions.

## Requirements
1. **Database Level**
   - Add `tax_amount` (NUMERIC, default 0.0) to `expenses`.
   - Add `tax_rate` (NUMERIC, nullable, default 0.0) to `expenses`.
   - Add `tax_amount_eur` (NUMERIC, default 0.0) to `expenses` to keep consistent multi-currency reporting.

2. **Backend API**
   - Update all Pydantic schemas (`ExpenseCreate`, `ExpenseUpdate`, `ExpenseOut`) in `models.py`.
   - In `routers/expenses.py`, compute `tax_amount_eur` automatically when saving or updating using the current `fx_rate` of the expense.

3. **OCR Integration**
   - Enhance `ocr_service.py` to add `extract_tax(lines)` which looks for keywords like "VAT", "TVA", "Tax", or percentage signs (%).
   - Return `tax_amount` and `tax_rate` in `/api/ocr/scan` response.

4. **Frontend UI**
   - Add "Tax Rate (%)" and "Tax Amount" fields to `ExpenseForm.tsx`.
   - The fields should ideally auto-sync (if the user types a rate and a total, we calculate the tax amount).
   - Display the tax values in the expense list and detail views.
