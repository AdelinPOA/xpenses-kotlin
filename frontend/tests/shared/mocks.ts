import type { Page } from "@playwright/test";

export const USERS = {
  mod: { id: 1, username: "mod1", display_name: "Moderator One", role: "mod", email: "mod1@xpenses.local", active: true, auth_source: "local", created_at: "2025-01-01T00:00:00Z", email_notifications: false },
  manager: { id: 2, username: "manager1", display_name: "Manager One", role: "manager", email: "manager1@xpenses.local", active: true, auth_source: "local", created_at: "2025-01-01T00:00:00Z", email_notifications: true },
  cfo: { id: 3, username: "cfo1", display_name: "CFO One", role: "chef_finance", email: "cfo1@xpenses.local", active: true, auth_source: "local", created_at: "2025-01-01T00:00:00Z", email_notifications: true },
  user: { id: 4, username: "tech1", display_name: "Technician One", role: "technician", email: "tech1@xpenses.local", active: true, auth_source: "local", created_at: "2025-01-01T00:00:00Z", email_notifications: false },
};

export const DASHBOARD_DATA = {
  month_spend: 12500.5, draft_reports: 3, submitted_reports: 5, paid_reports: 12,
  recent_expenses: [
    { id: 1, merchant: "Lidl", amount: 85.5, currency: "EUR", status: "paid", date: "2026-07-14" },
    { id: 2, merchant: "OMV Petrom", amount: 120.0, currency: "RON", status: "submitted", date: "2026-07-13" },
    { id: 3, merchant: "Restaurant Vienna", amount: 45.0, currency: "EUR", status: "draft", date: "2026-07-12" },
  ],
  spend_by_category: [
    { category: "Transport", amount: 3450.0, percentage: 28 },
    { category: "Accommodation", amount: 4200.0, percentage: 34 },
    { category: "Meals", amount: 2100.0, percentage: 17 },
    { category: "Supplies", amount: 1850.5, percentage: 15 },
    { category: "Other", amount: 900.0, percentage: 7 },
  ],
};

export const CATEGORIES = [
  { id: 1, name: "Transport", spending_limit: 5000.0, active: true },
  { id: 2, name: "Accommodation", spending_limit: 8000.0, active: true },
  { id: 3, name: "Meals", spending_limit: 3000.0, active: true },
  { id: 4, name: "Supplies", spending_limit: 2000.0, active: true },
  { id: 5, name: "Other", spending_limit: 1000.0, active: true },
  { id: 6, name: "Fuel", spending_limit: 1500.0, active: false },
];

export const EXPENSES = [
  { id: 1, merchant: "Lidl", amount: 85.5, currency: "EUR", category_id: 3, category_name: "Meals", status: "paid", date: "2026-07-14", description: "Team lunch supplies", receipt_count: 1, report_id: null, reimbursable: true },
  { id: 2, merchant: "OMV Petrom", amount: 120.0, currency: "RON", category_id: 1, category_name: "Transport", status: "draft", date: "2026-07-13", description: "Car fuel", receipt_count: 0, report_id: null, reimbursable: true },
  { id: 3, merchant: "Hotel Ibis", amount: 350.0, currency: "EUR", category_id: 2, category_name: "Accommodation", status: "submitted", date: "2026-07-10", description: "3 nights business trip", receipt_count: 1, report_id: 1, reimbursable: true },
];

export const REPORTS = [
  { id: 1, title: "July Business Trip", status: "submitted", total: 1250.0, currency: "EUR", date_from: "2026-07-01", date_to: "2026-07-15", created_by: "tech1", submitted_at: "2026-07-16T10:00:00Z", expense_count: 5 },
  { id: 2, title: "Office Supplies June", status: "draft", total: 430.5, currency: "EUR", date_from: "2026-06-01", date_to: "2026-06-30", created_by: "tech1", submitted_at: null, expense_count: 3 },
  { id: 3, title: "Client Visit Berlin", status: "approved", total: 3200.0, currency: "EUR", date_from: "2026-05-10", date_to: "2026-05-14", created_by: "manager1", submitted_at: "2026-05-15T08:00:00Z", expense_count: 8 },
];

export const REPORT_DETAIL = {
  id: 1, title: "July Business Trip", status: "submitted", total: 1250.0, currency: "EUR", reimbursable: 1250.0, daily_allowance: 180.0,
  date_from: "2026-07-01", date_to: "2026-07-15", description: "Business trip to Vienna for client meetings",
  created_by: { username: "tech1", display_name: "Technician One" },
  submitted_at: "2026-07-16T10:00:00Z", approved_at: null, paid_at: null, rejection_reason: null,
  delegation: {
    delegation_kundenauftrag: "0007038319", delegation_auftragsart: "KR20", delegation_positionstyp: "Mechanical installation",
    delegation_start: "2026-07-01", delegation_end: "2026-07-15", delegation_vorgang: "0545",
    delegation_arbeitsplatz: "ER_MT", delegation_techniker: "Popescu Adelin", delegation_technplatz: "C374981",
  },
  expenses: EXPENSES, advances: [], mileage: [],
};

export const EMAIL_SETTINGS = { emails_enabled: true, smtp_host: "smtp.example.com", smtp_port: 587, smtp_user: "noreply@example.com", smtp_from: "noreply@example.com", password_set: true };

export const IMAP_SETTINGS = { enabled: true, imap_host: "imap.example.com", imap_port: 993, imap_user: "import@example.com", password_set: true, imap_folder: "INBOX" };

export const LDAP_SETTINGS = { enabled: true, host: "ldap.example.com", port: 389, use_tls: false, bind_dn: "cn=admin,dc=example,dc=com", bind_password: "***", base_dn: "dc=example,dc=com", user_filter: "(uid={0})", attr_username: "uid", attr_email: "mail", attr_display_name: "displayName", attr_role: "memberOf", role_map: { user: "cn=employee,ou=groups,dc=example,dc=com", manager: "cn=manager,ou=groups,dc=example,dc=com" }, default_role: "technician" };

export const OCR_SETTINGS = { ocr_enabled: true, provider: "gemini-3.1-flash-lite", gemini_api_key: "••••••••" };

export const STORAGE_SETTINGS = { provider_type: "local", local: { path: "/app/data/receipts" } };

export const MILEAGE_RATES = { mileage_rate_before_tax: 0.42, mileage_rate_after_tax: 0.35 };

export const DAILY_ALLOWANCE_RATE = { daily_allowance_rate: 45.0 };

export const USERS_LIST = Object.values(USERS);

export async function setupCommonMocks(page: Page) {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: USERS.mod }));
  await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
  await page.route("**/api/expenses", (route) => route.fulfill({ json: EXPENSES }));
  await page.route("**/api/reports", (route) => route.fulfill({ json: REPORTS }));
  await page.route("**/api/dashboard", (route) => route.fulfill({ json: DASHBOARD_DATA }));
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
  await page.route("**/api/categories", (route) => route.fulfill({ json: CATEGORIES }));
  await page.route("**/api/users", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: USERS_LIST });
    else route.fulfill({ status: 201, json: { id: 99 } });
  });
}

export async function setupAuthMocks(page: Page, role: keyof typeof USERS = "mod") {
  const user = USERS[role];
  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", domain: "localhost", path: "/" },
    { name: "refresh_token", value: "mock-refresh-token", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: { access_token: "new-mock-token" } }));
}

export async function setupInventoryMocks(page: Page) {
  await page.route("**/api/inventory", (route, req) => {
    const url = new URL(req.url());
    if (url.pathname.includes("/requests")) {
      route.fulfill({ json: [] });
    } else {
      route.fulfill({ json: [{ id: 1, name: "Laptop Dell", serial_number: "SN-001", category: "Electronics", status: "active", assigned_to: "tech1" }] });
    }
  });
  await page.route("**/api/inventory/requests", (route) => route.fulfill({ json: [] }));
}

export async function setupInsuranceMocks(page: Page) {
  await page.route("**/api/insurance", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: [{ id: 1, filename: "policy_2026.pdf", title: "Health Insurance 2026", uploaded_by: "mod1", uploaded_at: "2026-01-15T10:00:00Z" }] });
    else route.fulfill({ status: 201, json: { id: 99 } });
  });
}
