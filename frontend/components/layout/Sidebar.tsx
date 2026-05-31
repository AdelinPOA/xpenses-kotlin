"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, FileText, Tag, Users, CheckSquare, Banknote, LogOut } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: string[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/expenses", label: "Expenses", icon: Receipt, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/reports", label: "Reports", icon: FileText, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, roles: ["manager", "chef_finance"] },
  { href: "/payments", label: "Payments", icon: Banknote, roles: ["chef_finance"] },
  { href: "/categories", label: "Categories", icon: Tag, roles: ["mod"] },
  { href: "/admin/users", label: "Users", icon: Users, roles: ["mod"] },
];

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  manager: "Manager",
  chef_finance: "Chef of Finances",
  mod: "Moderator",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const visibleNav = NAV.filter((item) => user && item.roles.includes(user.role));

  return (
    <aside className="fixed top-0 left-0 h-full w-[220px] bg-slate-900 text-slate-200 flex flex-col z-20">
      <div className="px-6 py-4 border-b border-slate-700 flex flex-col items-center gap-2">
        <Image src="/logo.png" alt="Newtech Automation" width={48} height={48} className="rounded-full" />
        <span className="text-lg font-bold text-white tracking-tight">xpenses</span>
      </div>
      <nav className="flex-1 py-4 px-3">
        {visibleNav.map(({ href, label, icon: Icon }) => {
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
      <div className="px-4 py-4 border-t border-slate-700">
        {user && (
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
            <p className="text-xs text-slate-400">{ROLE_LABELS[user.role] || user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
