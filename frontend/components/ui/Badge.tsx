"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100/80 border border-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700/60 dark:text-slate-300",
  submitted: "bg-amber-50/80 border border-amber-200/60 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400",
  approved: "bg-blue-50/80 border border-blue-200/60 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-400",
  rejected: "bg-rose-50/80 border border-rose-200/60 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400",
  paid: "bg-emerald-50/80 border border-emerald-200/60 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400",
};

const ROLE_STYLES: Record<string, string> = {
  technician: "bg-slate-100/80 border border-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700/60 dark:text-slate-300",
  manager: "bg-slate-100/80 border border-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700/60 dark:text-slate-300",
  chef_finance: "bg-slate-100/80 border border-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700/60 dark:text-slate-300",
  mod: "bg-slate-100/80 border border-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700/60 dark:text-slate-300",
};

const STATUS_KEYS = new Set(["draft", "submitted", "approved", "rejected", "paid", "active", "inactive"]);
const ROLE_KEYS: Record<string, string> = {
  technician: "role_technician",
  manager: "role_manager",
  chef_finance: "role_chef_finance",
  mod: "role_moderator",
};

export default function Badge({ status, type = "status" }: { status: string; type?: "status" | "role" }) {
  const tc = useTranslations("common");
  const tAdmin = useTranslations("admin");
  const styles = type === "status" ? STATUS_STYLES : ROLE_STYLES;

  let label = status.replace("_", " ");
  if (type === "status" && STATUS_KEYS.has(status)) {
    label = tc(status as "draft" | "submitted" | "approved" | "rejected" | "paid" | "active" | "inactive");
  } else if (type === "role" && ROLE_KEYS[status]) {
    label = tAdmin(ROLE_KEYS[status] as "role_technician" | "role_manager" | "role_chef_finance" | "role_moderator");
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize transition-all duration-300",
        styles[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-80 shrink-0" />
      {label}
    </span>
  );
}

