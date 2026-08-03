"use client";

import { PendingAdvanceSummary } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { CreditCard, Check, X, User } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  if (advances.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center border border-dashed border-blue-500/40 bg-blue-500/5 p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3">
          <Check className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">{t("no_pending_advances")}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t("all_advances_processed")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-blue-500/[0.035] p-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-500" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-400">{t("payment_queue_label")}</p>
            <h3 className="font-semibold text-foreground text-lg">{t("pending_advances")}</h3>
          </div>
          <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
            {advances.length}
          </span>
        </div>
      </div>

      <div className="max-h-[560px] flex-1 space-y-3 overflow-y-auto p-3">
        {advances.map((adv) => (
          <div
            key={adv.id}
            onClick={() => onSelectAdvance(adv.report_id)}
            className="group cursor-pointer space-y-3 border border-border bg-background/50 p-4 transition-colors hover:bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-medium text-xs">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium text-sm text-foreground">{adv.user_name}</span>
              </div>
              <span className="text-base font-bold tabular-nums text-blue-600 dark:text-blue-400">
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
                  title={t("approve_pay_advance")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  {tc("approve")}
                </button>
                <button
                  onClick={(e) => onReject(adv.report_id, adv.id, e)}
                  title={t("reject_advance")}
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
