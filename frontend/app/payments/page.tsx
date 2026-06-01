"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Report } from "@/lib/api";
import { reportKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { Banknote, XCircle } from "lucide-react";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: reportKeys.list({ status: "approved" }),
    queryFn: () => api.get("/reports", { params: { status: "approved" } }).then((r) => r.data),
    enabled: user?.role === "chef_finance",
  });

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post(`/reports/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
    },
  });

  if (!user || user.role !== "chef_finance") {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center mt-24 text-center">
          <XCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">Access Denied</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
            You do not have permission to view this page.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Payments</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Approved reports ready to be paid
        </p>
      </div>

      {isLoading ? (
        <div className="text-slate-400 dark:text-slate-500 text-sm mt-8">Loading...</div>
      ) : !reports?.length ? (
        <EmptyState message="No approved reports awaiting payment" />
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {report.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {report.date_from && report.date_to
                    ? `${report.date_from} — ${report.date_to}`
                    : "No date range set"}
                </p>
                {report.approved_at && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Approved {new Date(report.approved_at).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-6 shrink-0">
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {formatEur(report.total_amount)}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {report.expenses.length} expense{report.expenses.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => payMutation.mutate(report.id)}
                  disabled={payMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Banknote className="w-4 h-4" />
                  Mark as Paid
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
