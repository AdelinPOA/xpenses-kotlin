import clsx from "clsx";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  submitted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const STATUS_ICONS: Record<string, string> = {
  draft: "○",
  submitted: "→",
  approved: "✓",
  rejected: "✗",
  paid: "★",
};

const ROLE_STYLES: Record<string, string> = {
  technician: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  manager: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  chef_finance: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  mod: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};

export default function Badge({ status, type = "status" }: { status: string; type?: "status" | "role" }) {
  const styles = type === "status" ? STATUS_STYLES : ROLE_STYLES;
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
        styles[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
      )}
    >
      {type === "status" && STATUS_ICONS[status] ? `${STATUS_ICONS[status]} ` : ""}{status.replace("_", " ")}
    </span>
  );
}
