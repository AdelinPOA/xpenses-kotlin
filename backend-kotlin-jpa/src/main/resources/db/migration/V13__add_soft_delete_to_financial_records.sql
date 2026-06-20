-- Migration: Add soft delete columns to financial records

ALTER TABLE expenses
ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN deleted_at TIMESTAMP NULL;

ALTER TABLE expense_reports
ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN deleted_at TIMESTAMP NULL;

ALTER TABLE receipts
ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN deleted_at TIMESTAMP NULL;
