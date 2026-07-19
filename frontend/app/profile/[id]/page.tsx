"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api, { User, Report } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { ArrowLeft, Calendar, FileText, Eye, X, Receipt } from "lucide-react";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(amount);
}

export default function UserProfileDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"info" | "reports">("info");
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const targetUserId = id ? parseInt(id as string, 10) : null;
  const isSelf = !targetUserId || targetUserId === currentUser?.id;

  // Query details of target user if not self
  const { data: targetUser, isLoading: loadingUser } = useQuery<User>({
    queryKey: ["users", targetUserId],
    queryFn: () => api.get(`/users/${targetUserId}`).then((r) => r.data),
    enabled: !isSelf && !!targetUserId,
  });

  // Query reports of target user
  const { data: reports, isLoading: loadingReports } = useQuery<Report[]>({
    queryKey: ["reports", "user", targetUserId || currentUser?.id],
    queryFn: () =>
      api
        .get("/reports", {
          params: { all: true, user_id: targetUserId || currentUser?.id },
        })
        .then((r) => r.data),
    enabled: !!currentUser,
  });

  // Query specific report details for modal
  const { data: activeReport, isLoading: loadingActiveReport } = useQuery<Report>({
    queryKey: ["reports", "detail", selectedReportId],
    queryFn: () => api.get(`/reports/${selectedReportId}`).then((r) => r.data),
    enabled: !!selectedReportId,
  });

  const profileUser = isSelf ? currentUser : targetUser;
  const isLoading = (!isSelf && loadingUser) || loadingReports;

  if (isLoading) {
    return (
      <AppShell>
        <div className="text-muted-foreground text-sm mt-8">Loading profile...</div>
      </AppShell>
    );
  }

  if (!profileUser) {
    return (
      <AppShell>
        <div className="text-slate-600 dark:text-slate-400 text-sm mt-8">User profile not found.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-2xl font-bold text-foreground">
          {isSelf ? "My Profile" : `${profileUser.display_name}'s Profile`}
        </h1>
        <p className="text-muted text-sm mt-1">
          {isSelf ? "Manage your profile details" : "View staff member profile and reports"}
        </p>
      </div>

      {!isSelf && (
        <div className="flex border-b border-border mb-6">
          <button
            onClick={() => setActiveTab("info")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "info"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            Account Info
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "reports"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            User Reports ({reports?.length ?? 0})
          </button>
        </div>
      )}

      {(isSelf || activeTab === "info") && (
        <div className="max-w-xl bg-card rounded-xl shadow-sm p-6 border border-border">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Account Information</h2>
          <div className="space-y-4">
            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Username</span>
              <p className="text-sm text-foreground mt-0.5">{profileUser.username}</p>
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Display Name</span>
              <p className="text-sm text-foreground mt-0.5">{profileUser.display_name}</p>
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</span>
              <p className="text-sm text-foreground mt-0.5">{profileUser.email || "No email provided"}</p>
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</span>
              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mt-1 uppercase">
                {profileUser.role}
              </span>
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                  profileUser.is_active
                    ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {profileUser.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
      )}

      {!isSelf && activeTab === "reports" && (
        <div className="space-y-4">
          {!reports?.length ? (
            <EmptyState message="No reports found for this user." />
          ) : (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border">
              <>
                {/* Mobile: stacked cards */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {reports.map((report) => (
                    <div key={report.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{report.title}</p>
                          <p className="text-xs text-muted mt-0.5">
                            {report.date_from && report.date_to
                              ? `${report.date_from} — ${report.date_to}`
                              : "-"}
                          </p>
                        </div>
                        <p className="font-bold text-foreground shrink-0">
                          {formatEur(report.total_amount)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <Badge status={report.status} />
                        <button
                          onClick={() => setSelectedReportId(report.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Summary
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-muted uppercase">
                      <tr>
                        <th className="text-left px-4 py-3">Report Title</th>
                        <th className="text-left px-4 py-3">Date Range</th>
                        <th className="text-right px-4 py-3">Total Amount</th>
                        <th className="text-center px-4 py-3">Status</th>
                        <th className="text-center px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {reports.map((report) => (
                        <tr key={report.id} className="hover:bg-card-hover/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {report.title}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {report.date_from && report.date_to
                              ? `${report.date_from} — ${report.date_to}`
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-foreground">
                            {formatEur(report.total_amount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge status={report.status} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setSelectedReportId(report.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Summary
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            </div>
          )}
        </div>
      )}

      {/* Report Summary Modal */}
      {selectedReportId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl shadow-lg border border-border max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                Report Summary
              </h3>
              <button
                onClick={() => setSelectedReportId(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {loadingActiveReport ? (
                <div className="text-sm text-slate-400">Loading summary...</div>
              ) : activeReport ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-background p-4 rounded-xl">
                    <div>
                      <span className="block text-xxs font-bold uppercase tracking-wider text-slate-400">Title</span>
                      <p className="text-sm font-semibold text-foreground">{activeReport.title}</p>
                    </div>
                    <div>
                      <span className="block text-xxs font-bold uppercase tracking-wider text-slate-400">Status</span>
                      <div className="mt-1">
                        <Badge status={activeReport.status} />
                      </div>
                    </div>
                    <div>
                      <span className="block text-xxs font-bold uppercase tracking-wider text-slate-400">Date Range</span>
                      <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {activeReport.date_from} — {activeReport.date_to}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xxs font-bold uppercase tracking-wider text-slate-400">Reimbursable</span>
                      <p className="text-base font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                        {formatEur(activeReport.total_reimbursable)}
                      </p>
                    </div>
                  </div>

                  {/* Expenses breakdown */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4" />
                      Expenses ({activeReport.expenses?.length ?? 0})
                    </h4>
                    {!activeReport.expenses?.length ? (
                      <p className="text-xs text-slate-500 italic">No individual expenses attached.</p>
                    ) : (
                      <div className="border border-border-subtle rounded-lg divide-y divide-slate-100 dark:divide-slate-850">
                        {activeReport.expenses.map((exp) => (
                          <div key={exp.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50/50">
                            <div>
                              <p className="font-semibold text-slate-700 dark:text-slate-300">{exp.merchant || "Unknown Merchant"}</p>
                              <p className="text-slate-400 text-xxs mt-0.5">{exp.category_name} &bull; {exp.date}</p>
                            </div>
                            <span className="font-bold text-foreground">{formatEur(exp.amount_eur)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-red-500">Failed to load report summary.</div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border-subtle bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
              <button
                onClick={() => setSelectedReportId(null)}
                className="px-4 py-2 border border-border text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
              >
                Close
              </button>
              {activeReport && (
                <button
                  onClick={() => {
                    setSelectedReportId(null);
                    router.push(`/reports/${activeReport.id}`);
                  }}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                >
                  View Full Details
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
