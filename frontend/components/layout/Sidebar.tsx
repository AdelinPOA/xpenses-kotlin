"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, FileText, Tag, Users, CheckSquare, Banknote, LogOut, Sun, Moon, Monitor, X } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";

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

const THEME_CYCLE: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABELS = { light: "Light", dark: "Dark", system: "System" };

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const visibleNav = NAV.filter((item) => user && item.roles.includes(user.role));

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          "fixed top-0 left-0 h-full w-[220px] bg-slate-900 text-slate-200 flex flex-col z-40",
          "transition-transform duration-200 ease-in-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Newtech Automation" width={36} height={36} className="rounded-full" />
            <span className="text-lg font-bold text-white tracking-tight">xpenses</span>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
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
          <div className="flex items-center justify-between">
            <button
              onClick={logout}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
            <button
              onClick={cycleTheme}
              title={`Theme: ${THEME_LABELS[theme]}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
