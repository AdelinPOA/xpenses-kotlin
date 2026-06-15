CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    limit_amount DOUBLE PRECISION,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    display_name  VARCHAR(200) NOT NULL,
    email         VARCHAR(200),
    password_hash VARCHAR(200),
    auth_source   VARCHAR(20) NOT NULL DEFAULT 'local',
    role          VARCHAR(20) NOT NULL DEFAULT 'technician',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    signature_path TEXT,
    notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expense_reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    date_from TEXT,
    date_to TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    signer_id INTEGER REFERENCES users(id),
    signed_at TIMESTAMPTZ,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejected_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    category_id INTEGER REFERENCES categories(id),
    report_id INTEGER REFERENCES expense_reports(id),
    amount_original DOUBLE PRECISION NOT NULL,
    currency_original TEXT NOT NULL DEFAULT 'EUR',
    amount_eur DOUBLE PRECISION NOT NULL,
    fx_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    tax_amount NUMERIC NOT NULL DEFAULT 0.0,
    tax_rate NUMERIC,
    tax_amount_eur NUMERIC NOT NULL DEFAULT 0.0,
    date TEXT NOT NULL,
    description TEXT,
    merchant TEXT,
    receipt_path TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE receipts (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    original_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fx_rates (
    id SERIAL PRIMARY KEY,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate_date TEXT NOT NULL,
    rate DOUBLE PRECISION NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_currency, to_currency, rate_date)
);

CREATE TABLE refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(200) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE advance_payments (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount_original DOUBLE PRECISION NOT NULL,
    currency_original TEXT NOT NULL DEFAULT 'EUR',
    amount_eur DOUBLE PRECISION NOT NULL,
    fx_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    date TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'paid',
    requested_amount DOUBLE PRECISION,
    requested_currency TEXT,
    paid_by INTEGER REFERENCES users(id),
    paid_at TIMESTAMPTZ,
    rejected_by INTEGER REFERENCES users(id),
    rejected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mileage_records (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    rate_before_tax DOUBLE PRECISION NOT NULL,
    rate_after_tax DOUBLE PRECISION NOT NULL,
    amount_before_tax DOUBLE PRECISION NOT NULL,
    amount_eur DOUBLE PRECISION NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receipts_expense ON receipts(expense_id);
CREATE INDEX idx_expenses_report ON expenses(report_id);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_user ON expenses(user_id);
CREATE INDEX idx_reports_status ON expense_reports(status);
CREATE INDEX idx_reports_user ON expense_reports(user_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_advance_payments_report ON advance_payments(report_id);
CREATE INDEX idx_advance_payments_user ON advance_payments(user_id);
CREATE INDEX idx_advance_payments_status ON advance_payments(status);
CREATE INDEX idx_mileage_records_report ON mileage_records(report_id);
