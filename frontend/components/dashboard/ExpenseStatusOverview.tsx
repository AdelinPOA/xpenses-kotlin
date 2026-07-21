"use client";

import React, { useMemo } from "react";

interface ExpenseStatusOverviewProps {
  approved: number;
  pending: number;
  total: number;
}

export default function ExpenseStatusOverview({ approved, pending, total }: ExpenseStatusOverviewProps) {
  const arcLength = 113.097; // PI * r (r=36)

  const { approvedLength, pendingLength, approvedPercent, pendingPercent } = useMemo(() => {
    const safeTotal = total || 1;
    const appPct = Math.min(approved / safeTotal, 1);
    const penPct = Math.min(pending / safeTotal, 1);

    return {
      approvedLength: appPct * arcLength,
      pendingLength: penPct * arcLength,
      approvedPercent: Math.round((approved / safeTotal) * 100),
      pendingPercent: Math.round((pending / safeTotal) * 100),
    };
  }, [approved, pending, total, arcLength]);

  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col justify-between min-h-[220px]">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Expense Status Overview</h2>
      
      <div className="flex items-center justify-between gap-6 flex-1">
        {/* Semi-Donut Gauge */}
        <div className="relative w-36 h-24 flex items-end justify-center">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 100 55">
            {/* Background Arc */}
            <path
              d="M 14 48 A 36 36 0 0 1 86 48"
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            {/* Approved Arc (Green) */}
            {approved > 0 && (
              <path
                d="M 14 48 A 36 36 0 0 1 86 48"
                fill="none"
                stroke="#10b981"
                strokeWidth="9"
                strokeDasharray={`${approvedLength} ${arcLength}`}
                strokeDashoffset="0"
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            )}
            {/* Pending Arc (Orange) */}
            {pending > 0 && (
              <path
                d="M 14 48 A 36 36 0 0 1 86 48"
                fill="none"
                stroke="#f97316"
                strokeWidth="9"
                strokeDasharray={`${pendingLength} ${arcLength}`}
                strokeDashoffset={-approvedLength}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.5s ease, stroke-dasharray 0.5s ease" }}
              />
            )}
          </svg>

          {/* Centered label inside gauge */}
          <div className="absolute bottom-1 text-center">
            <span className="text-2xl font-black text-foreground block leading-tight">{total}</span>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 flex flex-col justify-center gap-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-muted">Approved</span>
            </div>
            <span className="text-foreground font-black">{approved} ({approvedPercent}%)</span>
          </div>

          <div className="flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
              <span className="text-muted">Pending</span>
            </div>
            <span className="text-foreground font-black">{pending} ({pendingPercent}%)</span>
          </div>

          <div className="flex items-center justify-between text-xs font-semibold border-t border-border-subtle pt-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
              <span className="text-muted">Total Requests</span>
            </div>
            <span className="text-foreground font-black">{total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
