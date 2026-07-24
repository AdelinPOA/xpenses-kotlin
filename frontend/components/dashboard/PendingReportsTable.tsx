"use client";

import { PendingReportSummary } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { Check, X, FileText, ChevronRight, User } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface PendingReportsTableProps {
  reports: PendingReportSummary[];
  onSelectReport: (reportId: number) => void;
  onApprove: (reportId: number, e: React.MouseEvent) => void;
  onReject: (reportId: number, e: React.MouseEvent) => void;
}

export default function PendingReportsTable({
  reports,
  onSelectReport,
  onApprove,
  onReject,
}: PendingReportsTableProps) {
  if (reports.length === 0) {
    return (
      <div className="bg-card rounded-xl p-8 border border-border text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-3">
          <Check className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">All Clear!</h3>
        <p className="text-sm text-muted-foreground mt-1">There are no expense reports pending approval.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-foreground text-lg">Pending Reports</h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
            {reports.length}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">Click row for full review</span>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b border-border">
            <tr>
              <th className="px-4 py-3">Submitter</th>
              <th className="px-4 py-3">Report Title</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reports.map((report) => (
              <tr
                key={report.id}
                onClick={() => onSelectReport(report.id)}
                className="hover:bg-muted/30 cursor-pointer transition-colors group"
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-xs">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-foreground">{report.user_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                    {report.title}
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <span className="text-xs text-muted-foreground">{report.expense_count} expenses</span>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">
                  {report.date_submitted ? new Date(report.date_submitted).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                  {formatEur(report.total_amount_eur)}
                </td>
                <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={(e) => onApprove(report.id, e)}
                      title="Approve Report"
                      className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => onReject(report.id, e)}
                      title="Reject Report"
                      className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
