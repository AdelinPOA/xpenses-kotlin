# Implementation Plan: Tax & VAT Tracking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Step 1: Database Migration
- [ ] Edit `backend/xpenses/database.py` in `init_db()`.
- [ ] Add `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0.0;`
- [ ] Add `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_rate NUMERIC;`
- [ ] Add `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_amount_eur NUMERIC NOT NULL DEFAULT 0.0;`

## Step 2: Backend Models & Routers
- [ ] Edit `backend/xpenses/models.py`: add `tax_amount`, `tax_rate`, `tax_amount_eur` to `ExpenseBase` and `ExpenseOut`.
- [ ] Edit `backend/xpenses/routers/expenses.py`: When creating/updating, compute `tax_amount_eur = tax_amount / fx_rate`.
- [ ] Run backend tests (`make test`) and fix any broken tests (e.g., test mocks or DB inserts).

## Step 3: OCR Enhancements
- [ ] Edit `backend/xpenses/services/ocr_service.py` to add `extract_tax()`.
- [ ] Update `scan_receipt` to return `tax_amount` and `tax_rate`.
- [ ] Update `OCRScanResponse` in `models.py`.
- [ ] Run `pytest tests/test_ocr.py`.

## Step 4: Frontend UI
- [ ] Edit `frontend/lib/api.ts` to add tax fields to `Expense` and `OCRScanResult`.
- [ ] Edit `frontend/components/expenses/ExpenseForm.tsx` to include UI for Tax Rate and Tax Amount.
- [ ] Edit `frontend/app/expenses/page.tsx` or components to display tax data if necessary.
