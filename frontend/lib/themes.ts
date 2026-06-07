export const ROLE_COLORS: Record<string, string> = {
  technician: "blue",
  manager: "amber",
  chef_finance: "emerald",
  mod: "indigo",
};

export const ROLE_TEXT_COLORS: Record<string, string> = {
  technician: "text-blue-600 dark:text-blue-400",
  manager: "text-amber-600 dark:text-amber-400",
  chef_finance: "text-emerald-600 dark:text-emerald-400",
  mod: "text-indigo-600 dark:text-indigo-400",
};

export const ROLE_BG_COLORS: Record<string, string> = {
  technician: "bg-blue-500",
  manager: "bg-amber-500",
  chef_finance: "bg-emerald-500",
  mod: "bg-indigo-500",
};

export const ROLE_BORDER_COLORS: Record<string, string> = {
  technician: "border-blue-500",
  manager: "border-amber-500",
  chef_finance: "border-emerald-500",
  mod: "border-indigo-500",
};

export function getRoleColor(role: string | undefined): string {
  if (!role) return "blue";
  return ROLE_COLORS[role] || "blue";
}
