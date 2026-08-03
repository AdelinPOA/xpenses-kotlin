"use client";

import { ManagerKpis } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { Clock, FileText, CreditCard, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";

interface ManagerKpiCardsProps {
  kpis: ManagerKpis;
}

export default function ManagerKpiCards({ kpis }: ManagerKpiCardsProps) {
  const t = useTranslations("dashboard");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-card rounded-xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{t("pending_reports")}</span>
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
            <FileText className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-foreground">{kpis.pending_reports_count}</span>
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            {formatEur(kpis.pending_reports_total_eur)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("awaiting_approval")}</p>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{t("pending_advances")}</span>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-foreground">{kpis.pending_advances_count}</span>
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {formatEur(kpis.pending_advances_total_eur)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("requested_advances")}</p>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{t("monthly_team_spend")}</span>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-foreground">{formatEur(kpis.monthly_team_spend_eur)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("approved_this_month")}</p>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{t("avg_turnaround")}</span>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-foreground">{kpis.avg_turnaround_days}</span>
          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">{t("days")}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("submission_speed")}</p>
      </div>
    </div>
  );
}
