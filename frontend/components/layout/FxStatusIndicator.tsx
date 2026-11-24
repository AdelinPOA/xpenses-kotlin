"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import { formatFxProviderShortName, useFxStatus } from "@/lib/fxStatus";
import { formatFuelSourceShortName, useFuelPriceStatus } from "@/lib/fuelStatus";

function SidebarStatusLink({
  href,
  canNavigate,
  onNavigate,
  title,
  className,
  children,
}: {
  href: string;
  canNavigate: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  title: string;
  className: string;
  children: React.ReactNode;
}) {
  if (canNavigate) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        title={title}
        className={`${className} hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
      >
        {children}
      </Link>
    );
  }
  return (
    <div title={title} className={className}>
      {children}
    </div>
  );
}

/** Compact FX provider status indicator shown in the sidebar footer for all signed-in users. */
export function FxSidebarStatusPill({
  onNavigate,
}: {
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { user } = useAuth();
  const tNav = useTranslations("nav");
  const { data } = useFxStatus(Boolean(user));

  if (!user || !data || !Array.isArray(data.providers)) return null;

  const activeProvider = data.providers.find((item) => item.active);
  const canManageSettings = user.role === "mod" || user.role === "chef_finance";
  const activeLabel = formatFxProviderShortName(data.active_source || data.primary_provider);

  const tooltipParts = [
    `FX: ${data.status}`,
    data.active_source
      ? formatFxProviderShortName(data.active_source)
      : formatFxProviderShortName(data.primary_provider),
  ];
  if (activeProvider?.ron_per_eur != null) {
    tooltipParts.push(
      `1 EUR = ${activeProvider.ron_per_eur.toFixed(4)} RON${
        activeProvider.source_date ? ` (${activeProvider.source_date})` : ""
      }`,
    );
  }
  if (data.primary_error) {
    tooltipParts.push(`${formatFxProviderShortName(data.primary_provider)}: ${data.primary_error}`);
  }

  let containerClass =
    "bg-sidebar-border/35 border border-sidebar-border/80 text-slate-300";
  let leftContent = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" aria-hidden="true" />
      <span className="truncate">FX: {activeLabel}</span>
    </span>
  );

  if (data.status === "HEALTHY") {
    containerClass =
      "bg-emerald-500/10 border border-emerald-500/25 text-emerald-200";
    leftContent = (
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
        <span className="truncate">FX: {activeLabel}</span>
      </span>
    );
  } else if (data.status === "FALLBACK") {
    containerClass =
      "bg-amber-500/15 border border-amber-500/40 text-amber-300";
    leftContent = (
      <span className="flex items-center gap-1.5 min-w-0">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <span className="truncate">
          FX: {activeLabel} ({tNav("fx_status_fallback_badge")})
        </span>
      </span>
    );
  } else if (data.status === "DOWN") {
    containerClass =
      "bg-rose-500/15 border border-rose-500/40 text-rose-300";
    leftContent = (
      <span className="flex items-center gap-1.5 min-w-0">
        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" aria-hidden="true" />
        <span className="truncate">FX: {tNav("fx_status_down_short")}</span>
      </span>
    );
  }

  const sharedClassName = `w-full min-h-9 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${containerClass}`;

  return (
    <SidebarStatusLink
      href="/admin/settings#fx-providers"
      canNavigate={canManageSettings}
      onNavigate={onNavigate}
      title={tooltipParts.join(" · ")}
      className={sharedClassName}
    >
      {leftContent}
      {activeProvider?.ron_per_eur != null && (
        <span className="text-[11px] font-mono opacity-85 shrink-0">
          {activeProvider.ron_per_eur.toFixed(4)}
        </span>
      )}
    </SidebarStatusLink>
  );
}

/** Compact daily fuel price provider indicator shown in the sidebar footer for all signed-in users. */
export function FuelSidebarStatusPill({
  onNavigate,
}: {
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { user } = useAuth();
  const tNav = useTranslations("nav");
  const { data } = useFuelPriceStatus(Boolean(user));

  if (!user || !data || !Array.isArray(data.providers)) return null;

  const activeProvider = data.providers.find((item) => item.active);
  const canManageSettings = user.role === "mod" || user.role === "chef_finance";
  const activeLabel = formatFuelSourceShortName(data.active_source || data.primary_provider);

  const tooltipParts = [`${tNav("fuel_status_label")}: ${data.status}`, activeLabel];
  if (activeProvider?.diesel_ron != null) {
    tooltipParts.push(
      `D: ${activeProvider.diesel_ron.toFixed(2)} RON/L${
        activeProvider.source_date ? ` (${activeProvider.source_date})` : ""
      }`,
    );
  }
  if (data.primary_error) {
    tooltipParts.push(`${formatFuelSourceShortName(data.primary_provider)}: ${data.primary_error}`);
  }

  let containerClass =
    "bg-sidebar-border/35 border border-sidebar-border/80 text-slate-300";
  let leftContent = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {tNav("fuel_status_label")}: {activeLabel}
      </span>
    </span>
  );

  if (data.status === "HEALTHY") {
    containerClass =
      "bg-emerald-500/10 border border-emerald-500/25 text-emerald-200";
    leftContent = (
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {tNav("fuel_status_label")}: {activeLabel}
        </span>
      </span>
    );
  } else if (data.status === "FALLBACK") {
    containerClass =
      "bg-amber-500/15 border border-amber-500/40 text-amber-300";
    leftContent = (
      <span className="flex items-center gap-1.5 min-w-0">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {tNav("fuel_status_label")}: {activeLabel} ({tNav("fx_status_fallback_badge")})
        </span>
      </span>
    );
  }

  const sharedClassName = `w-full min-h-9 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${containerClass}`;

  return (
    <SidebarStatusLink
      href="/admin/settings#fuel-prices"
      canNavigate={canManageSettings}
      onNavigate={onNavigate}
      title={tooltipParts.join(" · ")}
      className={sharedClassName}
    >
      {leftContent}
      {activeProvider?.diesel_ron != null && (
        <span className="text-[11px] font-mono opacity-85 shrink-0">
          {activeProvider.diesel_ron.toFixed(2)}
        </span>
      )}
    </SidebarStatusLink>
  );
}

/** Global alert banner surfaced inside AppShell whenever FX resolution degrades to fallback or goes down. */
export function FxFallbackBanner() {
  const { user } = useAuth();
  const tNav = useTranslations("nav");
  const { data } = useFxStatus(Boolean(user));
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (!user || !data || typeof data !== "object" || Array.isArray(data)) return null;
  if (!data.fallback_active && data.status !== "DOWN") return null;

  const alertKey = `${data.status}:${data.active_source ?? "none"}:${data.primary_error ?? ""}`;
  if (dismissedKey === alertKey) return null;

  const canManageSettings = user.role === "mod" || user.role === "chef_finance";
  const isDown = data.status === "DOWN";
  const primaryLabel = formatFxProviderShortName(data.primary_provider);
  const activeLabel = formatFxProviderShortName(data.active_source);

  return (
    <div
      role="alert"
      className={`mb-4 rounded-xl border p-3 text-xs sm:text-sm flex items-start justify-between gap-3 ${
        isDown
          ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200"
          : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {isDown ? (
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-semibold">
            {isDown ? tNav("fx_banner_down_title") : tNav("fx_banner_fallback_title")}{" "}
            <span className="font-normal">
              {isDown
                ? tNav("fx_banner_down_body")
                : tNav("fx_banner_fallback_body", {
                    primary: primaryLabel,
                    active: activeLabel,
                  })}
            </span>
          </p>
          {data.primary_error && (
            <p className="text-xs opacity-85 mt-0.5 break-words">
              {primaryLabel}: {data.primary_error}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {canManageSettings && (
          <Link
            href="/admin/settings#fx-providers"
            className="px-2.5 py-1 rounded-md border border-current/25 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {tNav("fx_banner_settings_link")}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDismissedKey(alertKey)}
          aria-label={tNav("fx_banner_dismiss")}
          title={tNav("fx_banner_dismiss")}
          className="p-1 rounded-md opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Global alert banner surfaced inside AppShell whenever daily fuel pricing degrades to a fallback source. */
export function FuelFallbackBanner() {
  const { user } = useAuth();
  const tNav = useTranslations("nav");
  const { data } = useFuelPriceStatus(Boolean(user));
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (!user || !data || typeof data !== "object" || Array.isArray(data) || !data.fallback_active) return null;

  const alertKey = `${data.status}:${data.active_source ?? "none"}:${data.primary_error ?? ""}`;
  if (dismissedKey === alertKey) return null;

  const canManageSettings = user.role === "mod" || user.role === "chef_finance";
  const primaryLabel = formatFuelSourceShortName(data.primary_provider);
  const activeLabel = formatFuelSourceShortName(data.active_source);

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-start justify-between gap-3"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">
            {tNav("fuel_banner_fallback_title")}{" "}
            <span className="font-normal">
              {tNav("fuel_banner_fallback_body", {
                primary: primaryLabel,
                active: activeLabel,
              })}
            </span>
          </p>
          {data.primary_error && (
            <p className="text-xs opacity-85 mt-0.5 break-words">
              {primaryLabel}: {data.primary_error}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {canManageSettings && (
          <Link
            href="/admin/settings#fuel-prices"
            className="px-2.5 py-1 rounded-md border border-current/25 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {tNav("fuel_banner_settings_link")}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDismissedKey(alertKey)}
          aria-label={tNav("fx_banner_dismiss")}
          title={tNav("fx_banner_dismiss")}
          className="p-1 rounded-md opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
