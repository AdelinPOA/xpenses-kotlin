"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, FileText, Tag, Users, CheckSquare, Banknote, Wallet, Settings, PenLine, LogOut, Sun, Moon, Monitor, X, Server, Mail, Inbox, Trash2, Sparkles, Database, Package, Shield } from "lucide-react";
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
  { href: "/inventory", label: "Inventory", icon: Package, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/insurance", label: "Insurance", icon: Shield, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/reports", label: "Reports", icon: FileText, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/approvals", label: "Review Reports", icon: CheckSquare, roles: ["manager", "chef_finance"] },
  { href: "/advances", label: "Advances", icon: Wallet, roles: ["manager", "chef_finance", "mod"] },
  { href: "/payments", label: "Process Payments", icon: Banknote, roles: ["chef_finance"] },
  { href: "/categories", label: "Expense Categories", icon: Tag, roles: ["mod"] },
  { href: "/admin/settings", label: "Settings", icon: Settings, roles: ["chef_finance"] },
  { href: "/profile/signature", label: "Signature", icon: PenLine, roles: ["technician", "manager", "chef_finance", "mod"] },
];

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  manager: "Manager",
  chef_finance: "Finance Lead",
  mod: "Administrator",
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
          "fixed top-0 left-0 h-full w-[220px] text-slate-600 dark:text-slate-300 flex flex-col z-40",
          "glass-panel border-r border-slate-200/50 dark:border-slate-800/50",
          "transition-transform duration-200 ease-in-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-6 py-4 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Newtech Automation"
              width={36}
              height={36}
              className={clsx(
                "rounded-full border-2",
                user ? "border-slate-200 dark:border-slate-700" : "border-transparent"
              )}
            />
            <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">xpenses</span>
          </div>
          <button onClick={onClose} aria-label="Close navigation" className="lg:hidden p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {visibleNav.filter(({ href }) => href !== "/profile/signature").map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-semibold transition-all duration-200",
                  active
                    ? "text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-[0_4px_12px_rgba(99,102,241,0.15)]"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
          {(user?.role === "mod" || user?.role === "manager" || user?.role === "chef_finance") && (
            <>
              <hr className="my-2 border-slate-200/50 dark:border-slate-800/50" />
              <p className="px-3 py-1 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {user.role === "mod" ? "Admin" : "Directory"}
              </p>
              {[
                { href: "/admin/users", label: "Users", icon: Users, roles: ["mod", "manager", "chef_finance"] },
                { href: "/admin/ldap", label: "LDAP / AD", icon: Server, roles: ["mod"] },
                { href: "/admin/email", label: "Email / SMTP", icon: Mail, roles: ["mod"] },
                { href: "/admin/imap", label: "Email / IMAP", icon: Inbox, roles: ["mod"] },
                { href: "/admin/ocr", label: "OCR Scanner", icon: Sparkles, roles: ["mod"] },
                { href: "/admin/receipts", label: "Receipts Cleanup", icon: Trash2, roles: ["mod"] },
                { href: "/admin/storage", label: "Storage Settings", icon: Database, roles: ["mod"] },
              ].filter(({ roles }) => roles.includes(user.role)).map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-semibold transition-all duration-200",
                      active
                        ? "text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-[0_4px_12px_rgba(99,102,241,0.15)]"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </>
          )}
          {visibleNav.some(({ href }) => href === "/profile/signature") && (
            <>
              <hr className="my-2 border-slate-200/50 dark:border-slate-800/50" />
              {visibleNav.filter(({ href }) => href === "/profile/signature").map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-semibold transition-all duration-200",
                      active
                        ? "text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-[0_4px_12px_rgba(99,102,241,0.15)]"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        <div className="px-4 py-4 border-t border-slate-200/50 dark:border-slate-800/50">
          {user && (
            <div className="mb-3 px-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{user.display_name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{ROLE_LABELS[user.role] || user.role}</p>
            </div>
          )}
          <div className="flex items-center justify-between px-2">
            <button
              onClick={logout}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
            <button
              onClick={cycleTheme}
              aria-label={`Current theme: ${THEME_LABELS[theme]}. Click to cycle.`}
              className="flex items-center gap-1 p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors text-xs"
            >
              <ThemeIcon className="w-4 h-4" />
              <span>{THEME_LABELS[theme]}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
