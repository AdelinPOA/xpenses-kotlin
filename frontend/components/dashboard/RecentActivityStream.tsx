"use client";

import { ActivityFeedItem } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { Activity, CheckCircle, Clock, XCircle, CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";

interface RecentActivityStreamProps {
  activities: ActivityFeedItem[];
}

function getActivityMeta(type: string) {
  switch (type) {
    case "report_approved":
      return { Icon: CheckCircle, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10", labelKey: "approved" as const };
    case "report_paid":
    case "advance_paid":
      return { Icon: CreditCard, colorClass: "text-blue-500", bgClass: "bg-blue-500/10", labelKey: "paid" as const };
    case "report_rejected":
      return { Icon: XCircle, colorClass: "text-rose-500", bgClass: "bg-rose-500/10", labelKey: "rejected" as const };
    case "report_submitted":
    default:
      return { Icon: Clock, colorClass: "text-amber-500", bgClass: "bg-amber-500/10", labelKey: "submitted" as const };
  }
}

export default function RecentActivityStream({ activities }: RecentActivityStreamProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  if (!activities || activities.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-base sm:text-lg">{t("team_activity")}</h3>
            <p className="text-xs text-muted-foreground">{t("recent_updates")}</p>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
          {activities.length}
        </span>
      </div>

      <div className="divide-y divide-border">
        {activities.map((item) => {
          const { Icon, colorClass, bgClass, labelKey } = getActivityMeta(item.type);
          return (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:px-5 gap-3 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bgClass} ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                    <span className="font-bold text-foreground">{item.actor_name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold capitalize ${bgClass} ${colorClass}`}>
                      {tc(labelKey)}
                    </span>
                    <span className="text-muted-foreground text-xs truncate max-w-xs sm:max-w-md font-medium">
                      {item.target_title}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : t("just_now")}
                  </p>
                </div>
              </div>

              <div className="self-end sm:self-auto shrink-0">
                <span className="text-sm font-black tabular-nums text-foreground">{formatEur(item.amount_eur)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

