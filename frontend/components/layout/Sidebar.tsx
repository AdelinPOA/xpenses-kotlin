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
import { FuelSidebarStatusPill, FxSidebarStatusPill } from "./FxStatusIndicator";
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

  const [isDesktop, setIsDesktop] = useState(false);

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
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-50 lg:hidden animate-fade-in"
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
          "fixed top-0 bottom-0 left-0 w-[244px] bg-sidebar text-slate-200 flex flex-col z-50 border-r border-sidebar-border/80 shadow-xl lg:shadow-none",
          "transition-transform duration-200 ease-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div
          className="px-5 pb-4 border-b border-sidebar-border/80 flex items-center justify-between"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top, 0px))" }}
        >
          <Link
            href="/dashboard"
            onClick={(e) => {
              guardedNavigate(e);
              onClose();
            }}
            className="flex items-center gap-2.5 group cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="relative rounded-full p-0.5 bg-white/10 ring-1 ring-white/15 group-hover:ring-primary/60 transition-all">
              <Image
                src="/logo.png"
                alt="Newtech Automation"
                width={32}
                height={32}
                className="rounded-full"
              />
            </div>
            <div className="leading-tight">
              <span className="block text-base font-bold text-white tracking-tight">xpenses</span>
              <span className="block text-[10px] font-medium text-slate-400 tracking-wide">
                Newtech Automation
              </span>
            </div>
          </Link>
          <button
            onClick={onClose}
            aria-label={tNav("close_navigation")}
            className="lg:hidden min-w-11 min-h-11 -mr-2 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-0.5">
          {visibleNav.filter(({ href }) => href !== "/profile/signature").map(({ href, labelKey, icon: Icon }) => {
            const active = href === "/profile" ? pathname === "/profile" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => {
                  guardedNavigate(e);
                  onClose();
                }}
                className={clsx(
                  "relative flex items-center gap-3 px-3 min-h-11 rounded-xl text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "text-white font-semibold bg-white/[0.09] shadow-2xs ring-1 ring-white/[0.06]"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                )}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-primary"
                  />
                )}
                <Icon
                  className={clsx("w-4 h-4 shrink-0 transition-colors", active ? "text-orange-400" : "text-slate-400")}
                  aria-hidden="true"
                />
                <span className="truncate">{tNav(labelKey)}</span>
              </Link>
            );
          })}
          {(user?.role === "mod" || user?.role === "manager" || user?.role === "chef_finance") && (
            <div className="pt-3 mt-3 border-t border-sidebar-border/80 space-y-0.5">
              <p className="px-3 pb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-[0.12em]">
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
                      "relative flex items-center gap-3 px-3 min-h-11 rounded-xl text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      active
                        ? "text-white font-semibold bg-white/[0.09] shadow-2xs ring-1 ring-white/[0.06]"
                        : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-primary"
                      />
                    )}
                    <Icon
                      className={clsx("w-4 h-4 shrink-0 transition-colors", active ? "text-orange-400" : "text-slate-400")}
                      aria-hidden="true"
                    />
                    <span className="truncate">{tNav(labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          )}
          {visibleNav.some(({ href }) => href === "/profile/signature") && (
            <div className="pt-3 mt-3 border-t border-sidebar-border/80 space-y-0.5">
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
                      "relative flex items-center gap-3 px-3 min-h-11 rounded-xl text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      active
                        ? "text-white font-semibold bg-white/[0.09] shadow-2xs ring-1 ring-white/[0.06]"
                        : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-primary"
                      />
                    )}
                    <Icon
                      className={clsx("w-4 h-4 shrink-0 transition-colors", active ? "text-orange-400" : "text-slate-400")}
                      aria-hidden="true"
                    />
                    <span className="truncate">{tNav(labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-sidebar-border/80 space-y-2 bg-white/[0.02]">
          {user && (
            <Link
              href="/profile"
              onClick={(e) => {
                guardedNavigate(e);
                onClose();
              }}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="w-8 h-8 rounded-full bg-primary/25 border border-primary/50 flex items-center justify-center text-orange-300 font-bold text-xs shrink-0">
                {user.display_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{user.display_name}</p>
                <p className="text-[10px] text-slate-400 truncate">{tNav(ROLE_LABELS[user.role] || user.role)}</p>
              </div>
            </Link>
          )}

          <FxSidebarStatusPill
            onNavigate={(e) => {
              guardedNavigate(e);
              onClose();
            }}
          />
          <FuelSidebarStatusPill
            onNavigate={(e) => {
              guardedNavigate(e);
              onClose();
            }}
          />

          <div className="grid grid-cols-1 gap-1.5 pt-0.5">
            {/* Theme Switcher */}
            <button
              onClick={cycleTheme}
              aria-label={tNav("theme_aria", { theme: tNav(THEME_LABEL_KEYS[theme]) })}
              className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            >
              <span className="flex items-center gap-2 text-slate-300">
                <ThemeIcon className="w-4 h-4 text-orange-400" aria-hidden="true" />
                <span className="text-xs font-medium">{tNav("theme")}</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.05]">
                {tNav(THEME_LABEL_KEYS[theme])}
              </span>
            </button>

            {/* Sign Out Button */}
            <button
              onClick={() => {
                if (allowNavigation()) {
                  logout();
                }
              }}
              className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{tNav("sign_out")}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
