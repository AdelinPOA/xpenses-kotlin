"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Receipt, FileText, User,
  Package, Shield, CheckSquare, Wallet, Banknote,
  Tag, PenLine, Settings, X, Users, Server, Mail,
  Inbox, Trash2, Sparkles, Database, LogOut, Sun,
  Moon, Monitor
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";

interface TabItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: string[];
}

const PRIMARY_TABS: TabItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/expenses", label: "Expenses", icon: Receipt, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/reports", label: "Reports", icon: FileText, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/profile", label: "Profile", icon: User, roles: ["technician", "manager", "chef_finance", "mod"] },
];

const SECONDARY_TABS: TabItem[] = [
  { href: "/inventory", label: "Inventory", icon: Package, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/insurance", label: "Insurance", icon: Shield, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/approvals", label: "Review Reports", icon: CheckSquare, roles: ["manager", "chef_finance"] },
  { href: "/advances", label: "Advances", icon: Wallet, roles: ["manager", "chef_finance", "mod"] },
  { href: "/payments", label: "Process Payments", icon: Banknote, roles: ["chef_finance"] },
  { href: "/categories", label: "Expense Categories", icon: Tag, roles: ["mod"] },
  { href: "/admin/settings", label: "Settings", icon: Settings, roles: ["chef_finance"] },
  { href: "/profile/signature", label: "Signature", icon: PenLine, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/admin/users", label: "Users", icon: Users, roles: ["mod", "manager", "chef_finance"] },
  { href: "/admin/ldap", label: "LDAP / AD", icon: Server, roles: ["mod"] },
  { href: "/admin/email", label: "Email / SMTP", icon: Mail, roles: ["mod"] },
  { href: "/admin/imap", label: "Email / IMAP", icon: Inbox, roles: ["mod"] },
  { href: "/admin/ocr", label: "OCR Scanner", icon: Sparkles, roles: ["mod"] },
  { href: "/admin/receipts", label: "Receipts Cleanup", icon: Trash2, roles: ["mod"] },
  { href: "/admin/storage", label: "Storage Settings", icon: Database, roles: ["mod"] },
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

export default function BottomTabBar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleTabs = PRIMARY_TABS.filter(
    (t) => user && t.roles.includes(user.role)
  );

  const visibleSecondary = SECONDARY_TABS.filter(
    (t) => user && t.roles.includes(user.role)
  );

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 ios-frosted safe-area-bottom px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-center justify-around h-[50px]">
          {visibleTabs.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="relative flex flex-col items-center justify-center w-16 h-full"
              >
                {active && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute -top-0.5 w-8 h-[3px] rounded-full bg-[var(--ios-blue)]"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon
                  className={clsx(
                    "w-[22px] h-[22px] transition-colors",
                    active ? "text-[var(--ios-blue)]" : "text-[var(--ios-tertiary-label)]"
                  )}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className={clsx(
                    "text-[9px] font-semibold mt-0.5 transition-colors",
                    active ? "text-[var(--ios-blue)]" : "text-[var(--ios-tertiary-label)]"
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="relative flex flex-col items-center justify-center w-16 h-full"
          >
            {pathname === "/profile" && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute -top-0.5 w-8 h-[3px] rounded-full bg-[var(--ios-blue)]"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <div
              className={clsx(
                "w-[22px] h-[22px] rounded-full flex items-center justify-center transition-colors",
                moreOpen || pathname === "/profile"
                  ? "bg-[var(--ios-blue)] text-white"
                  : "text-[var(--ios-tertiary-label)]"
              )}
            >
              <User className="w-[18px] h-[18px]" strokeWidth={2} />
            </div>
            <span
              className={clsx(
                "text-[9px] font-semibold mt-0.5 transition-colors",
                moreOpen || pathname.startsWith("/profile") || pathname.startsWith("/admin")
                  ? "text-[var(--ios-blue)]"
                  : "text-[var(--ios-tertiary-label)]"
              )}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      {/* More Drawer */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--ios-grouped-bg)] rounded-t-2xl max-h-[70vh] overflow-y-auto pb-[env(safe-area-inset-bottom)] md:hidden will-change-transform"
            >
              <div className="flex items-center justify-between px-5 py-4 sticky top-0 ios-frosted rounded-t-2xl">
                <h2 className="text-[17px] font-semibold text-[var(--ios-label)]">More</h2>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-4 pt-2 pb-4 space-y-2">
                <div className="ios-inset-card overflow-hidden">
                  {visibleSecondary.map(({ href, label, icon: Icon }, idx) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMoreOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 px-4 py-3.5 text-[15px] text-[var(--ios-label)] font-medium active:bg-zinc-200/50 dark:active:bg-zinc-700/50 transition-colors",
                        idx < visibleSecondary.length - 1 && "ios-separator"
                      )}
                    >
                      <Icon className="w-[20px] h-[20px] text-[var(--ios-blue)]" strokeWidth={1.5} />
                      {label}
                    </Link>
                  ))}
                </div>

                {/* User info + theme */}
                <div className="ios-inset-card overflow-hidden mt-4">
                  {user && (
                    <div className="px-4 py-3.5 ios-separator">
                      <p className="text-[15px] font-semibold text-[var(--ios-label)]">{user.display_name}</p>
                      <p className="text-[13px] text-[var(--ios-tertiary-label)]">{ROLE_LABELS[user.role] || user.role}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <button
                      onClick={logout}
                      className="flex items-center gap-2 text-[15px] text-red-500 font-medium"
                    >
                      <LogOut className="w-[18px] h-[18px]" />
                      Sign out
                    </button>
                    <button
                      onClick={cycleTheme}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[var(--ios-tertiary-label)] text-[13px] font-medium"
                    >
                      <ThemeIcon className="w-[16px] h-[16px]" />
                      {THEME_LABELS[theme]}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
