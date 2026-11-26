"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { Menu, LayoutDashboard, ReceiptText, FolderKanban, User, CheckSquare, Camera } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import IosInstallHint from "@/components/IosInstallHint";
import { navLabelKeyFor } from "./nav";
import { useAuth } from "@/components/AuthProvider";
import { useAllowNavigation } from "@/lib/navigationGuard";
import { FuelFallbackBanner, FxFallbackBanner } from "./FxStatusIndicator";
import clsx from "clsx";
import { useTranslations } from "next-intl";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { user } = useAuth();
  const tNav = useTranslations("nav");
  const allowNavigation = useAllowNavigation();
  const router = useRouter();

  useEffect(() => {
    const key = navLabelKeyFor(pathname);
    document.title = key ? `${tNav(key)} · xpenses` : "xpenses";
  }, [pathname, tNav]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (allowNavigation()) router.push("/search");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [router, allowNavigation]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, []);

  const navItems = user?.role === "manager" ? [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/approvals", labelKey: "review_reports", icon: CheckSquare },
    { href: "/reports", labelKey: "reports", icon: FolderKanban },
    { href: "/profile", labelKey: "profile", icon: User },
  ] : [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/expenses", labelKey: "expenses", icon: ReceiptText },
    { href: "/expenses/capture", labelKey: "capture", icon: Camera, elevated: true },
    { href: "/reports", labelKey: "reports", icon: FolderKanban },
    { href: "/profile", labelKey: "profile", icon: User },
  ];

  return (
    <div className="min-h-screen min-h-dvh bg-background text-foreground flex flex-col overflow-x-clip">
      <header
        id="app-header"
        className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-card/85 backdrop-blur-xl border-b border-border/80 [padding-top:env(safe-area-inset-top,0px)]"
      >
        <div className="h-14 px-4 flex items-center justify-between relative">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="min-w-11 min-h-11 -ml-2 text-muted hover:text-foreground hover:bg-surface-subtle rounded-xl flex items-center justify-center shrink-0 z-20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={tNav("open_sidebar")}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <Link
            href="/dashboard"
            onClick={(e) => {
              if (!allowNavigation()) e.preventDefault();
            }}
            className="absolute left-1/2 -translate-x-1/2 min-h-11 px-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Image src="/logo.png" alt="" width={24} height={24} className="rounded-full ring-1 ring-border" />
            <span className="text-[15px] font-bold text-foreground tracking-tight">xpenses</span>
          </Link>

          <div className="flex items-center gap-2 z-20">
            <Link
              href="/profile"
              onClick={(e) => {
                if (!allowNavigation()) e.preventDefault();
              }}
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={tNav("profile")}
            >
              <span className="w-8 h-8 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center text-primary font-bold text-xs shadow-2xs">
                {user?.display_name?.charAt(0)?.toUpperCase() || "U"}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      <main
        id="main-content"
        className="app-main flex-1 min-w-0 max-w-full lg:ml-[244px] pt-[calc(3.5rem_+_env(safe-area-inset-top,0px)_+_1rem)] sm:pt-[calc(3.5rem_+_env(safe-area-inset-top,0px)_+_1.5rem)] lg:pt-7 pb-[calc(7.5rem_+_env(safe-area-inset-bottom,0px))] lg:pb-10 p-4 sm:p-6 lg:px-8"
      >
        <div className="mx-auto w-full min-w-0 max-w-[1440px]">
          <FxFallbackBanner />
          <FuelFallbackBanner />
          {children}
          <IosInstallHint />
        </div>
      </main>

      <nav
        id="mobile-bottom-nav"
        aria-label={tNav("mobile_navigation")}
        className="lg:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-safe box-border bg-card/90 backdrop-blur-xl border-t border-border/80 flex items-center justify-around z-30 shadow-[0_-4px_20px_-4px_rgba(15,23,42,0.08)] dark:shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.45)] px-1"
      >
        {navItems.map((item) => {
          const { href, labelKey, icon: Icon } = item;
          const elevated = "elevated" in item && item.elevated;
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

          if (elevated) {
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={tNav(labelKey)}
                onClick={(e) => {
                  if (!allowNavigation()) e.preventDefault();
                }}
                className={clsx(
                  "relative flex min-w-0 flex-1 h-full flex-col items-center justify-end pb-1.5 text-[11px] font-semibold leading-none whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  active ? "text-nav-active" : "text-muted hover:text-foreground"
                )}
              >
                <span
                  className={clsx(
                    "absolute bottom-6 flex h-[52px] w-[52px] items-center justify-center rounded-full border-4 border-card shadow-[0_6px_18px_-3px_rgba(194,65,12,0.45)] transition-transform active:scale-95",
                    active
                      ? "bg-primary-hover text-white ring-2 ring-primary/60"
                      : "bg-primary text-white hover:bg-primary-hover"
                  )}
                >
                  <Icon className="w-[22px] h-[22px]" aria-hidden="true" />
                </span>
                <span>{tNav(labelKey)}</span>
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (!allowNavigation()) e.preventDefault();
              }}
              className={clsx(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 min-h-14 px-0.5 text-[11px] font-semibold leading-none whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                active ? "text-nav-active" : "text-muted hover:text-foreground"
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary"
                />
              )}
              <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" />
              <span>{tNav(labelKey)}</span>
            </Link>
          );
        })}
      </nav>

    </div>
  );
}
