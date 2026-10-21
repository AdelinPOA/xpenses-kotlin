"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Sun, Moon, Monitor, X } from "lucide-react";
import { NAV, ADMIN_NAV } from "./nav";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useAllowNavigation } from "@/lib/navigationGuard";
import { useTranslations } from "next-intl";

const ROLE_LABELS: Record<string, string> = {
  technician: "role_technician",
  manager: "role_manager",
  chef_finance: "role_finance_lead",
  mod: "role_administrator",
};

const THEME_CYCLE: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL_KEYS: Record<(typeof THEME_CYCLE)[number], string> = {
  light: "theme_light",
  dark: "theme_dark",
  system: "theme_system",
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const tNav = useTranslations("nav");
  const allowNavigation = useAllowNavigation();

  const guardedNavigate = (e: { preventDefault: () => void }) => {
    if (!allowNavigation()) e.preventDefault();
  };

  const visibleNav = NAV.filter((item) => user && item.roles.includes(user.role));
  const sidebarRef = useRef<HTMLElement>(null);
  useBodyScrollLock(open);

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return false;
  });

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (e.matches && open) {
        onClose();
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const sidebar = sidebarRef.current;
    const background = [
      document.getElementById("main-content"),
      document.getElementById("app-header"),
      document.getElementById("mobile-bottom-nav"),
    ].filter(Boolean) as HTMLElement[];

    background.forEach((element) => element.setAttribute("inert", ""));
    sidebar?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first || document.activeElement === sidebar) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      background.forEach((element) => element.removeAttribute("inert"));
    };
  }, [open, onClose]);

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const ThemeIcon = THEME_ICONS[theme];
  const isMobileClosed = !isDesktop && !open;

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed left-0 right-0 bottom-0 top-[var(--app-banner-height,0px)] bg-black/50 z-50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        ref={sidebarRef}
        tabIndex={-1}
        aria-label={tNav("app_navigation")}
        aria-hidden={isMobileClosed ? "true" : undefined}
        inert={isMobileClosed ? true : undefined}
        className={clsx(
          "fixed top-[var(--app-banner-height,0px)] bottom-0 left-0 w-[220px] bg-sidebar text-slate-200 flex flex-col z-50 border-r border-sidebar-border",
          "transition-transform duration-200 ease-in-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-6 pb-4 border-b border-sidebar-border flex items-center justify-between" style={{ paddingTop: "calc(1.5rem + var(--app-header-safe-inset, env(safe-area-inset-top, 0px)))" }}>
          <Link
            href="/dashboard"
            onClick={(e) => {
              guardedNavigate(e);
              onClose();
            }}
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
          <button onClick={onClose} aria-label={tNav("close_navigation")} className="lg:hidden min-w-11 min-h-11 -m-2 text-slate-400 hover:text-white rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
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
                onClick={(e) => {
                  guardedNavigate(e);
                  onClose();
                }}
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
              {ADMIN_NAV.filter(({ roles }) => roles.includes(user.role)).map(({ href, labelKey, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={(e) => {
                      guardedNavigate(e);
                      onClose();
                    }}
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
                    onClick={(e) => {
                      guardedNavigate(e);
                      onClose();
                    }}
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
        <div className="p-3 border-t border-sidebar-border space-y-2 bg-sidebar/80">
          {user && (
            <div className="px-2 py-0.5">
              <p className="text-xs font-bold text-white truncate">{user.display_name}</p>
              <p className="text-[10px] text-slate-400 truncate">{tNav(ROLE_LABELS[user.role] || user.role)}</p>
            </div>
          )}

          {/* Theme Switcher */}
          <button
            onClick={cycleTheme}
            aria-label={tNav("theme_aria", { theme: tNav(THEME_LABEL_KEYS[theme]) })}
            className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-300 hover:text-white bg-sidebar-border/40 hover:bg-sidebar-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
          >
            <span className="flex items-center gap-2 text-slate-400">
              <ThemeIcon className="w-4 h-4 text-primary" aria-hidden="true" />
              <span className="text-xs font-medium text-slate-300">{tNav("theme")}</span>
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{tNav(THEME_LABEL_KEYS[theme])}</span>
          </button>

          {/* Sign Out Button */}
          <button
            onClick={() => {
              if (allowNavigation()) {
                logout();
              }
            }}
            className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{tNav("sign_out")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
