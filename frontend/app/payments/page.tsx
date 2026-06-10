"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
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

  const { data: reports, isLoading, error: fetchError } = useQuery<Report[]>({
    queryKey: reportKeys.list({ status: "approved", all: true }),
    queryFn: () => api.get("/reports", { params: { status: "approved", all: true } }).then((r) => r.data),
    enabled: user?.role === "chef_finance",
  });

  const [mutationError, setMutationError] = useState<string | null>(null);

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post(`/reports/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      setMutationError(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Failed to process payment";
      setMutationError(msg);
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

      {(fetchError || mutationError) && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-800 dark:text-red-300 flex justify-between items-center">
          <span>{mutationError || "Failed to load reports. Please refresh the page."}</span>
          <button
            onClick={() => setMutationError(null)}
            className="text-red-500 hover:text-red-700 font-bold px-2"
          >
            &times;
          </button>
        </div>
      )}

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
                {report.user_display_name && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Submitted by:{" "}
                    <Link href={`/profile/${report.user_id}`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      {report.user_display_name}
                    </Link>
                  </p>
                )}
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
