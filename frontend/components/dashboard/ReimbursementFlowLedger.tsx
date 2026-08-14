"use client";

import React from "react";
import Link from "next/link";
import { formatEur } from "@/lib/format";
import { FileEdit, Clock, CheckCircle2, ArrowRight, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface StatusData {
  draftCount: number;
  draftEur: number;
  submittedCount: number;
  submittedEur: number;
  paidCount: number;
  paidEur: number;
}

interface ReimbursementFlowLedgerProps {
  totals: StatusData;
}

export default function ReimbursementFlowLedger({ totals }: ReimbursementFlowLedgerProps) {
  const t = useTranslations("dashboard");

  const steps = [
    {
      key: "draft",
      href: "/reports?status=draft",
      label: t("draft_reports"),
      subLabel: t("ready_to_submit"),
      count: totals.draftCount,
      amountEur: totals.draftEur,
      icon: FileEdit,
      statusClass: "border-border hover:border-foreground/30 bg-card",
      badgeClass: "bg-muted/15 text-foreground",
      iconClass: "text-muted-foreground bg-muted/15",
    },
    {
      key: "submitted",
      href: "/reports?status=submitted",
      label: t("submitted_reports"),
      subLabel: t("in_review"),
      count: totals.submittedCount,
      amountEur: totals.submittedEur,
      icon: Clock,
      statusClass: "border-amber-500/30 hover:border-amber-500/60 bg-amber-500/5",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      iconClass: "text-amber-600 dark:text-amber-400 bg-amber-500/15",
    },
    {
      key: "paid",
      href: "/reports?status=paid",
      label: t("paid_reports"),
      subLabel: t("all_settled"),
      count: totals.paidCount,
      amountEur: totals.paidEur,
      icon: CheckCircle2,
      statusClass: "border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/5",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      iconClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15",
    },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("reimbursement_pipeline")}
          </span>
          <h2 className="text-sm font-bold text-foreground mt-0.5">{t("report_summary")}</h2>
        </div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline group"
        >
          <span>{t("see_all")}</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 relative">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.key}
              href={step.href}
              className={`relative rounded-xl border p-4 transition-all duration-200 cursor-pointer group flex flex-col justify-between hover:shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${step.statusClass}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${step.iconClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {step.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${step.badgeClass}`}>
                    {step.count}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-border/50 flex items-baseline justify-between">
                <span className="text-[11px] text-muted-foreground font-medium">{step.subLabel}</span>
                <span className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
                  {formatEur(step.amountEur)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
