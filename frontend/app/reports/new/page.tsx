"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Expense, CURRENCIES } from "@/lib/api";
import { reportKeys, expenseKeys, dashboardKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";

function formatEur(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(amount);
}

export default function NewReportPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState("");

  const { data: draftExpenses } = useQuery<Expense[]>({
    queryKey: expenseKeys.list({ status: "draft" }),
    queryFn: () => api.get("/expenses", { params: { status: "draft" } }).then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: async () => {
      const report = await api
        .post("/reports", {
          title,
          description: description || null,
          date_from: dateFrom || null,
          date_to: dateTo || null,
          currency,
        })
        .then((r) => r.data);

      if (selectedIds.size > 0) {
        await api.post(`/reports/${report.id}/attach`, {
          expense_ids: Array.from(selectedIds),
        });
      }
      return report;
    },
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      qc.invalidateQueries({ queryKey: expenseKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      router.push(`/reports/${report.id}`);
    },
    onError: (e: any) => setError(e.response?.data?.detail ?? "Failed to create report"),
  });

  const toggleExpense = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">New Report</h1>
        <p className="text-muted text-sm mt-1">
          Create a report and optionally attach draft expenses to submit them together.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="bg-card rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Report details</h2>
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. March 2026 travel expenses"
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date from *</label>
              <input
                type="date"
                required
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date to *</label>
              <input
                type="date"
                required
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Default Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Draft expenses to attach */}
        <div className="bg-card rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            Attach draft expenses{" "}
            <span className="text-muted-foreground font-normal">(optional — submits them immediately)</span>
          </h2>
          {!draftExpenses?.length ? (
            <p className="text-muted-foreground text-sm">No draft expenses available.</p>
          ) : (
            <div className="space-y-2">
              {draftExpenses.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-card-hover"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(e.id)}
                    onChange={() => toggleExpense(e.id)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{e.merchant || e.description || "—"}</p>
                    <p className="text-xs text-muted-foreground">{e.date} · {e.category_name || "Uncategorized"}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatEur(e.amount_eur)}
                  </p>
                  <Badge status={e.status} />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { if (title) create.mutate(); else setError("Title is required"); }}
            disabled={create.isPending}
            className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {create.isPending ? "Creating..." : selectedIds.size > 0 ? "Create & attach" : "Create report"}
          </button>
          <button
            onClick={() => router.back()}
            className="px-5 py-2 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </AppShell>
  );
}
