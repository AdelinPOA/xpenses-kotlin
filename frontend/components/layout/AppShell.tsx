"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu, Bell, LayoutDashboard, ReceiptText, FileText, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import clsx from "clsx";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/expenses", label: "Expenses", icon: ReceiptText },
    { href: "/reports", label: "Reports", icon: FileText },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Mobile header matching mockup */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center justify-between px-4 z-30 shadow-sm">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 text-muted hover:bg-card-hover rounded-lg"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        {/* Centered logo & brand */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold text-xs">
            {user?.display_name?.charAt(0) || "X"}
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">xpenses</span>
        </div>

        {/* Right side notifications and profile */}
        <div className="flex items-center gap-3">
          <button className="relative p-1 text-muted hover:text-foreground" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
          </button>
          <Link 
            href="/profile" 
            className="w-6 h-6 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold text-[10px]"
            aria-label="Profile"
          >
            {user?.display_name?.charAt(0) || "U"}
          </Link>
        </div>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main layout content area - padded at bottom on mobile to clear the tab bar */}
      <main className="flex-1 lg:ml-[220px] pt-14 lg:pt-0 pb-20 lg:pb-0 p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Mobile bottom navigation tab bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around z-30 pb-safe shadow-lg">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 w-16 h-full text-[10px] font-bold uppercase tracking-wider transition-colors",
                active ? "text-primary" : "text-muted hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
