"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("common");

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="bg-card rounded-xl border border-border shadow-sm p-8 max-w-md w-full text-center space-y-4">
        <p className="text-6xl font-bold text-slate-300 dark:text-slate-700">404</p>
        <h1 className="text-xl font-bold text-foreground">
          {t("not_found_heading")}
        </h1>
        <p className="text-sm text-muted">
          {t("not_found_description")}
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Home className="w-4 h-4" />
          {t("back_to_dashboard")}
        </Link>
      </div>
    </div>
  );
}
