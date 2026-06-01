# Dark Mode + Mobile Responsive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add class-based dark mode with system preference detection + manual toggle, and make the layout mobile-responsive with a collapsible sidebar drawer.

**Architecture:** ThemeProvider manages a 3-state preference (light/dark/system) persisted in localStorage. Tailwind v4's `@custom-variant` enables class-based `dark:` selectors. AppShell becomes responsive with a mobile header bar and drawer sidebar below the `lg` breakpoint. No new npm packages needed.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4 (CSS-first config), lucide-react (Sun/Moon/Monitor icons already available)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `frontend/components/ThemeProvider.tsx` | Theme state management: localStorage + prefers-color-scheme + `.dark` class on `<html>` |

### Modified Files

| File | Change |
|------|--------|
| `frontend/app/globals.css` | Add `@custom-variant dark`, dark body styles |
| `frontend/app/layout.tsx` | Add `suppressHydrationWarning` to `<html>` |
| `frontend/components/Providers.tsx` | Wrap with ThemeProvider |
| `frontend/components/layout/Sidebar.tsx` | Theme toggle, mobile drawer (accept `open`/`onClose` props) |
| `frontend/components/layout/AppShell.tsx` | Mobile header bar, responsive margin, sidebar state |
| `frontend/components/dashboard/StatCard.tsx` | Add dark: classes |
| `frontend/components/ui/Badge.tsx` | Add dark: classes |
| `frontend/components/ui/EmptyState.tsx` | Add dark: classes |
| `frontend/components/expenses/ExpenseForm.tsx` | Add dark: classes |
| `frontend/app/login/page.tsx` | Add dark: classes |
| `frontend/app/dashboard/page.tsx` | Add dark: classes, responsive grid |
| `frontend/app/expenses/page.tsx` | Add dark: classes, overflow-x-auto, flex-wrap filters |
| `frontend/app/expenses/new/page.tsx` | Add dark: classes |
| `frontend/app/expenses/[id]/edit/page.tsx` | Add dark: classes |
| `frontend/app/reports/page.tsx` | Add dark: classes, overflow-x-auto, flex-wrap filters |
| `frontend/app/reports/new/page.tsx` | Add dark: classes |
| `frontend/app/reports/[id]/page.tsx` | Add dark: classes, overflow-x-auto, responsive header |
| `frontend/app/reports/[id]/edit/page.tsx` | Add dark: classes |
| `frontend/app/approvals/page.tsx` | Add dark: classes |
| `frontend/app/payments/page.tsx` | Add dark: classes |
| `frontend/app/admin/users/page.tsx` | Add dark: classes, overflow-x-auto |
| `frontend/app/categories/page.tsx` | Add dark: classes, overflow-x-auto |

---

## Task 1: CSS and Theme Infrastructure

**Files:**
- Modify: `frontend/app/globals.css`
- Create: `frontend/components/ThemeProvider.tsx`
- Modify: `frontend/components/Providers.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Update globals.css with dark mode custom variant and dark body styles**

Replace the entire file with:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --sidebar-width: 220px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
}

.dark body {
  background-color: #020617;
  color: #e2e8f0;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 2: Create ThemeProvider.tsx**

```tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  resolved: "light",
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return getSystemTheme();
  return theme;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const initial = stored && ["light", "dark", "system"].includes(stored) ? stored : "system";
    setThemeState(initial);
    setResolved(resolveTheme(initial));
  }, []);

  useEffect(() => {
    const r = resolveTheme(theme);
    setResolved(r);
    document.documentElement.classList.toggle("dark", r === "dark");
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = resolveTheme("system");
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 3: Update Providers.tsx to wrap with ThemeProvider**

Replace the entire file with:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import AuthProvider from "./AuthProvider";
import ThemeProvider from "./ThemeProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Update layout.tsx to add suppressHydrationWarning**

Replace the entire file with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "xpenses",
  description: "Internal expense management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/globals.css frontend/components/ThemeProvider.tsx frontend/components/Providers.tsx frontend/app/layout.tsx
git commit -m "feat(ui): add dark mode infrastructure — ThemeProvider, CSS custom variant, suppressHydrationWarning"
```

---

## Task 2: Responsive AppShell + Sidebar with Theme Toggle

**Files:**
- Modify: `frontend/components/layout/AppShell.tsx`
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite AppShell.tsx with mobile header and responsive margin**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu } from "lucide-react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-3 text-sm font-bold text-slate-900 dark:text-white">xpenses</span>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 lg:ml-[220px] pt-14 lg:pt-0 p-4 sm:p-6 lg:p-8 max-w-7xl">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite Sidebar.tsx with mobile drawer, theme toggle, and dark mode classes**

Replace the entire file with:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, FileText, Tag, Users, CheckSquare, Banknote, LogOut, Sun, Moon, Monitor, X } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: string[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/expenses", label: "Expenses", icon: Receipt, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/reports", label: "Reports", icon: FileText, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, roles: ["manager", "chef_finance"] },
  { href: "/payments", label: "Payments", icon: Banknote, roles: ["chef_finance"] },
  { href: "/categories", label: "Categories", icon: Tag, roles: ["mod"] },
  { href: "/admin/users", label: "Users", icon: Users, roles: ["mod"] },
];

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  manager: "Manager",
  chef_finance: "Chef of Finances",
  mod: "Moderator",
};

const THEME_CYCLE: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABELS = { light: "Light", dark: "Dark", system: "System" };

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const visibleNav = NAV.filter((item) => user && item.roles.includes(user.role));

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          "fixed top-0 left-0 h-full w-[220px] bg-slate-900 text-slate-200 flex flex-col z-40",
          "transition-transform duration-200 ease-in-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Newtech Automation" width={36} height={36} className="rounded-full" />
            <span className="text-lg font-bold text-white tracking-tight">xpenses</span>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700">
          {user && (
            <div className="mb-3">
              <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
              <p className="text-xs text-slate-400">{ROLE_LABELS[user.role] || user.role}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={logout}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
            <button
              onClick={cycleTheme}
              title={`Theme: ${THEME_LABELS[theme]}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/layout/AppShell.tsx frontend/components/layout/Sidebar.tsx
git commit -m "feat(ui): responsive AppShell with mobile drawer sidebar and theme toggle"
```

---

## Task 3: Dark Mode for Shared UI Components

**Files:**
- Modify: `frontend/components/dashboard/StatCard.tsx`
- Modify: `frontend/components/ui/Badge.tsx`
- Modify: `frontend/components/ui/EmptyState.tsx`

- [ ] **Step 1: Update StatCard.tsx with dark mode classes**

Replace the entire file with:

```tsx
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "violet" | "slate";
}

const COLORS = {
  blue: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
  green: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
  violet: "border-violet-500 bg-violet-50 dark:bg-violet-950/30",
  slate: "border-slate-400 bg-slate-50 dark:bg-slate-800/50",
};

export default function StatCard({ label, value, sub, color = "slate" }: StatCardProps) {
  return (
    <div className={`rounded-xl border-l-4 p-5 shadow-sm bg-white dark:bg-slate-900 ${COLORS[color]}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update Badge.tsx with dark mode classes**

Replace the entire file with:

```tsx
import clsx from "clsx";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  submitted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function Badge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
      )}
    >
      {status}
    </span>
  );
}
```

- [ ] **Step 3: Update EmptyState.tsx with dark mode classes**

Replace the entire file with:

```tsx
import { Inbox } from "lucide-react";

export default function EmptyState({ message = "No items found" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
      <Inbox className="w-12 h-12 mb-3" strokeWidth={1.5} />
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/dashboard/StatCard.tsx frontend/components/ui/Badge.tsx frontend/components/ui/EmptyState.tsx
git commit -m "feat(ui): add dark mode to StatCard, Badge, and EmptyState components"
```

---

## Task 4: Dark Mode + Mobile for Login Page

**Files:**
- Modify: `frontend/app/login/page.tsx`

- [ ] **Step 1: Update login page with dark mode classes**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import Image from "next/image";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(username, password);
      setUser(user);
      router.push("/dashboard");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4">
      <div className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-lg w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Image src="/logo.png" alt="Newtech Automation" width={56} height={56} className="rounded-full mb-3" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">xpenses</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/login/page.tsx
git commit -m "feat(ui): dark mode for login page"
```

---

## Task 5: Dark Mode + Mobile for Dashboard Page

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Update dashboard page with dark mode classes and responsive grid**

Replace the entire file with:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import api, { DashboardStats } from "@/lib/api";
import { dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import StatCard from "@/components/dashboard/StatCard";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: dashboardKeys.all,
    queryFn: () => api.get("/dashboard").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="text-slate-400 dark:text-slate-500 text-sm mt-8">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Overview of your expenses this month</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Spent this month"
          value={formatEur(data?.total_month_eur ?? 0)}
          sub={`${data?.expense_count_month ?? 0} expenses`}
          color="blue"
        />
        <StatCard
          label="Draft reports"
          value={data?.draft_count ?? 0}
          color="slate"
        />
        <StatCard
          label="Submitted reports"
          value={data?.submitted_count ?? 0}
          color="violet"
        />
        <StatCard
          label="Paid reports"
          value={data?.paid_count ?? 0}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Spend by Category (this month)</h2>
          {!data?.spend_by_category.length ? (
            <EmptyState message="No expenses this month" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 dark:text-slate-500 uppercase">
                    <th className="text-left pb-2">Category</th>
                    <th className="text-right pb-2">Count</th>
                    <th className="text-right pb-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spend_by_category.map((s, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-2 text-slate-700 dark:text-slate-300">{s.category_name}</td>
                      <td className="py-2 text-right text-slate-500 dark:text-slate-400">{s.count}</td>
                      <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                        {formatEur(s.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recent Expenses</h2>
            <Link href="/expenses" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              View all
            </Link>
          </div>
          {!data?.recent_expenses.length ? (
            <EmptyState message="No expenses yet" />
          ) : (
            <div className="space-y-2">
              {data.recent_expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {e.merchant || e.description || "—"}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {e.date} · {e.category_name || "Uncategorized"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatEur(e.amount_eur)}
                    </p>
                    {e.currency_original !== "EUR" && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {e.amount_original} {e.currency_original}
                      </p>
                    )}
                    <Badge status={e.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat(ui): dark mode + responsive grid for dashboard"
```

---

## Task 6: Dark Mode + Mobile for Expenses Page

**Files:**
- Modify: `frontend/app/expenses/page.tsx`

- [ ] **Step 1: Update expenses page with dark mode, overflow-x-auto, flex-wrap filters**

Replace the entire file with:

```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import api, { Expense, API_BASE_URL } from "@/lib/api";
import { expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Pencil } from "lucide-react";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(amount);
}

export default function ExpensesPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: expenseKeys.list({ status: statusFilter }),
    queryFn: () =>
      api.get("/expenses", { params: statusFilter ? { status: statusFilter } : {} }).then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Expenses</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{expenses?.length ?? 0} total</p>
        </div>
        <Link
          href="/expenses/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 w-fit"
        >
          <Plus className="w-4 h-4" />
          Add expense
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
          {["", "draft", "submitted", "paid"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">Loading...</div>
        ) : !expenses?.length ? (
          <EmptyState message="No expenses found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Merchant</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">EUR</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Receipt</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{e.merchant || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.category_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[180px] truncate">{e.description || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatAmount(e.amount_eur, "EUR")}
                      </span>
                      {e.currency_original !== "EUR" && (
                        <span className="block text-xs text-slate-400 dark:text-slate-500 font-normal">
                          {formatAmount(e.amount_original, e.currency_original)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge status={e.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.receipts?.length > 0 ? (
                        <div className="flex items-center justify-end gap-1">
                          {e.receipts.map((r) => (
                            <a
                              key={r.id}
                              href={`${API_BASE_URL}/expenses/${e.id}/receipts/${r.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                            >
                              {e.receipts.length === 1 ? "View" : (r.original_name?.split(".").pop()?.toUpperCase() || "View")}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {e.status === "draft" && (
                          <>
                            <Link href={`/expenses/${e.id}/edit`}>
                              <Pencil className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                            </Link>
                            <button
                              onClick={() => del.mutate(e.id)}
                              disabled={del.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/expenses/page.tsx
git commit -m "feat(ui): dark mode + responsive table for expenses page"
```

---

## Task 7: Dark Mode + Mobile for Reports Page

**Files:**
- Modify: `frontend/app/reports/page.tsx`

- [ ] **Step 1: Update reports page with dark mode, overflow-x-auto, flex-wrap filters**

Apply the same pattern as expenses page. Key changes:
- All `bg-white` → add `dark:bg-slate-900`
- All `bg-slate-50` (thead) → add `dark:bg-slate-800`
- All `text-slate-*` → add corresponding `dark:text-slate-*`
- All `border-slate-100` → add `dark:border-slate-700`
- Filter pills: same active/inactive dark pattern as expenses
- Wrap table in `<div className="overflow-x-auto">`
- Page header: add `flex-col sm:flex-row` and `gap-4`

Replace the entire file with:

```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import api, { Report } from "@/lib/api";
import { reportKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Eye } from "lucide-react";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: reportKeys.list({ status: statusFilter }),
    queryFn: () =>
      api.get("/reports", { params: statusFilter ? { status: statusFilter } : {} }).then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/reports/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Expense Reports</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{reports?.length ?? 0} total</p>
        </div>
        <Link
          href="/reports/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 w-fit"
        >
          <Plus className="w-4 h-4" />
          New report
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
          {["", "draft", "submitted", "approved", "rejected", "paid"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">Loading...</div>
        ) : !reports?.length ? (
          <EmptyState message="No reports found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-left px-4 py-3">Expenses</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Submitted</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.title}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                      {r.date_from && r.date_to ? `${r.date_from} — ${r.date_to}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.expenses.length}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatEur(r.expenses.reduce((s, e) => s + e.amount_eur, 0) || r.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/reports/${r.id}`}>
                          <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                        </Link>
                        {r.status === "draft" && (
                          <button onClick={() => del.mutate(r.id)} disabled={del.isPending}>
                            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/reports/page.tsx
git commit -m "feat(ui): dark mode + responsive table for reports page"
```

---

## Task 8: Dark Mode + Mobile for Remaining Pages (Batch)

This task covers the remaining 9 pages that need dark mode classes. The pattern is the same for all: add `dark:` variants to every color class.

**Files:**
- Modify: `frontend/app/expenses/new/page.tsx`
- Modify: `frontend/app/expenses/[id]/edit/page.tsx`
- Modify: `frontend/app/reports/new/page.tsx`
- Modify: `frontend/app/reports/[id]/page.tsx`
- Modify: `frontend/app/reports/[id]/edit/page.tsx`
- Modify: `frontend/app/approvals/page.tsx`
- Modify: `frontend/app/payments/page.tsx`
- Modify: `frontend/app/admin/users/page.tsx`
- Modify: `frontend/app/categories/page.tsx`
- Modify: `frontend/components/expenses/ExpenseForm.tsx`

**Dark mode class patterns to apply consistently across all files:**

| Light class | Add dark variant |
|------------|-----------------|
| `text-slate-900` | `dark:text-slate-100` |
| `text-slate-800` | `dark:text-slate-200` |
| `text-slate-700` | `dark:text-slate-300` |
| `text-slate-600` | `dark:text-slate-400` |
| `text-slate-500` | `dark:text-slate-400` |
| `text-slate-400` | `dark:text-slate-500` |
| `text-slate-300` | `dark:text-slate-600` |
| `bg-white` | `dark:bg-slate-900` |
| `bg-slate-50` | `dark:bg-slate-800` |
| `bg-slate-100` | `dark:bg-slate-800` |
| `border-slate-100` | `dark:border-slate-700` |
| `border-slate-200` | `dark:border-slate-700` |
| `border-slate-300` | `dark:border-slate-600` |
| `hover:bg-slate-50` | `dark:hover:bg-slate-800` |
| `hover:bg-slate-200` | `dark:hover:bg-slate-700` |
| `bg-emerald-50` | `dark:bg-emerald-900/30` |
| `text-emerald-800` | `dark:text-emerald-400` |
| `border-emerald-200` | `dark:border-emerald-800` |
| `bg-red-50` | `dark:bg-red-900/30` |
| `text-red-600` | keep (readable in dark) |
| `text-blue-600` | `dark:text-blue-400` |
| `text-amber-600` | `dark:text-amber-400` |
| `hover:text-slate-800` | `dark:hover:text-slate-200` |

**Responsive patterns to apply:**
- Tables: wrap in `<div className="overflow-x-auto">`
- Page headers with action buttons: `flex-col sm:flex-row` + `gap-4`

- [ ] **Step 1: Update expenses/new/page.tsx**

```tsx
import AppShell from "@/components/layout/AppShell";
import ExpenseForm from "@/components/expenses/ExpenseForm";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const reportId = typeof sp.reportId === 'string' ? parseInt(sp.reportId) : undefined;
  const currency = typeof sp.currency === 'string' ? sp.currency : undefined;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">New Expense</h1>
      </div>
      <ExpenseForm reportId={reportId} defaultCurrency={currency} />
    </AppShell>
  );
}
```

- [ ] **Step 2: Update expenses/[id]/edit/page.tsx**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import api, { Expense } from "@/lib/api";
import { expenseKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import ExpenseForm from "@/components/expenses/ExpenseForm";

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: expense, isLoading } = useQuery<Expense>({
    queryKey: expenseKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/expenses/${id}`).then((r) => r.data),
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Edit Expense</h1>
      </div>
      {isLoading ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm">Loading...</p>
      ) : expense ? (
        <ExpenseForm expense={expense} />
      ) : (
        <p className="text-red-500 text-sm">Expense not found</p>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 3: Update ExpenseForm.tsx — add dark mode to all form elements**

Apply the dark class mapping to every element in the component. Key targets:
- Form container: `bg-white` → add `dark:bg-slate-900`
- Labels: `text-slate-600` → add `dark:text-slate-400`
- Inputs/selects: `border-slate-300 bg-white` → add `dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100`
- Error text: keep `text-red-600`
- FX confirmation: `bg-emerald-50 border-emerald-200 text-emerald-800` → add `dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400`
- Cancel button: `border-slate-300 text-slate-600 hover:bg-slate-50` → add `dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800`
- File input: `text-slate-600 file:border-slate-300 file:bg-slate-50 hover:file:bg-slate-100` → add `dark:text-slate-400 dark:file:border-slate-600 dark:file:bg-slate-800 dark:hover:file:bg-slate-700`
- Receipt list items: `text-slate-500 text-slate-300` → add `dark:text-slate-400 dark:text-slate-600`

- [ ] **Step 4: Update approvals/page.tsx — add dark mode**

Apply the dark class mapping. Key targets:
- Access denied section: `text-slate-700` → add `dark:text-slate-300`, `text-slate-500` → add `dark:text-slate-400`
- Report cards: `bg-white` → add `dark:bg-slate-900`
- Report title: `text-slate-900` → add `dark:text-slate-100`
- Description border: `border-slate-100` → add `dark:border-slate-700`
- Reject textarea: `border-slate-200` → add `dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100`
- Cancel button: `text-slate-600 bg-slate-100 hover:bg-slate-200` → add `dark:text-slate-400 dark:bg-slate-800 dark:hover:bg-slate-700`
- Reject button bg: `bg-red-50 text-red-700 hover:bg-red-100` → add `dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50`

- [ ] **Step 5: Update payments/page.tsx — add dark mode**

Same pattern: `bg-white` → `dark:bg-slate-900`, text colors, borders.

- [ ] **Step 6: Update admin/users/page.tsx — add dark mode + overflow-x-auto**

Same pattern plus wrap table in overflow-x-auto. Role select dropdown: add `dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100`.

- [ ] **Step 7: Update categories/page.tsx — add dark mode + overflow-x-auto**

Same pattern for the table, inline form, and edit form. Input fields need `dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100`.

- [ ] **Step 8: Update reports/new/page.tsx — add dark mode**

Apply dark patterns to the form fields, draft expense checkboxes, and buttons.

- [ ] **Step 9: Update reports/[id]/page.tsx — add dark mode + responsive header + overflow-x-auto**

This is the largest page. Key changes:
- Back link: `text-slate-500 hover:text-slate-800` → add `dark:text-slate-400 dark:hover:text-slate-200`
- Page header: add `flex-col sm:flex-row` with `gap-4` for the action buttons
- Stat cards: `bg-white` → add `dark:bg-slate-900`, text colors
- Attach section: `bg-slate-50 border-slate-200` → add `dark:bg-slate-800 dark:border-slate-700`
- Submit/recall/pay action bars: `bg-white border-slate-200` → add `dark:bg-slate-900 dark:border-slate-700`
- Expense table: wrap in overflow-x-auto, add dark variants to thead/tbody

- [ ] **Step 10: Update reports/[id]/edit/page.tsx — add dark mode**

Apply dark patterns to all form elements and text.

- [ ] **Step 11: Commit**

```bash
git add frontend/app/expenses/ frontend/app/reports/ frontend/app/approvals/page.tsx frontend/app/payments/page.tsx frontend/app/admin/users/page.tsx frontend/app/categories/page.tsx frontend/components/expenses/ExpenseForm.tsx
git commit -m "feat(ui): dark mode + responsive for all remaining pages and ExpenseForm"
```

---

## Task 9: Update Docs and Final Commit

**Files:**
- Modify: `HANDOFF.md`
- Modify: `README.md`

- [ ] **Step 1: Update HANDOFF.md with session 5 info**

Add a new "Latest Session" section documenting:
- Dark mode implemented (system preference + manual toggle, persisted in localStorage)
- Mobile responsive layout (collapsible sidebar drawer, responsive tables, flex-wrap filters)
- No backend changes
- All 16 page/component files updated

- [ ] **Step 2: Update README.md**

- Add "Dark mode" and "Mobile responsive" to the features list
- Update the roadmap Phase 7 checkboxes

- [ ] **Step 3: Commit and push**

```bash
git add HANDOFF.md README.md
git commit -m "docs: update HANDOFF.md and README.md — Phase 7 dark mode + mobile responsive"
git push origin main
```
