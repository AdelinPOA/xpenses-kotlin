"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { Menu, LayoutDashboard, ReceiptText, FolderKanban, User, CheckSquare, Camera, WifiOff, RefreshCw } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useOfflineSync } from "@/components/OfflineSyncProvider";
import { useAllowNavigation } from "@/lib/navigationGuard";
import clsx from "clsx";
import { useTranslations } from "next-intl";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { user } = useAuth();
  const { pendingCount, failedCount } = useOfflineSync();
  const [isOnline, setIsOnline] = useState(true);
  const tNav = useTranslations("nav");
  const tOffline = useTranslations("offline");
  const allowNavigation = useAllowNavigation();

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
    <div className="min-h-screen min-h-dvh bg-background text-foreground flex flex-col">
      <header id="app-header" className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-card border-b border-border shadow-sm pt-safe">
        <div className="h-14 px-4 flex items-center justify-between relative">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="min-w-11 min-h-11 -ml-2 text-muted hover:bg-card-hover rounded-lg flex items-center justify-center shrink-0 z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            className="absolute left-1/2 -translate-x-1/2 min-h-11 px-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Image src="/logo.png" alt="" width={26} height={26} className="rounded-full" />
            <span className="text-base font-bold text-foreground tracking-tight">xpenses</span>
          </Link>

          <div className="flex items-center gap-2 z-20">
            {!isOnline && (
              <span
                role="status"
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold"
                title={tOffline("banner_offline")}
              >
                <WifiOff className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{tOffline("banner_offline")}</span>
                <span className="sm:hidden">{pendingCount > 0 ? `${pendingCount}` : "Offline"}</span>
              </span>
            )}
            {isOnline && pendingCount > 0 && (
              <Link
                href="/expenses"
                className={clsx(
                  "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
                  failedCount > 0
                    ? "bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400"
                    : "bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-400 animate-pulse"
                )}
                aria-label={tOffline("drafts_badge", { count: pendingCount })}
              >
                <RefreshCw className="w-3 h-3 shrink-0 animate-spin" aria-hidden="true" />
                <span>{pendingCount}</span>
              </Link>
            )}
            <Link
              href="/profile"
              onClick={(e) => {
                if (!allowNavigation()) e.preventDefault();
              }}
              className="w-11 h-11 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold text-sm shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={tNav("profile")}
            >
              {user?.display_name?.charAt(0) || "U"}
            </Link>
          </div>
        </div>
      </header>

      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      <main
        id="main-content"
        className="flex-1 lg:ml-[220px] pt-[calc(3.5rem+env(safe-area-inset-top,0px)+1rem)] sm:pt-[calc(3.5rem+env(safe-area-inset-top,0px)+1.5rem)] lg:pt-6 pb-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)] lg:pb-0 p-4 sm:p-6 lg:p-8"
      >
        {children}
      </main>

      <nav
        id="mobile-bottom-nav"
        aria-label={tNav("mobile_navigation")}
        className="lg:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-safe box-border bg-card border-t border-border flex items-center justify-around z-30 shadow-lg px-1"
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
                  "relative -top-3.5 flex flex-col items-center justify-center w-[52px] h-[52px] rounded-full shadow-lg border-4 border-card transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  active
                    ? "bg-primary-hover text-white ring-2 ring-primary"
                    : "bg-primary text-white hover:bg-primary-hover"
                )}
              >
                <Icon className="w-6 h-6" aria-hidden="true" />
                <span className="sr-only">{tNav(labelKey)}</span>
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
                "flex flex-col items-center justify-center gap-1 min-w-14 min-h-14 text-[10px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                active ? "text-primary" : "text-muted hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span>{tNav(labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
