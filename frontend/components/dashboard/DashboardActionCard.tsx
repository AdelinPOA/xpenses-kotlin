"use client";

import Link from "next/link";
import { ArrowRight, LucideIcon } from "lucide-react";
import clsx from "clsx";

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
        "group relative flex items-center gap-4 p-5 backdrop-blur-md bg-white/70 dark:bg-slate-900/75 rounded-2xl shadow-lg border-l-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-gradient-to-br border-blue-500 from-blue-50/40 to-sky-50/20 dark:from-blue-950/10 dark:to-slate-900/5 shadow-blue-500/5 hover:shadow-blue-500/10"
      )}
    >
      <div className={clsx(
        "p-3 rounded-xl transition-all duration-300 group-hover:scale-110 bg-blue-100/80 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
      )}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{title}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-2">{description}</p>
      </div>
      <div className="text-right shrink-0">
        <span className="text-3xl font-extrabold block leading-none tracking-tight text-blue-600 dark:text-blue-400">
          {count}
        </span>
        <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
          View <ArrowRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-1" />
        </div>
      </div>
      {/* Subtle border glow overlay */}
      <div className="absolute inset-0 rounded-2xl border border-white/20 dark:border-slate-800/50 pointer-events-none" />
    </Link>
  );
}

