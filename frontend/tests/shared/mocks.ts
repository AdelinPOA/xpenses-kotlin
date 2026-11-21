import type { Page } from "@playwright/test";
import type { OcrConfigUpdate, OcrProviderUpdate } from "../../lib/types/admin";
import type { DelegationParsingConfig } from "../../lib/types/delegationParsing";

export const APP_ORIGIN =
  process.env.PLAYWRIGHT_ORIGIN ??
  (process.env.PLAYWRIGHT_PORT
    ? `http://localhost:${process.env.PLAYWRIGHT_PORT}`
    : "http://localhost:3100");

export const USERS = {
  mod: {
    id: 1,
    username: "mod1",
    display_name: "Moderator One",
    role: "mod",
    email: "mod1@xpenses.local",
    active: true,
    auth_source: "local",
    created_at: "2025-01-01T00:00:00Z",
    email_notifications: false,
  },
  manager: {
    id: 2,
    username: "manager1",
    display_name: "Manager One",
    role: "manager",
    email: "manager1@xpenses.local",
    active: true,
    auth_source: "local",
    created_at: "2025-01-01T00:00:00Z",
    email_notifications: true,
  },
  cfo: {
    id: 3,
    username: "cfo1",
    display_name: "CFO One",
    role: "chef_finance",
    email: "cfo1@xpenses.local",
    active: true,
    auth_source: "local",
    created_at: "2025-01-01T00:00:00Z",
    email_notifications: true,
  },
  user: {
    id: 4,
    username: "tech1",
    display_name: "Technician One",
    role: "technician",
    email: "tech1@xpenses.local",
    active: true,
    auth_source: "local",
    created_at: "2025-01-01T00:00:00Z",
    email_notifications: false,
  },
};

export const DASHBOARD_DATA = {
  expense_count_total: 42,
  expense_count_month: 15,
  total_month_eur: 12500.5,
  draft_count: 3,
  submitted_count: 5,
  paid_count: 12,
  pending_approval_count: 2,
  pending_payment_count: 4,
  recent_expenses: [
    {
      id: 1,
      merchant: "Lidl",
      amount_original: 85.5,
      currency_original: "EUR",
      amount_eur: 85.5,
      fx_rate: 1,
      fx_rate_manual: false,
      tax_amount: 0,
      tax_rate: null,
      tax_amount_eur: 0,
      category_id: 3,
      category_name: "Meals",
      status: "paid",
      date: "2026-07-14",
      description: "Team lunch supplies",
      receipt_path: null,
      receipts: [],
      report_id: null,
      raw_ocr_text: null,
      user_display_name: null,
      created_at: "2026-07-14T00:00:00Z",
      updated_at: "2026-07-14T00:00:00Z",
    },
    {
      id: 2,
      merchant: "OMV Petrom",
      amount_original: 120.0,
      currency_original: "RON",
      amount_eur: 24.0,
      fx_rate: 0.2,
      fx_rate_manual: false,
      tax_amount: 0,
      tax_rate: null,
      tax_amount_eur: 0,
      category_id: 1,
      category_name: "Transport",
      status: "submitted",
      date: "2026-07-13",
      description: "Car fuel",
      receipt_path: null,
      receipts: [],
      report_id: null,
      raw_ocr_text: null,
      user_display_name: null,
      created_at: "2026-07-13T00:00:00Z",
      updated_at: "2026-07-13T00:00:00Z",
    },
    {
      id: 3,
      merchant: "Restaurant Vienna",
      amount_original: 45.0,
      currency_original: "EUR",
      amount_eur: 45.0,
      fx_rate: 1,
      fx_rate_manual: false,
      tax_amount: 0,
      tax_rate: null,
      tax_amount_eur: 0,
      category_id: 2,
      category_name: "Accommodation",
      status: "draft",
      date: "2026-07-12",
      description: null,
      receipt_path: null,
      receipts: [],
      report_id: null,
      raw_ocr_text: null,
      user_display_name: null,
      created_at: "2026-07-12T00:00:00Z",
      updated_at: "2026-07-12T00:00:00Z",
    },
  ],
  spend_by_category: [
    { category_id: 1, category_name: "Transport", total: 3450.0, count: 8 },
    { category_id: 2, category_name: "Accommodation", total: 4200.0, count: 5 },
    { category_id: 3, category_name: "Meals", total: 2100.0, count: 12 },
    { category_id: 4, category_name: "Supplies", total: 1850.5, count: 6 },
    { category_id: 5, category_name: "Other", total: 900.0, count: 3 },
  ],
};

export const REVIEW_QUEUE = [
  {
    id: 1,
    title: "July Business Trip",
    user_id: 4,
    user_name: "Technician One",
    date_submitted: "2026-07-16T10:00:00Z",
    date_from: "2026-07-01",
    date_to: "2026-07-15",
    expense_count: 1,
    total_amount_eur: 1250,
    currency: "EUR",
    description: "Business trip to Vienna for client meetings",
    status: "submitted",
  },
];

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
      currency: "EUR",
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
  {
    id: 1,
    name: "Transport",
    limit_amount: 5000.0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Accommodation",
    limit_amount: 8000.0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 3,
    name: "Meals",
    limit_amount: 3000.0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 4,
    name: "Supplies",
    limit_amount: 2000.0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 5,
    name: "Other",
    limit_amount: 1000.0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 6,
    name: "Fuel",
    limit_amount: 1500.0,
    is_active: false,
    created_at: "2026-01-01T00:00:00Z",
  },
];

export const EXPENSES: Array<Record<string, unknown>> = [
  {
    id: 1,
    merchant: "Lidl",
    amount_original: 85.5,
    currency_original: "EUR",
    amount_eur: 85.5,
    fx_rate: 1,
    fx_rate_manual: false,
    tax_amount: 0,
    tax_rate: null,
    tax_amount_eur: 0,
    category_id: 3,
    category_name: "Meals",
    status: "paid",
    date: "2026-07-14",
    description: "Team lunch supplies",
    receipt_path: null,
    receipts: [],
    receipt_count: 1,
    report_id: null,
    raw_ocr_text: null,
    user_display_name: null,
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
  },
  {
    id: 2,
    merchant: "OMV Petrom",
    amount_original: 120.0,
    currency_original: "RON",
    amount_eur: 24.0,
    fx_rate: 0.2,
    fx_rate_manual: false,
    tax_amount: 0,
    tax_rate: null,
    tax_amount_eur: 0,
    category_id: 1,
    category_name: "Transport",
    status: "draft",
    date: "2026-07-13",
    description: "Car fuel",
    receipt_path: null,
    receipts: [],
    receipt_count: 0,
    report_id: null,
    raw_ocr_text: null,
    user_display_name: null,
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
  },
  {
    id: 3,
    merchant: "Hotel Ibis",
    amount_original: 350.0,
    currency_original: "EUR",
    amount_eur: 350.0,
    fx_rate: 1,
    fx_rate_manual: false,
    tax_amount: 0,
    tax_rate: null,
    tax_amount_eur: 0,
    category_id: 2,
    category_name: "Accommodation",
    status: "submitted",
    date: "2026-07-10",
    description: "3 nights business trip",
    receipt_path: null,
    receipts: [],
    receipt_count: 1,
    report_id: 1,
    raw_ocr_text: null,
    user_display_name: null,
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
  },
];

export const REPORTS = [
  {
    id: 1,
    title: "July Business Trip",
    status: "submitted",
    total_amount: 1250.0,
    currency: "EUR",
    date_from: "2026-07-01",
    date_to: "2026-07-15",
    user_id: 4,
    user_display_name: "Technician One",
    submitted_at: "2026-07-16T10:00:00Z",
    expenses: [EXPENSES[2]],
    advances: [],
    mileage_records: [],
    total_advances: 0,
    total_mileage_eur: 0,
    daily_allowance: 0,
    total_reimbursable: 1250.0,
    description: null,
    paid_at: null,
    approved_by: null,
    approved_at: null,
    rejected_reason: null,
    signer_id: null,
    signed_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-16T10:00:00Z",
  },
  {
    id: 2,
    title: "Office Supplies June",
    status: "draft",
    total_amount: 430.5,
    currency: "EUR",
    date_from: "2026-06-01",
    date_to: "2026-06-30",
    user_id: 4,
    user_display_name: "Technician One",
    submitted_at: null,
    expenses: [],
    advances: [],
    mileage_records: [],
    total_advances: 0,
    total_mileage_eur: 0,
    daily_allowance: 0,
    total_reimbursable: 0,
    description: null,
    paid_at: null,
    approved_by: null,
    approved_at: null,
    rejected_reason: null,
    signer_id: null,
    signed_at: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  },
  {
    id: 3,
    title: "Client Visit Berlin",
    status: "approved",
    total_amount: 3200.0,
    currency: "EUR",
    date_from: "2026-05-10",
    date_to: "2026-05-14",
    user_id: 2,
    user_display_name: "Manager One",
    submitted_at: "2026-05-15T08:00:00Z",
    expenses: [EXPENSES[0], EXPENSES[2]],
    advances: [],
    mileage_records: [],
    total_advances: 0,
    total_mileage_eur: 0,
    daily_allowance: 180.0,
    total_reimbursable: 3200.0,
    description: null,
    paid_at: null,
    approved_by: null,
    approved_at: null,
    rejected_reason: null,
    signer_id: null,
    signed_at: null,
    created_at: "2026-05-10T00:00:00Z",
    updated_at: "2026-05-15T08:00:00Z",
  },
];

export const REPORT_DETAIL = {
  id: 1,
  title: "July Business Trip",
  status: "submitted",
  total_amount: 1250.0,
  currency: "EUR",
  total_reimbursable: 1250.0,
  daily_allowance: 180.0,
  date_from: "2026-07-01",
  date_to: "2026-07-15",
  description: "Business trip to Vienna for client meetings",
  user_id: 4,
  user_display_name: "Technician One",
  submitted_at: "2026-07-16T10:00:00Z",
  approved_at: null,
  paid_at: null,
  approved_by: null,
  rejected_reason: null,
  rejected_at: null,
  rejected_by: null,
  signer_id: null,
  signed_at: null,
  kundenauftrag: "0007038319",
  auftragsart: "KR20",
  positionstyp: "Mechanical installation",
  technplatz_raw: "C374981",
  technplatz_line: false,
  vorgang: "0545",
  arbeitsplatz: "ER_MT",
  techniker: "Popescu Adelin",
  kunde_code: null,
  kunde_name: null,
  adresse: null,
  expenses: EXPENSES,
  advances: [],
  mileage_records: [],
  total_advances: 0,
  total_mileage_eur: 0,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-16T10:00:00Z",
};

export const EMAIL_SETTINGS = {
  emails_enabled: true,
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "noreply@example.com",
  smtp_from: "noreply@example.com",
  password_set: true,
};

export const IMAP_SETTINGS = {
  enabled: true,
  imap_host: "imap.example.com",
  imap_port: 993,
  imap_user: "import@example.com",
  password_set: true,
  imap_folder: "INBOX",
};

export const DELEGATION_PARSING_SETTINGS: DelegationParsingConfig = {
  instructions: "Extract delegation details in English. Preserve names and order numbers.",
  examples: "Auftrag 905652178 → Order nr: 905652178",
  output_instructions: "Start the description with Order nr, then use one English field per line.",
};

export const LDAP_SETTINGS = {
  enabled: true,
  host: "ldap.example.com",
  port: 389,
  use_tls: false,
  bind_dn: "cn=admin,dc=example,dc=com",
  bind_password: "***",
  base_dn: "dc=example,dc=com",
  user_filter: "(uid={0})",
  attr_username: "uid",
  attr_email: "mail",
  attr_display_name: "displayName",
  attr_role: "memberOf",
  role_map: {
    user: "cn=employee,ou=groups,dc=example,dc=com",
    manager: "cn=manager,ou=groups,dc=example,dc=com",
  },
  default_role: "technician",
};

export const OCR_SETTINGS = {
  ocr_enabled: true,
  providers: [
    {
      id: "provider-1",
      name: "Demo Provider",
      base_url: "https://api.example.com/v1",
      api_key_set: true,
    },
  ],
  models: [
    {
      id: "model-1",
      provider_id: "provider-1",
      model_id: "vision-model-v1",
      display_name: "Vision Model V1",
      active: true,
      tested: true,
    },
  ],
  receipt_model_chain: ["model-1"],
  delegation_model_chain: ["model-1"],
};

export const STORAGE_SETTINGS = {
  provider_type: "local",
  local: { path: "/app/data/receipts" },
};

export const MILEAGE_RATES = {
  mileage_rate_before_tax: 0.42,
  mileage_rate_after_tax: 0.35,
  fuel_consumption_l_per_100km: 6.5,
  fuel_price_ron_per_liter: 7.2,
  pension_rate: 0.25,
  health_rate: 0.1,
  income_tax_rate: 0.1,
  tax_deduction_eur: 50.0,
};

export const DAILY_ALLOWANCE_RATE = { daily_allowance_rate: 45.0 };

export const MOBILE_UI_SETTINGS = { mobile_quick_add_fab_enabled: false };

export const FX_MARGINS = {
  margins: { EUR: 2.0, USD: 2.5, GBP: 2.0, CHF: 2.0, RON: 0.0 },
  default_margin: 2.0,
  currencies: ["EUR", "USD", "GBP", "CHF", "RON"],
};

export const USERS_LIST = Object.values(USERS);

export async function setupCommonMocks(
  page: Page,
  opts?: { role?: keyof typeof USERS },
) {
  const role = opts?.role ?? "mod";
  const user = USERS[role];
  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", url: APP_ORIGIN },
    { name: "refresh_token", value: "mock-refresh-token", url: APP_ORIGIN },
  ]);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { access_token: "new-mock-token" } }),
  );
  await page.route("**/api/categories**", (route) =>
    route.fulfill({ json: CATEGORIES }),
  );
  await page.route("**/api/expenses**", (route) =>
    route.fulfill({ json: EXPENSES }),
  );
  await page.route("**/api/reports**", (route) =>
    route.fulfill({ json: REPORTS }),
  );
  await page.route("**/api/review-queue*", (route) =>
    route.fulfill({ json: REVIEW_QUEUE }),
  );
  await page.route("**/api/dashboard**", (route, req) => {
    if (new URL(req.url()).pathname.endsWith("/api/dashboard/manager")) {
      route.fulfill({ json: MANAGER_DASHBOARD_DATA });
      return;
    }
    route.fulfill({ json: DASHBOARD_DATA });
  });
  await setupAdminMocks(page);
  await page.route("**/api/users/me/vehicles", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/fx/status", (route) =>
    route.fulfill({
      json: {
        status: "HEALTHY",
        primary_provider: "BNR",
        active_source: "BNR",
        fallback_active: false,
        last_checked_at: "2026-11-20T18:00:00Z",
        primary_error: null,
        providers: [
          {
            provider: "BNR",
            priority: 1,
            healthy: true,
            active: true,
            is_primary: true,
            checked_at: "2026-11-20T18:00:00Z",
            source_date: "2026-11-20",
            ron_per_eur: 5.3482,
            latency_ms: 42,
            error: null,
          },
        ],
        last_db_rate: null,
      },
    }),
  );
  await page.route("**/api/fuel-prices/status", (route) =>
    route.fulfill({
      json: {
        status: "HEALTHY",
        primary_provider: "PRETCARBURANT_LIVE",
        active_source: "PRETCARBURANT_LIVE",
        fallback_active: false,
        last_checked_at: "2026-11-20T20:00:00Z",
        primary_error: null,
        providers: [
          {
            provider: "PRETCARBURANT_LIVE",
            priority: 1,
            healthy: true,
            active: true,
            is_primary: true,
            checked_at: "2026-11-20T20:00:00Z",
            source_date: "2026-11-20",
            diesel_ron: 10.56,
            petrol_ron: 9.12,
            lpg_ron: 4.83,
            latency_ms: 45,
            error: null,
          },
        ],
        last_db_price: null,
      },
    }),
  );
}

export async function setupAdminMocks(
  page: Page,
  options?: {
    fxMarginsPatchResponse?: { status: number; body: unknown };
    mobileUiPatchResponse?: { status: number; body: unknown };
    ocrTestResult?: { success: boolean; message: string };
  },
) {
  let fxMargins = { ...FX_MARGINS, margins: { ...FX_MARGINS.margins } };
  await page.route("**/api/settings/fx-margins", async (route, req) => {
    if (req.method() === "GET") {
      await route.fulfill({ json: fxMargins });
      return;
    }
    if (options?.fxMarginsPatchResponse) {
      await route.fulfill({
        status: options.fxMarginsPatchResponse.status,
        json: options.fxMarginsPatchResponse.body,
      });
      return;
    }
    const payload = req.postDataJSON() as {
      margins?: Record<string, number>;
      default_margin?: number;
    };
    fxMargins = {
      ...fxMargins,
      margins: { ...fxMargins.margins, ...(payload.margins ?? {}) },
      default_margin: payload.default_margin ?? fxMargins.default_margin,
    };
    await route.fulfill({ json: fxMargins });
  });
  await page.route("**/api/settings/email", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: EMAIL_SETTINGS });
    else route.fulfill({ status: 200, json: EMAIL_SETTINGS });
  });
  await page.route("**/api/settings/email/test", (route) =>
    route.fulfill({ json: { success: true, message: "Test email sent" } }),
  );
  await page.route("**/api/settings/imap", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: IMAP_SETTINGS });
    else route.fulfill({ status: 200, json: IMAP_SETTINGS });
  });
  await page.route("**/api/settings/imap/test", (route) =>
    route.fulfill({
      json: { success: true, message: "IMAP connection successful" },
    }),
  );
  let delegationParsingSettings = { ...DELEGATION_PARSING_SETTINGS };
  await page.route("**/api/settings/imap/parsing", async (route, req) => {
    if (req.method() === "PATCH") {
      const payload: DelegationParsingConfig = req.postDataJSON();
      delegationParsingSettings = { ...payload };
    }
    await route.fulfill({ json: delegationParsingSettings });
  });
  await page.route("**/api/settings/imap/preview", (route) => route.fulfill({
    json: {
      success: true,
      parsed: {
        title: "Delegation: Example Brewery",
        description: "Order nr: 905652178\nTask: Cooling tower maintenance",
        date_from: "2026-10-18",
        date_to: "2026-10-19",
        kundenauftrag: "905652178",
      },
      active_parser: "ai",
      warnings: [],
    },
  }));
  await page.route("**/api/settings/imap/simulate", (route) =>
    route.fulfill({
      json: {
        local: { parsed: true, expense_count: 2 },
        gemini: { parsed: true, expense_count: 2 },
      },
    }),
  );
  await page.route("**/api/settings/ldap", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: LDAP_SETTINGS });
    else route.fulfill({ status: 200, json: LDAP_SETTINGS });
  });
  await page.route("**/api/settings/ldap/test", (route) =>
    route.fulfill({
      json: {
        ok: true,
        preview: [
          {
            username: "jdoe",
            email: "jdoe@example.com",
            display_name: "John Doe",
          },
        ],
      },
    }),
  );
  await page.route("**/api/settings/ldap/sync", (route) =>
    route.fulfill({
      json: { ok: true, created: 5, updated: 2, deactivated: 1 },
    }),
  );
  let ocrSettings = structuredClone(OCR_SETTINGS);
  await page.route("**/api/settings/ocr", async (route, req) => {
    if (req.method() === "GET") {
      await route.fulfill({ json: ocrSettings });
      return;
    }
    const payload: OcrConfigUpdate = req.postDataJSON();
    const providers: OcrProviderUpdate[] = payload.providers ?? ocrSettings.providers;
    const models = payload.models ?? ocrSettings.models;
    const changedProviderIds = new Set(
      providers
        .filter((provider) => {
          const saved = ocrSettings.providers.find(
            (item) => item.id === provider.id,
          );
          return (
            saved &&
            (saved.base_url !== provider.base_url || Boolean(provider.api_key))
          );
        })
        .map((provider) => provider.id),
    );
    ocrSettings = {
      ...ocrSettings,
      ...payload,
      models: models.map((model) => {
        const saved = ocrSettings.models.find((item) => item.id === model.id);
        const sameDefinition =
          saved?.provider_id === model.provider_id &&
          saved?.model_id === model.model_id;
        const tested =
          sameDefinition &&
          !changedProviderIds.has(model.provider_id) &&
          saved.tested;
        return {
          ...model,
          tested: Boolean(tested),
          active: model.active && Boolean(tested),
        };
      }),
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        base_url: provider.base_url,
        api_key_set:
          Boolean(provider.api_key) ||
          ocrSettings.providers.find((saved) => saved.id === provider.id)
            ?.api_key_set === true,
      })),
    };
    await route.fulfill({ status: 200, json: ocrSettings });
  });
  await page.route("**/api/settings/ocr/models/test", async (route) => {
    const { model_id: modelId } = route.request().postDataJSON() as {
      model_id: string;
    };
    const result = options?.ocrTestResult ?? {
      success: true,
      message: "Synthetic receipt test passed",
    };
    ocrSettings = {
      ...ocrSettings,
      models: ocrSettings.models.map((model) =>
        model.id === modelId ? { ...model, tested: result.success } : model,
      ),
    };
    await route.fulfill({ json: result });
  });
  await page.route("**/api/settings/storage", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: STORAGE_SETTINGS });
    else route.fulfill({ status: 200, json: STORAGE_SETTINGS });
  });
  await page.route("**/api/settings/storage/test", (route) =>
    route.fulfill({
      json: { success: true, message: "Storage connection OK" },
    }),
  );
  await page.route("**/api/settings/storage/migration-status", (route) =>
    route.fulfill({
      json: { migrating: false, progress: 100, total: 0, errors: [] },
    }),
  );
  await page.route("**/api/settings/daily-allowance-rate*", (route) =>
    route.fulfill({ json: DAILY_ALLOWANCE_RATE }),
  );
  let mobileUiSettings = { ...MOBILE_UI_SETTINGS };
  await page.route("**/api/settings/ui", async (route, req) => {
    if (req.method() === "GET") {
      await route.fulfill({ json: mobileUiSettings });
      return;
    }
    if (options?.mobileUiPatchResponse) {
      await route.fulfill({
        status: options.mobileUiPatchResponse.status,
        json: options.mobileUiPatchResponse.body,
      });
      return;
    }
    mobileUiSettings = {
      ...mobileUiSettings,
      ...(req.postDataJSON() as Partial<typeof mobileUiSettings>),
    };
    await route.fulfill({ json: mobileUiSettings });
  });
  await page.route("**/api/settings/mileage-rates*", (route) =>
    route.fulfill({ json: MILEAGE_RATES }),
  );
  let fxProvidersPriority = ["BNR", "ECB_FRANKFURTER", "CURRENCY_API"];
  const fxHealthyStatus = {
    status: "HEALTHY",
    primary_provider: "BNR",
    active_source: "BNR",
    fallback_active: false,
    last_checked_at: "2026-11-20T18:00:00Z",
    primary_error: null,
    providers: [
      {
        provider: "BNR",
        priority: 1,
        healthy: true,
        active: true,
        is_primary: true,
        checked_at: "2026-11-20T18:00:00Z",
        source_date: "2026-11-20",
        ron_per_eur: 5.3482,
        latency_ms: 42,
        error: null,
      },
      {
        provider: "ECB_FRANKFURTER",
        priority: 2,
        healthy: true,
        active: false,
        is_primary: false,
        checked_at: "2026-11-20T18:00:00Z",
        source_date: "2026-11-20",
        ron_per_eur: 5.3476,
        latency_ms: 68,
        error: null,
      },
      {
        provider: "CURRENCY_API",
        priority: 3,
        healthy: true,
        active: false,
        is_primary: false,
        checked_at: "2026-11-20T18:00:00Z",
        source_date: "2026-11-20",
        ron_per_eur: 5.348,
        latency_ms: 95,
        error: null,
      },
    ],
    last_db_rate: null,
  };
  await page.route("**/api/settings/fx-providers/check", (route) =>
    route.fulfill({ json: fxHealthyStatus }),
  );
  const fuelHealthyStatus = {
    status: "HEALTHY",
    primary_provider: "PRETCARBURANT_LIVE",
    active_source: "PRETCARBURANT_LIVE",
    fallback_active: false,
    last_checked_at: "2026-11-20T20:00:00Z",
    primary_error: null,
    providers: [
      {
        provider: "PRETCARBURANT_LIVE",
        priority: 1,
        healthy: true,
        active: true,
        is_primary: true,
        checked_at: "2026-11-20T20:00:00Z",
        source_date: "2026-11-20",
        diesel_ron: 10.56,
        petrol_ron: 9.12,
        lpg_ron: 4.83,
        latency_ms: 45,
        error: null,
      },
      {
        provider: "PRETCARBURANT_DATA",
        priority: 2,
        healthy: true,
        active: false,
        is_primary: false,
        checked_at: "2026-11-20T20:00:00Z",
        source_date: "2026-11-19",
        diesel_ron: 10.61,
        petrol_ron: 9.20,
        lpg_ron: 4.84,
        latency_ms: 60,
        error: null,
      },
      {
        provider: "EU_WEEKLY_OIL_BULLETIN",
        priority: 3,
        healthy: true,
        active: false,
        is_primary: false,
        checked_at: "2026-11-20T20:00:00Z",
        source_date: "2026-11-16",
        diesel_ron: 10.72,
        petrol_ron: 9.44,
        lpg_ron: 4.79,
        latency_ms: 120,
        error: null,
      },
    ],
    last_db_price: null,
  };
  let fuelProvidersPriority = [
    "PRETCARBURANT_LIVE",
    "PRETCARBURANT_DATA",
    "EU_WEEKLY_OIL_BULLETIN",
  ];
  await page.route("**/api/settings/fuel-providers", async (route, req) => {
    if (req.method() === "PATCH") {
      const payload = req.postDataJSON() as { providers?: string[] };
      if (Array.isArray(payload.providers) && payload.providers.length > 0) {
        fuelProvidersPriority = payload.providers;
      }
    }
    await route.fulfill({
      json: {
        providers: fuelProvidersPriority,
        available_providers: [
          "PRETCARBURANT_LIVE",
          "PRETCARBURANT_DATA",
          "EU_WEEKLY_OIL_BULLETIN",
        ],
      },
    });
  });
  await page.route("**/api/fuel-prices/status", (route) =>
    route.fulfill({ json: fuelHealthyStatus }),
  );
  await page.route("**/api/settings/fuel-prices/check", (route) =>
    route.fulfill({ json: fuelHealthyStatus }),
  );
  await page.route("**/api/settings/fx-providers", async (route, req) => {
    if (req.method() === "PATCH") {
      const payload = req.postDataJSON() as { providers?: string[] };
      if (Array.isArray(payload.providers) && payload.providers.length > 0) {
        fxProvidersPriority = payload.providers;
      }
    }
    await route.fulfill({
      json: {
        providers: fxProvidersPriority,
        available_providers: ["BNR", "ECB_FRANKFURTER", "CURRENCY_API"],
      },
    });
  });
  await page.route("**/api/ocr/comparison", (route) =>
    route.fulfill({
      json: {
        history: [],
        stats: {
          total_scanned: 0,
          gemini_amount_accuracy: 0,
          gemini_date_accuracy: 0,
          gemini_merchant_accuracy: 0,
          gemini_category_accuracy: 0,
        },
      },
    }),
  );
  await page.route("**/api/categories**", (route) =>
    route.fulfill({ json: CATEGORIES }),
  );
  await page.route("**/api/users**", (route, req) => {
    if (req.method() === "GET") route.fulfill({ json: USERS_LIST });
    else route.fulfill({ status: 201, json: { id: 99 } });
  });
}

export async function setupAuthMocks(
  page: Page,
  role: keyof typeof USERS = "mod",
) {
  const user = USERS[role];
  await page.context().addCookies([
    { name: "access_token", value: "mock-jwt-token", url: APP_ORIGIN },
    { name: "refresh_token", value: "mock-refresh-token", url: APP_ORIGIN },
  ]);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { access_token: "new-mock-token" } }),
  );
  await page.route("**/api/users/me/vehicles", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/fx/status", (route) =>
    route.fulfill({
      json: {
        status: "HEALTHY",
        primary_provider: "BNR",
        active_source: "BNR",
        fallback_active: false,
        last_checked_at: "2026-11-20T18:00:00Z",
        primary_error: null,
        providers: [
          {
            provider: "BNR",
            priority: 1,
            healthy: true,
            active: true,
            is_primary: true,
            checked_at: "2026-11-20T18:00:00Z",
            source_date: "2026-11-20",
            ron_per_eur: 5.3482,
            latency_ms: 42,
            error: null,
          },
        ],
        last_db_rate: null,
      },
    }),
  );
  await page.route("**/api/fuel-prices/status", (route) =>
    route.fulfill({
      json: {
        status: "HEALTHY",
        primary_provider: "PRETCARBURANT_LIVE",
        active_source: "PRETCARBURANT_LIVE",
        fallback_active: false,
        last_checked_at: "2026-11-20T20:00:00Z",
        primary_error: null,
        providers: [
          {
            provider: "PRETCARBURANT_LIVE",
            priority: 1,
            healthy: true,
            active: true,
            is_primary: true,
            checked_at: "2026-11-20T20:00:00Z",
            source_date: "2026-11-20",
            diesel_ron: 10.56,
            petrol_ron: 9.12,
            lpg_ron: 4.83,
            latency_ms: 45,
            error: null,
          },
        ],
        last_db_price: null,
      },
    }),
  );
}

export async function setupInsuranceMocks(page: Page) {
  await page.route("**/api/insurance**", (route, req) => {
    if (req.method() === "GET")
      route.fulfill({
        json: [
          {
            id: 1,
            filename: "policy_2026.pdf",
            title: "Health Insurance 2026",
            uploaded_by: "mod1",
            uploaded_at: "2026-01-15T10:00:00Z",
          },
        ],
      });
    else route.fulfill({ status: 201, json: { id: 99 } });
  });
}
