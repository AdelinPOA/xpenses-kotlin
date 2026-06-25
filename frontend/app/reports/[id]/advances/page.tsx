"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Report, CURRENCIES } from "@/lib/api";
import { reportKeys, advanceKeys } from "@/lib/queryKeys";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import { ArrowLeft, Plus, Check, X, Trash2 } from "lucide-react";
import Link from "next/link";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

export default function AdvancesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const reportId = parseInt(id);
  const qc = useQueryClient();
  const { user } = useAuth();

  const [formType, setFormType] = useState<"paid" | "request" | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  const [payingId, setPayingId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("EUR");
  const [payDate, setPayDate] = useState("");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => api.get(`/reports/${id}`).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: reportKeys.detail(reportId) });
    qc.invalidateQueries({ queryKey: advanceKeys.all });
  };

  const addAdvance = useMutation({
    mutationFn: (data: { type: string; amount: number; currency: string; date?: string; description: string | null }) =>
      api.post(`/reports/${id}/advances`, data),
    onSuccess: () => {
      invalidate();
      setFormType(null);
      setAmount("");
      setCurrency("EUR");
      setDate("");
      setDescription("");
    },
  });

  const deleteAdvance = useMutation({
    mutationFn: (advanceId: number) => api.delete(`/reports/${id}/advances/${advanceId}`),
    onSuccess: invalidate,
  });

  const payAdvance = useMutation({
    mutationFn: ({ advanceId, ...body }: { advanceId: number; amount: number; currency: string; date: string }) =>
      api.post(`/reports/${id}/advances/${advanceId}/pay`, body),
    onSuccess: () => {
      invalidate();
      setPayingId(null);
      setPayAmount("");
      setPayCurrency("EUR");
      setPayDate("");
    },
  });

  const rejectAdvance = useMutation({
    mutationFn: ({ advanceId, reason }: { advanceId: number; reason: string }) =>
      api.post(`/reports/${id}/advances/${advanceId}/reject`, { reason }),
    onSuccess: invalidate,
  });

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    if (formType === "paid" && !date) return;
    addAdvance.mutate({
      type: formType!,
      amount: amt,
      currency,
      ...(formType === "paid" ? { date } : {}),
      description: description || null,
    });
  };

  const handlePay = (advanceId: number) => {
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0 || !payDate) return;
    payAdvance.mutate({ advanceId, amount: amt, currency: payCurrency, date: payDate });
  };

  if (isLoading) return <AppShell><p className="text-slate-400 dark:text-slate-500 text-sm mt-8">Loading...</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">Report not found</p></AppShell>;

  const isOwner = user?.id === report.user_id;
  const isPrivileged = user && ["manager", "chef_finance", "mod"].includes(user.role);
  const canManage = user && ["manager", "chef_finance"].includes(user.role);

  const paidAdvances = report.advances.filter((a) => a.status === "paid");
  const requestedAdvances = report.advances.filter((a) => a.status === "requested");
  const rejectedAdvances = report.advances.filter((a) => a.status === "rejected");
  const totalPaid = paidAdvances.reduce((s, a) => s + a.amount_eur, 0);
  const totalRequested = requestedAdvances.reduce((s, a) => s + (a.requested_amount || 0), 0);

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <Link href={`/reports/${id}`} className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to report
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Advance Payments</h1>
          <Badge status={report.status} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{report.title}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-emerald-500 uppercase mb-1">Total Paid</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(totalPaid, "EUR")}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-orange-500 uppercase mb-1">Pending Requests</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
            {requestedAdvances.length} — {formatAmount(totalRequested, "EUR")}
          </p>
        </div>
        {rejectedAdvances.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
            <p className="text-xs text-red-500 uppercase mb-1">Rejected</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{rejectedAdvances.length}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {(isOwner || isPrivileged) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {isOwner && report.status === "draft" && (
            <button
              onClick={() => setFormType(formType === "paid" ? null : "paid")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                formType === "paid"
                  ? "bg-emerald-600 text-white"
                  : "border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              }`}
            >
              <Plus className="w-4 h-4" /> Add self-paid
            </button>
          )}
          {isOwner && (
            <button
              onClick={() => setFormType(formType === "request" ? null : "request")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                formType === "request"
                  ? "bg-orange-600 text-white"
                  : "border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30"
              }`}
            >
              <Plus className="w-4 h-4" /> Request advance
            </button>
          )}
          {isPrivileged && !isOwner && (
            <button
              onClick={() => setFormType(formType === "paid" ? null : "paid")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                formType === "paid"
                  ? "bg-emerald-600 text-white"
                  : "border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              }`}
            >
              <Plus className="w-4 h-4" /> Add paid advance
            </button>
          )}
        </div>
      )}

      {/* Add/Request form */}
      {formType && (
        <div className={`rounded-xl p-4 mb-6 border ${
          formType === "paid"
            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50"
            : "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50"
        }`}>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            {formType === "paid" ? "Add paid advance:" : "Request advance from company:"}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {formType === "paid" && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            )}
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-32"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 flex-1"
            />
            <button
              onClick={handleAdd}
              disabled={addAdvance.isPending || !amount || (formType === "paid" && !date)}
              className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 whitespace-nowrap ${
                formType === "paid" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"
              }`}
            >
              <Plus className="w-4 h-4" />
              {addAdvance.isPending ? "Adding..." : formType === "paid" ? "Add advance" : "Submit request"}
            </button>
          </div>
        </div>
      )}

      {/* Advances table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            All Advances ({report.advances.length})
          </h2>
        </div>
        {report.advances.length === 0 ? (
          <p className="p-6 text-sm text-slate-400 dark:text-slate-500 text-center">No advance payments yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">Requested</th>
                  <th className="text-right px-4 py-3">Paid (EUR)</th>
                  <th className="text-left px-4 py-3">Paid By</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...requestedAdvances, ...paidAdvances, ...rejectedAdvances].map((a) => (
                  <tr key={a.id} className={`border-t border-slate-100 dark:border-slate-700 ${a.status === "rejected" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                        a.status === "requested" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{a.date || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{a.description || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                      {a.requested_amount ? formatAmount(a.requested_amount, a.requested_currency || "EUR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {a.status === "paid" ? formatAmount(a.amount_eur, "EUR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{a.paid_by_name || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {a.status === "requested" && canManage && payingId !== a.id && (
                          <>
                            <button
                              onClick={() => { setPayingId(a.id); setPayAmount(String(a.requested_amount || "")); setPayCurrency(a.requested_currency || "EUR"); }}
                              className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Pay
                            </button>
                            <button
                              onClick={() => rejectAdvance.mutate({ advanceId: a.id, reason: "" })}
                              className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {a.status === "requested" && isOwner && (
                          <button onClick={() => deleteAdvance.mutate(a.id)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {a.status === "paid" && report.status === "draft" && (isOwner || isPrivileged) && (
                          <button onClick={() => deleteAdvance.mutate(a.id)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {a.status === "rejected" && isOwner && (
                          <button onClick={() => deleteAdvance.mutate(a.id)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline pay form */}
      {payingId && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Set payment amount for request #{payingId}:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Final amount"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-32"
            />
            <select
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => handlePay(payingId)}
              disabled={payAdvance.isPending || !payAmount || !payDate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {payAdvance.isPending ? "Paying..." : "Confirm payment"}
            </button>
            <button
              onClick={() => setPayingId(null)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
