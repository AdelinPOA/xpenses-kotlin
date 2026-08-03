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
    <div className="border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground text-lg">{t("team_activity")}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{t("recent_updates")}</span>
      </div>

      <div className="space-y-1">
        {activities.map((item) => {
          const { Icon, colorClass, bgClass, labelKey } = getActivityMeta(item.type);
          return (
            <div
              key={item.id}
              className="flex flex-col items-start gap-2 border-l border-border py-3 pl-4 text-sm transition-colors hover:border-primary hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={`rounded-full p-2 ${bgClass} ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
                    <span>{item.actor_name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${colorClass}`}>
                      {tc(labelKey)}
                    </span>
                    <span className="max-w-[9rem] truncate text-muted-foreground font-normal sm:max-w-xs">{item.target_title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : t("just_now")}
                  </p>
                </div>
              </div>

              <div className="self-end sm:self-auto">
                <span className="font-semibold tabular-nums text-foreground">{formatEur(item.amount_eur)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
