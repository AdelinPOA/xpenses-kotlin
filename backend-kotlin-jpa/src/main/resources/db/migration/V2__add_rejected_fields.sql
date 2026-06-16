ALTER TABLE expense_reports
    ADD COLUMN rejected_by INTEGER REFERENCES users(id),
    ADD COLUMN rejected_at TIMESTAMPTZ;
