"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import axios from "axios";
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
  const [ready, setReady] = useState(false);
  // SSR controls must not accept input before React attaches their handlers.
  useEffect(() => setReady(true), []);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const t = useTranslations("auth.login");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = e.currentTarget;
    const formData = new FormData(form);
    const submittedUsername = ((formData.get("username") as string) || username).trim();
    const submittedPassword = (formData.get("password") as string) || password;

    if (!submittedUsername || !submittedPassword) {
      setError(t("error_invalid_credentials"));
      return;
    }

    setLoading(true);
    try {
      const user = await login(submittedUsername, submittedPassword);
      setUser(user);
      // Only allow relative same-origin paths — blocks //evil.com and /\evil.com.
      const next = searchParams.get("next");
      let safeNext = "/dashboard";
      if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
        try {
          const parsed = new URL(next, "http://localhost");
          if (parsed.origin === "http://localhost") {
            safeNext = parsed.pathname + parsed.search + parsed.hash;
          }
        } catch {
          safeNext = "/dashboard";
        }
      }
      router.push(safeNext);
    } catch (err: unknown) {
      setLoading(false);
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError(t("error_rate_limited"));
      } else {
        setError(t("error_invalid_credentials"));
      }
    }
  }

  return (
    <div className="relative min-h-screen min-h-dvh flex items-center justify-center bg-background bg-architectural-grid px-4 py-8 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[540px] h-[280px] rounded-full bg-primary/10 dark:bg-primary/15 blur-3xl"
      />
      <div className="relative w-full max-w-[400px] bg-card/95 backdrop-blur-sm rounded-2xl shadow-[0_20px_50px_-15px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] border border-border overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-primary via-orange-500 to-amber-500" aria-hidden="true" />
        <div className="p-7 sm:p-8">
          <div className="flex flex-col items-center text-center mb-7">
            <div className="p-1.5 rounded-full bg-surface-subtle ring-1 ring-border shadow-2xs mb-3.5">
              <Image src="/logo.png" alt="Newtech Automation" width={52} height={52} className="rounded-full" loading="eager" />
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">{t("app_name")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-medium px-3.5 py-2.5 rounded-xl"
              >
                {error}
              </div>
            )}
            <div>
              <label htmlFor="login-username" className="block text-xs font-semibold text-foreground mb-1.5">
                {t("label_username")}
              </label>
              <input
                id="login-username"
                disabled={!ready || loading}
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-11 px-3.5 py-2.5 border border-input-border rounded-xl bg-input text-foreground text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                required
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-foreground mb-1.5">
                {t("label_password")}
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  disabled={!ready || loading}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-11 px-3.5 py-2.5 pr-11 border border-input-border rounded-xl bg-input text-foreground text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  disabled={!ready || loading}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? t("hide_password") : t("show_password")}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl transition-colors"
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={!ready || loading}
              className="w-full min-h-11 mt-1 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-hover shadow-sm hover:shadow transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {loading ? t("button_sign_in_loading") : t("button_sign_in")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
