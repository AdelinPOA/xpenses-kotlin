"use client";

import { PendingAdvanceSummary } from "@/lib/api";
import { formatEur } from "@/lib/format";
import Link from "next/link";
import { CreditCard, Check, X, User } from "lucide-react";
import { useTranslations } from "next-intl";

interface PendingAdvancesListProps {
  advances: PendingAdvanceSummary[];
  onSelectAdvance?: (reportId: number) => void;
  onPay: (reportId: number, advanceId: number, e: React.MouseEvent) => void;
  onReject: (reportId: number, advanceId: number, e: React.MouseEvent) => void;
}

export default function PendingAdvancesList({
  advances,
  onPay,
  onReject,
}: PendingAdvancesListProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  if (advances.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-blue-500/40 bg-blue-500/5 p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3">
          <Check className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-foreground">{t("no_pending_advances")}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t("all_advances_processed")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-blue-500/[0.04] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-400">
              {t("payment_queue_label")}
            </p>
            <h3 className="font-bold text-foreground text-base sm:text-lg">{t("pending_advances")}</h3>
          </div>
          <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-black text-blue-700 dark:text-blue-400 ml-1">
            {advances.length}
          </span>
        </div>
        <Link href="/advances" className="text-xs font-semibold text-primary hover:underline">
          {t("see_all")}
        </Link>
      </div>

      {/* List items without scroll traps */}
      <div className="divide-y divide-border">
        {advances.map((adv) => (
          <div
            key={adv.id}
            className="p-4 sm:p-5 space-y-3 bg-card hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <span className="font-bold text-sm text-foreground truncate">{adv.user_name}</span>
              </div>
              <span className="text-base font-black tabular-nums text-blue-600 dark:text-blue-400 shrink-0">
                {formatEur(adv.amount_eur)}
              </span>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/50">
              <p className="font-semibold text-foreground truncate">{adv.report_title}</p>
              {adv.description && <p className="italic mt-0.5 line-clamp-2 text-foreground/80">{adv.description}</p>}
            </div>

            <div className="pt-1 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {adv.created_at ? new Date(adv.created_at).toLocaleDateString() : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => onPay(adv.report_id, adv.id, e)}
                  title={t("approve_pay_advance")}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  {tc("approve")}
                </button>
                <button
                  type="button"
                  onClick={(e) => onReject(adv.report_id, adv.id, e)}
                  title={t("reject_advance")}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  {tc("reject")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

