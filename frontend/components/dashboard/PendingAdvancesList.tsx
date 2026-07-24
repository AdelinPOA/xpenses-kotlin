"use client";

import { PendingAdvanceSummary } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { CreditCard, Check, X, User } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface PendingAdvancesListProps {
  advances: PendingAdvanceSummary[];
  onSelectAdvance: (reportId: number) => void;
  onPay: (reportId: number, advanceId: number, e: React.MouseEvent) => void;
  onReject: (reportId: number, advanceId: number, e: React.MouseEvent) => void;
}

export default function PendingAdvancesList({
  advances,
  onSelectAdvance,
  onPay,
  onReject,
}: PendingAdvancesListProps) {
  if (advances.length === 0) {
    return (
      <div className="bg-card rounded-xl p-8 border border-border text-center shadow-sm h-full flex flex-col items-center justify-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3">
          <Check className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">No Pending Advances</h3>
        <p className="text-sm text-muted-foreground mt-1">All requested travel advances have been processed.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-foreground text-lg">Pending Advances</h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
            {advances.length}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto flex-1 max-h-[420px]">
        {advances.map((adv) => (
          <div
            key={adv.id}
            onClick={() => onSelectAdvance(adv.report_id)}
            className="p-4 rounded-lg border border-border bg-background/50 hover:bg-muted/30 cursor-pointer transition-all space-y-3 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-medium text-xs">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium text-sm text-foreground">{adv.user_name}</span>
              </div>
              <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                {formatEur(adv.amount_eur)}
              </span>
            </div>

            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground truncate">{adv.report_title}</p>
              {adv.description && <p className="italic mt-0.5 line-clamp-1">{adv.description}</p>}
            </div>

            <div className="pt-2 border-t border-border/60 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
              <span className="text-[11px] text-muted-foreground">
                {adv.created_at ? new Date(adv.created_at).toLocaleDateString() : ""}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => onPay(adv.report_id, adv.id, e)}
                  title="Approve / Pay Advance"
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve
                </button>
                <button
                  onClick={(e) => onReject(adv.report_id, adv.id, e)}
                  title="Reject Advance"
                  className="p-1 rounded-md bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
