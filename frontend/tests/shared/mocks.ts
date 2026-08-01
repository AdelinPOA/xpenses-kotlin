import type { Page } from "@playwright/test";

export const USERS = {
  mod: { id: 1, username: "mod1", display_name: "Moderator One", role: "mod", email: "mod1@xpenses.local", active: true, auth_source: "local", created_at: "2025-01-01T00:00:00Z", email_notifications: false },
  manager: { id: 2, username: "manager1", display_name: "Manager One", role: "manager", email: "manager1@xpenses.local", active: true, auth_source: "local", created_at: "2025-01-01T00:00:00Z", email_notifications: true },
  cfo: { id: 3, username: "cfo1", display_name: "CFO One", role: "chef_finance", email: "cfo1@xpenses.local", active: true, auth_source: "local", created_at: "2025-01-01T00:00:00Z", email_notifications: true },
  user: { id: 4, username: "tech1", display_name: "Technician One", role: "technician", email: "tech1@xpenses.local", active: true, auth_source: "local", created_at: "2025-01-01T00:00:00Z", email_notifications: false },
};

export const DASHBOARD_DATA = {
  expense_count_total: 42, expense_count_month: 15, total_month_eur: 12500.5,
  draft_count: 3, submitted_count: 5, paid_count: 12,
  pending_approval_count: 2, pending_payment_count: 4,
  recent_expenses: [
    { id: 1, merchant: "Lidl", amount_original: 85.5, currency_original: "EUR", amount_eur: 85.5, fx_rate: 1, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, category_id: 3, category_name: "Meals", status: "paid", date: "2026-07-14", description: "Team lunch supplies", receipt_path: null, receipts: [], report_id: null, raw_ocr_text: null, user_display_name: null, created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z" },
    { id: 2, merchant: "OMV Petrom", amount_original: 120.0, currency_original: "RON", amount_eur: 24.0, fx_rate: 0.2, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, category_id: 1, category_name: "Transport", status: "submitted", date: "2026-07-13", description: "Car fuel", receipt_path: null, receipts: [], report_id: null, raw_ocr_text: null, user_display_name: null, created_at: "2026-07-13T00:00:00Z", updated_at: "2026-07-13T00:00:00Z" },
    { id: 3, merchant: "Restaurant Vienna", amount_original: 45.0, currency_original: "EUR", amount_eur: 45.0, fx_rate: 1, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, category_id: 2, category_name: "Accommodation", status: "draft", date: "2026-07-12", description: null, receipt_path: null, receipts: [], report_id: null, raw_ocr_text: null, user_display_name: null, created_at: "2026-07-12T00:00:00Z", updated_at: "2026-07-12T00:00:00Z" },
  ],
  spend_by_category: [
    { category_id: 1, category_name: "Transport", total: 3450.0, count: 8 },
    { category_id: 2, category_name: "Accommodation", total: 4200.0, count: 5 },
    { category_id: 3, category_name: "Meals", total: 2100.0, count: 12 },
    { category_id: 4, category_name: "Supplies", total: 1850.5, count: 6 },
    { category_id: 5, category_name: "Other", total: 900.0, count: 3 },
  ],
};

export const MANAGER_DASHBOARD_DATA = {
  kpis: {
    pending_reports_count: 1,
    pending_reports_total_eur: 1250,
    pending_advances_count: 1,
    pending_advances_total_eur: 500,
    monthly_team_spend_eur: 4200,
    avg_turnaround_days: 1.2,
  },
  pending_reports: [
    {
      id: 1,
      title: "July Business Trip",
      user_id: 4,
      user_name: "Technician One",
      date_submitted: "2026-07-16T10:00:00Z",
      date_from: "2026-07-01",
      date_to: "2026-07-15",
      total_amount_eur: 1250,
      expense_count: 1,
      description: "Business trip to Vienna for client meetings",
      status: "submitted",
    },
  ],
  pending_advances: [
    {
      id: 1,
      report_id: 1,
      report_title: "July Business Trip",
      user_id: 4,
      user_name: "Technician One",
      amount_eur: 500,
      description: "Travel advance",
      status: "requested",
      created_at: "2026-07-14T00:00:00Z",
    },
  ],
  recent_activity: [
    {
      id: "report_1",
      type: "report_submitted",
      actor_name: "Technician One",
      target_title: "July Business Trip",
      user_name: "Technician One",
      amount_eur: 1250,
      timestamp: "2026-07-16T10:00:00Z",
    },
  ],
};

export const CATEGORIES = [
  { id: 1, name: "Transport", limit_amount: 5000.0, is_active: true, created_at: "2026-01-01T00:00:00Z" },
  { id: 2, name: "Accommodation", limit_amount: 8000.0, is_active: true, created_at: "2026-01-01T00:00:00Z" },
  { id: 3, name: "Meals", limit_amount: 3000.0, is_active: true, created_at: "2026-01-01T00:00:00Z" },
  { id: 4, name: "Supplies", limit_amount: 2000.0, is_active: true, created_at: "2026-01-01T00:00:00Z" },
  { id: 5, name: "Other", limit_amount: 1000.0, is_active: true, created_at: "2026-01-01T00:00:00Z" },
  { id: 6, name: "Fuel", limit_amount: 1500.0, is_active: false, created_at: "2026-01-01T00:00:00Z" },
];

export const EXPENSES: Array<Record<string, unknown>> = [
  { id: 1, merchant: "Lidl", amount_original: 85.5, currency_original: "EUR", amount_eur: 85.5, fx_rate: 1, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, category_id: 3, category_name: "Meals", status: "paid", date: "2026-07-14", description: "Team lunch supplies", receipt_path: null, receipts: [], receipt_count: 1, report_id: null, raw_ocr_text: null, user_display_name: null, created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z" },
  { id: 2, merchant: "OMV Petrom", amount_original: 120.0, currency_original: "RON", amount_eur: 24.0, fx_rate: 0.2, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, category_id: 1, category_name: "Transport", status: "draft", date: "2026-07-13", description: "Car fuel", receipt_path: null, receipts: [], receipt_count: 0, report_id: null, raw_ocr_text: null, user_display_name: null, created_at: "2026-07-13T00:00:00Z", updated_at: "2026-07-13T00:00:00Z" },
  { id: 3, merchant: "Hotel Ibis", amount_original: 350.0, currency_original: "EUR", amount_eur: 350.0, fx_rate: 1, fx_rate_manual: false, tax_amount: 0, tax_rate: null, tax_amount_eur: 0, category_id: 2, category_name: "Accommodation", status: "submitted", date: "2026-07-10", description: "3 nights business trip", receipt_path: null, receipts: [], receipt_count: 1, report_id: 1, raw_ocr_text: null, user_display_name: null, created_at: "2026-07-10T00:00:00Z", updated_at: "2026-07-10T00:00:00Z" },
];

export const REPORTS = [
  { id: 1, title: "July Business Trip", status: "submitted", total_amount: 1250.0, currency: "EUR", date_from: "2026-07-01", date_to: "2026-07-15", user_id: 4, user_display_name: "Technician One", submitted_at: "2026-07-16T10:00:00Z", expenses: [EXPENSES[2]], advances: [], mileage_records: [], total_advances: 0, total_mileage_eur: 0, daily_allowance: 0, total_reimbursable: 1250.0, description: null, paid_at: null, approved_by: null, approved_at: null, rejected_reason: null, signer_id: null, signed_at: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-16T10:00:00Z" },
  { id: 2, title: "Office Supplies June", status: "draft", total_amount: 430.5, currency: "EUR", date_from: "2026-06-01", date_to: "2026-06-30", user_id: 4, user_display_name: "Technician One", submitted_at: null, expenses: [], advances: [], mileage_records: [], total_advances: 0, total_mileage_eur: 0, daily_allowance: 0, total_reimbursable: 0, description: null, paid_at: null, approved_by: null, approved_at: null, rejected_reason: null, signer_id: null, signed_at: null, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z" },
  { id: 3, title: "Client Visit Berlin", status: "approved", total_amount: 3200.0, currency: "EUR", date_from: "2026-05-10", date_to: "2026-05-14", user_id: 2, user_display_name: "Manager One", submitted_at: "2026-05-15T08:00:00Z", expenses: [EXPENSES[0], EXPENSES[2]], advances: [], mileage_records: [], total_advances: 0, total_mileage_eur: 0, daily_allowance: 180.0, total_reimbursable: 3200.0, description: null, paid_at: null, approved_by: null, approved_at: null, rejected_reason: null, signer_id: null, signed_at: null, created_at: "2026-05-10T00:00:00Z", updated_at: "2026-05-15T08:00:00Z" },
];

export const REPORT_DETAIL = {
  id: 1, title: "July Business Trip", status: "submitted", total_amount: 1250.0, currency: "EUR", total_reimbursable: 1250.0, daily_allowance: 180.0,
  date_from: "2026-07-01", date_to: "2026-07-15", description: "Business trip to Vienna for client meetings",
  user_id: 4, user_display_name: "Technician One",
  submitted_at: "2026-07-16T10:00:00Z", approved_at: null, paid_at: null, approved_by: null, rejected_reason: null, rejected_at: null, rejected_by: null, signer_id: null, signed_at: null,
  kundenauftrag: "0007038319", auftragsart: "KR20", positionstyp: "Mechanical installation",
  technplatz_raw: "C374981", technplatz_line: false,
  vorgang: "0545", arbeitsplatz: "ER_MT", techniker: "Popescu Adelin",
  kunde_code: null, kunde_name: null, adresse: null,
  expenses: EXPENSES, advances: [], mileage_records: [], total_advances: 0, total_mileage_eur: 0,
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-16T10:00:00Z",
};

export const EMAIL_SETTINGS = { emails_enabled: true, smtp_host: "smtp.example.com", smtp_port: 587, smtp_user: "noreply@example.com", smtp_from: "noreply@example.com", password_set: true };

export const IMAP_SETTINGS = { enabled: true, imap_host: "imap.example.com", imap_port: 993, imap_user: "import@example.com", password_set: true, imap_folder: "INBOX" };

export const LDAP_SETTINGS = { enabled: true, host: "ldap.example.com", port: 389, use_tls: false, bind_dn: "cn=admin,dc=example,dc=com", bind_password: "***", base_dn: "dc=example,dc=com", user_filter: "(uid={0})", attr_username: "uid", attr_email: "mail", attr_display_name: "displayName", attr_role: "memberOf", role_map: { user: "cn=employee,ou=groups,dc=example,dc=com", manager: "cn=manager,ou=groups,dc=example,dc=com" }, default_role: "technician" };

export const OCR_SETTINGS = { ocr_enabled: true, provider: "gemini-3.1-flash-lite", gemini_api_key: "••••••••" };

export const STORAGE_SETTINGS = { provider_type: "local", local: { path: "/app/data/receipts" } };

export const MILEAGE_RATES = { mileage_rate_before_tax: 0.42, mileage_rate_after_tax: 0.35 };

export const DAILY_ALLOWANCE_RATE = { daily_allowance_rate: 45.0 };

export const USERS_LIST = Object.values(USERS);

export async function setupCommonMocks(page: Page, opts?: { role?: keyof typeof USERS }) {
  const role = opts?.role ?? "mod";
  const user = USERS[role];
  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
  ]);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: { access_token: "new-mock-token" } }));
  await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
  await page.route("**/api/expenses**", (route) => route.fulfill({ json: EXPENSES }));
  await page.route("**/api/reports**", (route) => route.fulfill({ json: REPORTS }));
  await page.route("**/api/dashboard**", (route, req) => {
    if (new URL(req.url()).pathname.endsWith("/api/dashboard/manager")) {
      route.fulfill({ json: MANAGER_DASHBOARD_DATA });
      return;
    }
    route.fulfill({ json: DASHBOARD_DATA });
  });
  await setupAdminMocks(page);
}

export async function setupAdminMocks(page: Page) {
  await page.route("**/api/settings/email", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: EMAIL_SETTINGS });
    else route.fulfill({ status: 200, json: EMAIL_SETTINGS });
  });
  await page.route("**/api/settings/email/test", (route) => route.fulfill({ json: { success: true, message: "Test email sent" } }));
  await page.route("**/api/settings/imap", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: IMAP_SETTINGS });
    else route.fulfill({ status: 200, json: IMAP_SETTINGS });
  });
  await page.route("**/api/settings/imap/test", (route) => route.fulfill({ json: { success: true, message: "IMAP connection successful" } }));
  await page.route("**/api/settings/imap/simulate", (route) => route.fulfill({ json: { local: { parsed: true, expense_count: 2 }, gemini: { parsed: true, expense_count: 2 } } }));
  await page.route("**/api/settings/ldap", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: LDAP_SETTINGS });
    else route.fulfill({ status: 200, json: LDAP_SETTINGS });
  });
  await page.route("**/api/settings/ldap/test", (route) => route.fulfill({ json: { ok: true, preview: [{ username: "jdoe", email: "jdoe@example.com", display_name: "John Doe" }] } }));
  await page.route("**/api/settings/ldap/sync", (route) => route.fulfill({ json: { ok: true, created: 5, updated: 2, deactivated: 1 } }));
  await page.route("**/api/settings/ocr", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: OCR_SETTINGS });
    else route.fulfill({ status: 200, json: OCR_SETTINGS });
  });
  await page.route("**/api/settings/ocr/test", (route) => route.fulfill({ json: { success: true, message: "Gemini API key valid" } }));
  await page.route("**/api/settings/storage", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: STORAGE_SETTINGS });
    else route.fulfill({ status: 200, json: STORAGE_SETTINGS });
  });
  await page.route("**/api/settings/storage/test", (route) => route.fulfill({ json: { success: true, message: "Storage connection OK" } }));
  await page.route("**/api/settings/storage/migration-status", (route) => route.fulfill({ json: { migrating: false, progress: 100, total: 0, errors: [] } }));
  await page.route("**/api/settings/daily-allowance-rate*", (route) => route.fulfill({ json: DAILY_ALLOWANCE_RATE }));
  await page.route("**/api/settings/mileage-rates*", (route) => route.fulfill({ json: MILEAGE_RATES }));
  await page.route("**/api/ocr/comparison", (route) => route.fulfill({ json: { history: [], stats: { total_scanned: 0, gemini_amount_accuracy: 0, gemini_date_accuracy: 0, gemini_merchant_accuracy: 0, gemini_category_accuracy: 0 } } }));
  await page.route("**/api/categories**", (route) => route.fulfill({ json: CATEGORIES }));
  await page.route("**/api/users**", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: USERS_LIST });
    else route.fulfill({ status: 201, json: { id: 99 } });
  });
}

export async function setupAuthMocks(page: Page, role: keyof typeof USERS = "mod") {
  const user = USERS[role];
  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", url: "http://localhost:3001" },
    { name: "refresh_token", value: "mock-refresh-token", url: "http://localhost:3001" },
  ]);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: { access_token: "new-mock-token" } }));
}

export async function setupInventoryMocks(page: Page) {
  await page.route("**/api/inventory**", (route, req) => {
    const url = new URL(req.url());
    if (url.pathname.includes("/requests")) {
      route.fulfill({ json: [] });
    } else {
      route.fulfill({ json: [{ id: 1, name: "Laptop Dell", serial_number: "SN-001", category: "Electronics", status: "active", assigned_to: "tech1" }] });
    }
  });
}

export async function setupInsuranceMocks(page: Page) {
  await page.route("**/api/insurance**", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: [{ id: 1, filename: "policy_2026.pdf", title: "Health Insurance 2026", uploaded_by: "mod1", uploaded_at: "2026-01-15T10:00:00Z" }] });
    else route.fulfill({ status: 201, json: { id: 99 } });
  });
}
