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
          className="fixed inset-0 bg-black/80 z-30 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          "fixed h-[100dvh] lg:h-[calc(100vh-2rem)] lg:top-4 lg:left-4 w-[var(--sidebar-width)] text-zinc-600 dark:text-zinc-300 flex flex-col z-40",
          "glass-panel lg:rounded-3xl border-r lg:border border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl",
          "transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1)",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-6 py-6 lg:py-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Newtech Automation"
              width={40}
              height={40}
              className={clsx(
                "rounded-xl border-2 transition-all duration-300",
                user ? "border-indigo-500/30" : "border-transparent"
              )}
            />
            <span className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 tracking-tight">xpenses</span>
          </div>
          <button onClick={onClose} aria-label="Close navigation" className="lg:hidden p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 py-2 px-4 overflow-y-auto">
          {visibleNav.filter(({ href }) => href !== "/profile/signature").map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl mb-1.5 text-[13px] font-bold transition-all duration-300",
                  active
                    ? "text-white bg-gradient-to-r from-indigo-600 to-fuchsia-600 shadow-[0_4px_20px_rgba(99,102,241,0.4)]"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white"
                )}
              >
                <Icon className={clsx("w-4 h-4", active ? "opacity-100" : "opacity-70")} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
          {(user?.role === "mod" || user?.role === "manager" || user?.role === "chef_finance") && (
            <>
              <hr className="my-4 border-zinc-200/50 dark:border-zinc-800/50 mx-4" />
              <p className="px-4 py-2 text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
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
                      "flex items-center gap-3 px-4 py-3 rounded-2xl mb-1.5 text-[13px] font-bold transition-all duration-300",
                      active
                        ? "text-white bg-gradient-to-r from-indigo-600 to-fuchsia-600 shadow-[0_4px_20px_rgba(99,102,241,0.4)]"
                        : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white"
                    )}
                  >
                    <Icon className={clsx("w-4 h-4", active ? "opacity-100" : "opacity-70")} strokeWidth={active ? 2.5 : 2} />
                    {label}
                  </Link>
                );
              })}
            </>
          )}
          {visibleNav.some(({ href }) => href === "/profile/signature") && (
            <>
              <hr className="my-4 border-zinc-200/50 dark:border-zinc-800/50 mx-4" />
              {visibleNav.filter(({ href }) => href === "/profile/signature").map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={clsx(
                      "flex items-center gap-3 px-4 py-3 rounded-2xl mb-1.5 text-[13px] font-bold transition-all duration-300",
                      active
                        ? "text-white bg-gradient-to-r from-indigo-600 to-fuchsia-600 shadow-[0_4px_20px_rgba(99,102,241,0.4)]"
                        : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white"
                    )}
                  >
                    <Icon className={clsx("w-4 h-4", active ? "opacity-100" : "opacity-70")} strokeWidth={active ? 2.5 : 2} />
                    {label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        <div className="p-4 m-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50">
          {user && (
            <div className="mb-4">
              <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">{user.display_name}</p>
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{ROLE_LABELS[user.role] || user.role}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={logout}
              className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
            <button
              onClick={cycleTheme}
              aria-label={`Current theme: ${THEME_LABELS[theme]}. Click to cycle.`}
              className="flex items-center gap-1.5 p-1.5 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 shadow-sm transition-all text-[11px] font-bold"
            >
              <ThemeIcon className="w-3.5 h-3.5" />
              <span>{THEME_LABELS[theme]}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
