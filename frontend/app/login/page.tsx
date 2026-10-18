"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import Image from "next/image";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const t = useTranslations("auth.login");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(username, password);
      setUser(user);
      // Only allow in-app absolute paths — blocks open redirects like "//evil.com".
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch {
      setError(t("error_invalid_credentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="bg-card p-8 rounded-xl shadow-lg border border-border w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Image src="/logo.png" alt="Newtech Automation" width={56} height={56} className="rounded-full mb-3" loading="eager" />
          <h1 className="text-xl font-bold text-foreground">{t("app_name")}</h1>
          <p className="text-sm text-muted mt-1">{t("subtitle")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label htmlFor="login-username" className="block text-sm font-medium text-foreground mb-1">{t("label_username")}</label>
            <input
              id="login-username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-foreground mb-1">{t("label_password")}</label>
            <div className="relative">
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-11 px-3 py-2 pr-11 border border-input-border rounded-lg bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? t("hide_password") : t("show_password")}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
              >
                {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-11 bg-primary text-white py-2 rounded-lg font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? t("button_sign_in_loading") : t("button_sign_in")}
          </button>
        </form>
      </div>
    </div>
  );
}
