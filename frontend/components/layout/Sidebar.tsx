"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, FileText, Tag } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/categories", label: "Categories", icon: Tag },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-full w-[220px] bg-slate-900 text-slate-200 flex flex-col z-20">
      <div className="px-6 py-4 border-b border-slate-700 flex flex-col items-center gap-2">
        <Image src="/logo.png" alt="Newtech Automation" width={48} height={48} className="rounded-full" />
        <span className="text-lg font-bold text-white tracking-tight">xpenses</span>
      </div>
      <nav className="flex-1 py-4 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-4 border-t border-slate-700 text-xs text-slate-500">
        v0.1.0
      </div>
    </aside>
  );
}
