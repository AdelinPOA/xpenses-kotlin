"use client";

import Link from "next/link";
import { ArrowRight, LucideIcon } from "lucide-react";
import clsx from "clsx";
import { ROLE_BG_COLORS, ROLE_TEXT_COLORS } from "@/lib/themes";

interface DashboardActionCardProps {
  title: string;
  description: string;
  count: number;
  href: string;
  icon: LucideIcon;
  role: string;
}

export default function DashboardActionCard({
  title,
  description,
  count,
  href,
  icon: Icon,
  role
}: DashboardActionCardProps) {
  if (count === 0) return null;

  return (
    <Link
      href={href}
      className={clsx(
        "group relative flex items-center gap-4 p-5 bg-white dark:bg-slate-900 rounded-xl shadow-sm border-l-4 transition-all hover:shadow-md",
        role === "technician" && "border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10",
        role === "manager" && "border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-900/10",
        role === "chef_finance" && "border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10",
        role === "mod" && "border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10"
      )}
    >
      <div className={clsx(
        "p-3 rounded-lg",
        role === "technician" && "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
        role === "manager" && "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
        role === "chef_finance" && "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
        role === "mod" && "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
      )}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="text-right">
        <span className={clsx(
          "text-2xl font-bold block leading-none",
          ROLE_TEXT_COLORS[role]
        )}>
          {count}
        </span>
        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
          View all <ArrowRight className="w-3 h-3" />
        </div>
      </div>
    </Link>
  );
}
