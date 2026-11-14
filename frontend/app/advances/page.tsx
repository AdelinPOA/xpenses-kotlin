"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { PendingAdvance, CURRENCIES } from "@/lib/api";
import { advanceKeys, reportKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { formatAmount } from "@/lib/format";
import { useTranslations } from "next-intl";

export default function GlobalAdvancesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations("advances");
  const tc = useTranslations("common");

  const isAllowed = user?.role === "manager" || user?.role === "chef_finance" || user?.role === "mod";

  useEffect(() => {
    if (!loading && (!user || !isAllowed)) router.replace("/dashboard");
  }, [user, loading, router, isAllowed]);

  const [payingId, setPayingId] = useState<number | null>(null);
  const [payReportId, setPayReportId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("EUR");
  const [payDate, setPayDate] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const extractDetail = (err: unknown) => {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return detail || t("action_failed");
  };

  const { data: pending = [], isLoading } = useQuery<PendingAdvance[]>({
    queryKey: advanceKeys.pending(),
    queryFn: () => api.get("/advances/pending").then((r) => r.data),
  });

  const invalidate = () => {
    setActionError(null);
    qc.invalidateQueries({ queryKey: advanceKeys.all });
    qc.invalidateQueries({ queryKey: reportKeys.all });
  };

  const payAdvance = useMutation({
    mutationFn: ({ reportId, advanceId, ...body }: { reportId: number; advanceId: number; amount: number; currency: string; date: string }) =>
      api.post(`/reports/${reportId}/advances/${advanceId}/pay`, body),
    onSuccess: () => {
      invalidate();
      setPayingId(null);
      setPayReportId(null);
      setPayAmount("");
      setPayCurrency("EUR");
      setPayDate("");
    },
    onError: (err) => setActionError(extractDetail(err)),
  });

  const rejectAdvance = useMutation({
    mutationFn: ({ reportId, advanceId }: { reportId: number; advanceId: number }) =>
      api.post(`/reports/${reportId}/advances/${advanceId}/reject`, { reason: "" }),
    onSuccess: invalidate,
    onError: (err) => setActionError(extractDetail(err)),
  });

  const handlePay = () => {
    if (!payingId || !payReportId) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0 || !payDate) return;
    payAdvance.mutate({ reportId: payReportId, advanceId: payingId, amount: amt, currency: payCurrency, date: payDate });
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!user || !isAllowed) {
    return null;
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("heading")}</h1>
        <p className="text-sm text-muted mt-1">{t("subtitle")}</p>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{tc("loading")}</p>
      ) : pending.length === 0 ? (
        <div className="bg-card rounded-xl shadow-sm p-8 text-center">
          <p className="text-muted-foreground text-sm">{t("no_requests")}</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm">
          {/* Mobile: stacked cards */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
            {pending.map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{a.user_display_name}</p>
                    <Link href={`/reports/${a.report_id}/advances`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      {a.report_title}
                    </Link>
                  </div>
                  <p className="font-semibold text-orange-600 dark:text-orange-400 shrink-0">
                    {formatAmount(a.requested_amount || 0, a.requested_currency || "EUR")}
                  </p>
                </div>
                {a.description && (
                  <p className="text-sm text-muted mt-2">{a.description}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setPayingId(a.id);
                        setPayReportId(a.report_id);
                        setPayAmount(String(a.requested_amount || ""));
                        setPayCurrency(a.requested_currency || "EUR");
                      }}
                      className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    >
                      {tc("paid")}
                    </button>
                    <button
                      onClick={() => rejectAdvance.mutate({ reportId: a.report_id, advanceId: a.id })}
                      disabled={rejectAdvance.isPending}
                      className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {tc("rejected")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-muted uppercase">
                <tr>
                  <th className="text-left px-4 py-3">{t("technician")}</th>
                  <th className="text-left px-4 py-3">{t("report")}</th>
                  <th className="text-right px-4 py-3">{t("requested_amount")}</th>
                  <th className="text-left px-4 py-3">{t("description")}</th>
                  <th className="text-left px-4 py-3">{t("date_requested")}</th>
                  <th className="text-right px-4 py-3">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-3 font-medium text-foreground">{a.user_display_name}</td>
                    <td className="px-4 py-3">
                      <Link href={`/reports/${a.report_id}/advances`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {a.report_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-orange-600 dark:text-orange-400">
                      {formatAmount(a.requested_amount || 0, a.requested_currency || "EUR")}
                    </td>
                    <td className="px-4 py-3 text-muted">{a.description || "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setPayingId(a.id);
                            setPayReportId(a.report_id);
                            setPayAmount(String(a.requested_amount || ""));
                            setPayCurrency(a.requested_currency || "EUR");
                          }}
                          className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                          {tc("paid")}
                        </button>
                        <button
                          onClick={() => rejectAdvance.mutate({ reportId: a.report_id, advanceId: a.id })}
                          disabled={rejectAdvance.isPending}
                          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          {tc("rejected")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inline pay form */}
      {payingId && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            {t("set_payment")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={t("final_amount")}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground w-32"
            />
            <select
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
              className="px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handlePay}
              disabled={payAdvance.isPending || !payAmount || !payDate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {payAdvance.isPending ? t("paying") : t("confirm_payment")}
            </button>
            <button
              onClick={() => { setPayingId(null); setPayReportId(null); }}
              className="flex items-center gap-2 px-4 py-2 border border-input-border text-slate-600 dark:text-slate-400 text-sm rounded-lg hover:bg-card-hover"
            >
              <X className="w-4 h-4" /> {tc("cancel")}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
