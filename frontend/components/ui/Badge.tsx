"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 border border-slate-200/80 text-slate-700 dark:bg-slate-800/80 dark:border-slate-700/80 dark:text-slate-300",
  submitted: "bg-amber-50 border border-amber-200/80 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-300",
  approved: "bg-blue-50 border border-blue-200/80 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800/60 dark:text-blue-300",
  rejected: "bg-rose-50 border border-rose-200/80 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-300",
  paid: "bg-emerald-50 border border-emerald-200/80 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300",
  active: "bg-emerald-50 border border-emerald-200/80 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300",
  inactive: "bg-slate-100 border border-slate-200/80 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700/80 dark:text-slate-400",
};

const ROLE_STYLES: Record<string, string> = {
  technician: "bg-slate-100 border border-slate-200/80 text-slate-700 dark:bg-slate-800/80 dark:border-slate-700/80 dark:text-slate-300",
  manager: "bg-blue-50 border border-blue-200/80 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800/60 dark:text-blue-300",
  chef_finance: "bg-emerald-50 border border-emerald-200/80 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300",
  mod: "bg-orange-50 border border-orange-200/80 text-orange-800 dark:bg-orange-950/40 dark:border-orange-800/60 dark:text-orange-300",
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
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize leading-4 transition-colors",
        styles[status] ?? "bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-85 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

