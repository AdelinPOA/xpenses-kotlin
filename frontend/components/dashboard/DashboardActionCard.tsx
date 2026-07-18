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
  className?: string;
}

export default function DashboardActionCard({
  title,
  description,
  count,
  href,
  icon: Icon,
  className
}: DashboardActionCardProps) {
  if (count === 0) return null;

  return (
    <Link
      href={href}
      className={clsx(
        "neon-glow group relative flex items-center gap-5 p-6 glass-panel rounded-2xl transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl overflow-hidden",
        className
      )}
    >
      <div className="relative p-4 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 transition-transform duration-500 group-hover:scale-110">
        <Icon className="w-6 h-6" strokeWidth={2} />
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{title}</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">{description}</p>
      </div>

      <div className="text-right shrink-0 relative z-10">
        <span className="text-4xl font-extrabold block leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-600 to-fuchsia-600 dark:from-indigo-400 dark:to-fuchsia-400">
          {count}
        </span>
        <div className="flex items-center justify-end gap-1 mt-2 text-[11px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-hover:text-indigo-500 dark:group-hover:text-indigo-400">
          View <ArrowRight className="w-3.5 h-3.5 transition-transform duration-500 group-hover:translate-x-1.5" />
        </div>
      </div>

      {/* Decorative gradient blob */}
      <div className="absolute -left-12 -top-12 w-32 h-32 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-50" />
    </Link>
  );
}

