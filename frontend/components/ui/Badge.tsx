import clsx from "clsx";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100/80 border border-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700/60 dark:text-slate-300",
  submitted: "bg-amber-50/80 border border-amber-200/60 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400",
  approved: "bg-blue-50/80 border border-blue-200/60 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-400",
  rejected: "bg-rose-50/80 border border-rose-200/60 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400",
  paid: "bg-emerald-50/80 border border-emerald-200/60 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400",
};

const ROLE_STYLES: Record<string, string> = {
  technician: "bg-blue-50/80 border border-blue-200/60 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-400",
  manager: "bg-amber-50/80 border border-amber-200/60 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400",
  chef_finance: "bg-emerald-50/80 border border-emerald-200/60 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400",
  mod: "bg-indigo-50/80 border border-indigo-200/60 text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-900/30 dark:text-indigo-400",
};

export default function Badge({ status, type = "status" }: { status: string; type?: "status" | "role" }) {
  const styles = type === "status" ? STATUS_STYLES : ROLE_STYLES;
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize transition-all duration-300",
        styles[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-80 shrink-0" />
      {status.replace("_", " ")}
    </span>
  );
}

