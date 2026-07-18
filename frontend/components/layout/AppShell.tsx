"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import BottomTabBar from "./BottomTabBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)] md:bg-[var(--background)] ios-grouped-bg md:ios-grouped-bg">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden">
        <BottomTabBar />
      </div>

      <main className="flex-1 md:ml-[calc(var(--sidebar-width)+2rem)] pb-[60px] md:pb-8 pt-0 md:pt-8 p-4 sm:p-6 md:pr-8 md:pl-0 max-w-7xl mx-auto w-full transition-[margin-left] duration-300">
        <div className="max-w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
