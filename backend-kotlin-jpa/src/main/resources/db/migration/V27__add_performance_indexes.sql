-- V27: Add performance indexes for frequent query paths
CREATE INDEX IF NOT EXISTS idx_expenses_user_status_deleted ON expenses (user_id, status, deleted);
CREATE INDEX IF NOT EXISTS idx_expense_reports_user_status_deleted ON expense_reports (user_id, status, deleted);
CREATE INDEX IF NOT EXISTS idx_fx_rates_currency_date ON fx_rates (from_currency, to_currency, rate_date);
