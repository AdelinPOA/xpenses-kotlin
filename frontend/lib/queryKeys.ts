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
};

export const dashboardKeys = {
  all: ["dashboard"] as const,
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


