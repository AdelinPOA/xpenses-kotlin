"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import api, { Report } from "@/lib/api";
import { reportKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { CheckCircle, XCircle } from "lucide-react";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(amount);
}

export default function ApprovalsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: reports, isLoading, error: fetchError } = useQuery<Report[]>({
    queryKey: reportKeys.list({ status: "submitted", all: true }),
    queryFn: () => api.get("/reports", { params: { status: "submitted", all: true } }).then((r) => r.data),
    enabled: user?.role === "manager" || user?.role === "chef_finance",
  });

  const [mutationError, setMutationError] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.post(`/reports/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      setMutationError(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Failed to approve report";
      setMutationError(msg);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/reports/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      setRejectingId(null);
      setRejectReason("");
      setMutationError(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Failed to reject report";
      setMutationError(msg);
    },
  });

  if (!user || (user.role !== "manager" && user.role !== "chef_finance")) {
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Approvals</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Reports waiting for your approval
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
        <EmptyState message="No reports pending approval" />
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6"
            >
              <div className="flex items-start justify-between gap-4">
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
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {report.expenses.length} expense{report.expenses.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {formatEur(report.total_amount)}
                  </p>
                  {report.submitted_at && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Submitted {new Date(report.submitted_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              {report.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                  {report.description}
                </p>
              )}

              {rejectingId === report.id ? (
                <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-4">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Rejection reason
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none dark:bg-slate-800 dark:text-slate-100"
                    placeholder="Explain why this report is being rejected..."
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() =>
                        rejectMutation.mutate({ id: report.id, reason: rejectReason })
                      }
                      disabled={rejectMutation.isPending || !rejectReason.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Confirm rejection
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                      className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-4 border-t border-slate-100 dark:border-slate-700 pt-4">
                  <button
                    onClick={() => approveMutation.mutate(report.id)}
                    disabled={approveMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => setRejectingId(report.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
