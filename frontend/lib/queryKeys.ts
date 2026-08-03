export const categoryKeys = {
  all: ["categories"] as const,
  list: () => [...categoryKeys.all, "list"] as const,
};

export const expenseKeys = {
  all: ["expenses"] as const,
  list: (filters?: object) => [...expenseKeys.all, "list", filters] as const,
  detail: (id: number) => [...expenseKeys.all, "detail", id] as const,
};

export const reportKeys = {
  all: ["reports"] as const,
  list: (filters?: object) => [...reportKeys.all, "list", filters] as const,
  detail: (id: number) => [...reportKeys.all, "detail", id] as const,
};

export const reviewQueueKeys = {
  all: ["review-queue"] as const,
  list: () => [...reviewQueueKeys.all, "list"] as const,
};

export const advanceKeys = {
  all: ["advances"] as const,
  list: (reportId: number) => [...advanceKeys.all, "list", reportId] as const,
  pending: () => [...advanceKeys.all, "pending"] as const,
};

export const mileageKeys = {
  all: ["mileage"] as const,
  list: (reportId: number) => [...mileageKeys.all, "list", reportId] as const,
};

export const settingsKeys = {
  all: ["settings"] as const,
  mileageRates: () => [...settingsKeys.all, "mileage-rates"] as const,
  dailyAllowanceRate: () => [...settingsKeys.all, "daily-allowance-rate"] as const,
};

export const dashboardKeys = {
  all: ["dashboard"] as const,
  manager: () => [...dashboardKeys.all, "manager"] as const,
};

export const ldapKeys = {
  all: ["ldap"] as const,
  config: () => [...ldapKeys.all, "config"] as const,
};

export const emailKeys = {
  all: ["email"] as const,
  config: () => [...emailKeys.all, "config"] as const,
};

export const imapKeys = {
  all: ["imap"] as const,
  config: () => [...imapKeys.all, "config"] as const,
};

export const ocrKeys = {
  all: ["ocr"] as const,
  config: () => [...ocrKeys.all, "config"] as const,
  comparison: () => [...ocrKeys.all, "comparison"] as const,
};

export const storageKeys = {
  all: ["storage"] as const,
  config: () => [...storageKeys.all, "config"] as const,
  migration: () => [...storageKeys.all, "migration"] as const,
};

export const inventoryKeys = {
  all: ["inventory"] as const,
  list: (filters?: object) => [...inventoryKeys.all, "list", filters] as const,
  detail: (id: number) => [...inventoryKeys.all, "detail", id] as const,
  requests: () => [...inventoryKeys.all, "requests"] as const,
};

export const insuranceKeys = {
  all: ["insurance"] as const,
  list: (filters?: object) => [...insuranceKeys.all, "list", filters] as const,
};

export const searchKeys = {
  all: ["search"] as const,
  query: (term: string, all?: boolean) => [...searchKeys.all, term, all] as const,
};

