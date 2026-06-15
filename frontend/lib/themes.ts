export const ROLE_COLORS: Record<string, string> = {
  technician: "blue",
  manager: "blue",
  chef_finance: "blue",
  mod: "blue",
};

export const ROLE_TEXT_COLORS: Record<string, string> = {
  technician: "text-blue-600 dark:text-blue-400",
  manager: "text-blue-600 dark:text-blue-400",
  chef_finance: "text-blue-600 dark:text-blue-400",
  mod: "text-blue-600 dark:text-blue-400",
};

export const ROLE_BG_COLORS: Record<string, string> = {
  technician: "bg-blue-500",
  manager: "bg-blue-500",
  chef_finance: "bg-blue-500",
  mod: "bg-blue-500",
};

export const ROLE_BORDER_COLORS: Record<string, string> = {
  technician: "border-blue-500",
  manager: "border-blue-500",
  chef_finance: "border-blue-500",
  mod: "border-blue-500",
};

export function getRoleColor(role: string | undefined): string {
  return "blue";
}
