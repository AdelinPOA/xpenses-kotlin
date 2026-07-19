"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu } from "lucide-react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center px-4 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 text-muted hover:bg-card-hover rounded-lg"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-3 text-sm font-bold text-foreground">xpenses</span>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 lg:ml-[220px] pt-14 lg:pt-0 p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
