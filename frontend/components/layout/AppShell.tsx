"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu, LayoutDashboard, ReceiptText, FileText, User, CheckSquare } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import clsx from "clsx";
import { useTranslations } from "next-intl";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const tNav = useTranslations("nav");

  const navItems = user?.role === "manager" ? [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/approvals", labelKey: "review_reports", icon: CheckSquare },
    { href: "/reports", labelKey: "reports", icon: FileText },
    { href: "/profile", labelKey: "profile", icon: User },
  ] : [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/expenses", labelKey: "expenses", icon: ReceiptText },
    { href: "/reports", labelKey: "reports", icon: FileText },
    { href: "/profile", labelKey: "profile", icon: User },
  ];

  return (
    <div className="min-h-screen min-h-dvh bg-background text-foreground flex flex-col">
      {/* Mobile header matching mockup */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-card border-b border-border shadow-sm pt-safe">
        <div className="h-14 px-4 flex items-center justify-between relative">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-muted hover:bg-card-hover rounded-lg flex items-center justify-center shrink-0 z-20"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Centered logo & brand */}
          <Link
            href="/dashboard"
            className="absolute inset-0 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity z-10 pointer-events-auto"
          >
            <Image src="/logo.png" alt="xpenses" width={26} height={26} className="rounded-full" />
            <span className="text-base font-bold text-foreground tracking-tight">xpenses</span>
          </Link>

          {/* Right side profile */}
          <Link
            href="/profile"
            className="w-7 h-7 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold text-xs shrink-0 z-20"
            aria-label="Profile"
          >
            {user?.display_name?.charAt(0) || "U"}
          </Link>
        </div>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main layout content area - padded at bottom on mobile to clear the tab bar */}
      <main className="flex-1 lg:ml-[220px] pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pt-6 pb-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)] lg:pb-0 p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Mobile bottom navigation tab bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-safe box-border bg-card border-t border-border flex items-end justify-around z-30 shadow-lg">
        {navItems.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 w-16 h-16 text-[10px] font-bold uppercase tracking-wider transition-colors",
                active ? "text-primary" : "text-muted hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{tNav(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
