"use client";

import { useCallback, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import { Menu, LayoutDashboard, ReceiptText, FolderKanban, User, CheckSquare } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useAllowNavigation } from "@/lib/navigationGuard";
import clsx from "clsx";
import { useTranslations } from "next-intl";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { user } = useAuth();
  const tNav = useTranslations("nav");
  const allowNavigation = useAllowNavigation();

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

          <Link
            href="/profile"
            onClick={(e) => {
              if (!allowNavigation()) e.preventDefault();
            }}
            className="w-11 h-11 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold text-sm shrink-0 z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={tNav("profile")}
          >
            {user?.display_name?.charAt(0) || "U"}
          </Link>
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
        className="lg:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-safe box-border bg-card border-t border-border flex items-end justify-around z-30 shadow-lg"
      >
        {navItems.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (!allowNavigation()) e.preventDefault();
              }}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 min-w-16 min-h-16 text-[10px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
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
