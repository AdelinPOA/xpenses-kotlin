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

export const dashboardKeys = {
  all: ["dashboard"] as const,
};
