"use client";

import { ActivityFeedItem } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { Activity, CheckCircle, Clock, XCircle, CreditCard, ArrowRight } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface RecentActivityStreamProps {
  activities: ActivityFeedItem[];
}

function getActivityMeta(type: string) {
  switch (type) {
    case "report_approved":
      return { Icon: CheckCircle, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10", label: "Approved" };
    case "report_paid":
    case "advance_paid":
      return { Icon: CreditCard, colorClass: "text-blue-500", bgClass: "bg-blue-500/10", label: "Paid" };
    case "report_rejected":
      return { Icon: XCircle, colorClass: "text-rose-500", bgClass: "bg-rose-500/10", label: "Rejected" };
    case "report_submitted":
    default:
      return { Icon: Clock, colorClass: "text-amber-500", bgClass: "bg-amber-500/10", label: "Submitted" };
  }
}

export default function RecentActivityStream({ activities }: RecentActivityStreamProps) {
  if (!activities || activities.length === 0) {
    return null;
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground text-lg">Team Activity Stream</h3>
        </div>
        <span className="text-xs text-muted-foreground">Recent status updates</span>
      </div>

      <div className="space-y-3">
        {activities.map((item) => {
          const { Icon, colorClass, bgClass, label } = getActivityMeta(item.type);
          return (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors text-sm"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${bgClass} ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <span>{item.actor_name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${colorClass}`}>
                      {label}
                    </span>
                    <span className="text-muted-foreground font-normal truncate max-w-xs">{item.target_title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : "Just now"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground">{formatEur(item.amount_eur)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
