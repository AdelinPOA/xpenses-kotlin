"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, FileText, Tag, Users, CheckSquare, Banknote, Wallet, Settings, PenLine, LogOut, Sun, Moon, Monitor, X, Server, Mail, Inbox, Trash2, Sparkles, Database, Package, Shield } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useTranslations } from "next-intl";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  roles: string[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/expenses", labelKey: "expenses", icon: Receipt, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/inventory", labelKey: "inventory", icon: Package, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/insurance", labelKey: "insurance", icon: Shield, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/reports", labelKey: "reports", icon: FileText, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/approvals", labelKey: "review_reports", icon: CheckSquare, roles: ["manager", "chef_finance"] },
  { href: "/advances", labelKey: "advances", icon: Wallet, roles: ["manager", "chef_finance", "mod"] },
  { href: "/payments", labelKey: "process_payments", icon: Banknote, roles: ["chef_finance"] },
  { href: "/categories", labelKey: "expense_categories", icon: Tag, roles: ["mod"] },
  { href: "/admin/settings", labelKey: "settings", icon: Settings, roles: ["chef_finance"] },
  { href: "/profile/signature", labelKey: "signature", icon: PenLine, roles: ["technician", "manager", "chef_finance", "mod"] },
];

const ROLE_LABELS: Record<string, string> = {
  technician: "role_technician",
  manager: "role_manager",
  chef_finance: "role_finance_lead",
  mod: "role_administrator",
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
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");

  const visibleNav = NAV.filter((item) => user && item.roles.includes(user.role));
  const sidebarRef = useRef<HTMLElement>(null);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    sidebarRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

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
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        ref={sidebarRef}
        tabIndex={-1}
        aria-label="Application navigation"
        className={clsx(
          "fixed top-0 left-0 h-full w-[220px] bg-sidebar text-slate-200 flex flex-col z-40 border-r border-sidebar-border",
          "transition-transform duration-200 ease-in-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-6 pb-4 border-b border-sidebar-border flex items-center justify-between" style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top, 0px))" }}>
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Image
              src="/logo.png"
              alt="Newtech Automation"
              width={36}
              height={36}
              className={clsx(
                "rounded-full border-2",
                user ? "border-sidebar-border" : "border-transparent"
              )}
            />
            <span className="text-lg font-bold text-white tracking-tight">xpenses</span>
          </Link>
          <button onClick={onClose} aria-label="Close navigation" className="lg:hidden min-w-11 min-h-11 -m-2 text-slate-400 hover:text-white rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {visibleNav.filter(({ href }) => href !== "/profile/signature").map(({ href, labelKey, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 px-3 min-h-11 rounded-lg mb-1 text-sm font-semibold transition-all duration-200 border-l-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "text-white bg-sidebar-border border-primary"
                    : "text-slate-400 border-transparent hover:bg-sidebar-border/40 hover:text-white"
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {tNav(labelKey)}
              </Link>
            );
          })}
          {(user?.role === "mod" || user?.role === "manager" || user?.role === "chef_finance") && (
            <>
              <hr className="my-2 border-sidebar-border" />
              <p className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {user.role === "mod" ? tNav("admin_section") : tNav("directory_section")}
              </p>
              {[
                { href: "/admin/users", labelKey: "users", icon: Users, roles: ["mod", "manager", "chef_finance"] },
                { href: "/admin/ldap", labelKey: "ldap_ad", icon: Server, roles: ["mod"] },
                { href: "/admin/email", labelKey: "email_smtp", icon: Mail, roles: ["mod"] },
                { href: "/admin/imap", labelKey: "email_imap", icon: Inbox, roles: ["mod"] },
                { href: "/admin/ocr", labelKey: "ocr_scanner", icon: Sparkles, roles: ["mod"] },
                { href: "/admin/receipts", labelKey: "receipts_cleanup", icon: Trash2, roles: ["mod"] },
                { href: "/admin/storage", labelKey: "storage_settings", icon: Database, roles: ["mod"] },
              ].filter(({ roles }) => roles.includes(user.role)).map(({ href, labelKey, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={clsx(
                      "flex items-center gap-3 px-3 min-h-11 rounded-lg mb-1 text-sm font-semibold transition-all duration-200 border-l-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      active
                        ? "text-white bg-sidebar-border border-primary"
                        : "text-slate-400 border-transparent hover:bg-sidebar-border/40 hover:text-white"
                    )}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {tNav(labelKey)}
                  </Link>
                );
              })}
            </>
          )}
          {visibleNav.some(({ href }) => href === "/profile/signature") && (
            <>
              <hr className="my-2 border-sidebar-border" />
              {visibleNav.filter(({ href }) => href === "/profile/signature").map(({ href, labelKey, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={clsx(
                      "flex items-center gap-3 px-3 min-h-11 rounded-lg mb-1 text-sm font-semibold transition-all duration-200 border-l-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      active
                        ? "text-white bg-sidebar-border border-primary"
                        : "text-slate-400 border-transparent hover:bg-sidebar-border/40 hover:text-white"
                    )}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {tNav(labelKey)}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        <div className="px-4 py-4 border-t border-sidebar-border">
          {user && (
            <div className="mb-3">
              <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
              <p className="text-xs text-slate-400">{tNav(ROLE_LABELS[user.role] || user.role)}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={logout}
              className="flex items-center gap-2 min-h-11 px-2 text-sm text-slate-400 hover:text-white transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              {tNav("sign_out")}
            </button>
            <button
              onClick={cycleTheme}
              aria-label={`Current theme: ${THEME_LABELS[theme]}. Click to cycle.`}
              className="flex items-center gap-1 min-h-11 px-3 rounded-lg text-slate-400 hover:text-white hover:bg-sidebar-border transition-colors text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ThemeIcon className="w-4 h-4" aria-hidden="true" />
              <span>{THEME_LABELS[theme]}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
