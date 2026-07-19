"use client";

import React, { useMemo } from "react";

interface ExpenseStatusOverviewProps {
  approved: number;
  pending: number;
  total: number;
}

export default function ExpenseStatusOverview({ approved, pending, total }: ExpenseStatusOverviewProps) {
  // Calculations for a 180-degree gauge arc
  // Radius r = 35. Circumference of full circle = 2 * pi * 35 = 219.9.
  // Half circle length = 109.9. We'll use 110 as the base arc length.
  const r = 35;
  const c = 2 * Math.PI * r; // ~219.91
  const halfCircumference = c / 2; // ~109.96
  
  const { approvedOffset, pendingOffset, approvedPercent, pendingPercent } = useMemo(() => {
    const safeTotal = total || 1;
    const appPct = approved / safeTotal;
    const penPct = pending / safeTotal;
    
    // Approved starts from left (0) to right
    const appLength = appPct * halfCircumference;
    const penLength = penPct * halfCircumference;
    
    // SVG stroke-dashoffset:
    // Full circumference is C. The stroke starts at 3 o'clock. We rotate the circle -180deg so it starts at 9 o'clock.
    // Base dasharray will be `${halfCircumference} ${c}` so it only covers the top half.
    // For approved: length is appLength, dashoffset is 0 (full length visible up to appLength).
    // For pending: it should start where approved ends. So its offset is -appLength.
    
    return {
      approvedOffset: 0,
      pendingOffset: -appLength,
      approvedPercent: Math.round(appPct * 100),
      pendingPercent: Math.round(penPct * 100),
    };
  }, [approved, pending, total]);

  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col justify-between h-56">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Expense Status Overview</h2>
      
      <div className="flex items-center justify-between gap-6 flex-1">
        {/* Semi-Donut Gauge */}
        <div className="relative w-32 h-20 flex items-end justify-center overflow-hidden">
          <svg className="w-full h-24 transform -rotate-180" viewBox="0 0 100 50">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="10"
              strokeDasharray={`${halfCircumference} ${c}`}
              strokeLinecap="round"
            />
            {/* Approved Arc (Green) */}
            {approved > 0 && (
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="#10b981" // emerald-500
                strokeWidth="10"
                strokeDasharray={`${approved * halfCircumference / (total || 1)} ${c}`}
                strokeDashoffset={approvedOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            )}
            {/* Pending Arc (Orange) */}
            {pending > 0 && (
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="#f97316" // orange-500
                strokeWidth="10"
                strokeDasharray={`${pending * halfCircumference / (total || 1)} ${c}`}
                strokeDashoffset={pendingOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.5s ease, stroke-dasharray 0.5s ease" }}
              />
            )}
          </svg>

          {/* Absolute labels inside the semi-donut */}
          <div className="absolute bottom-1 text-center">
            <span className="text-2xl font-black text-foreground">{total}</span>
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
