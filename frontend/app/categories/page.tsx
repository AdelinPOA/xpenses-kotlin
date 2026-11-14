"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api, { Category } from "@/lib/api";
import { categoryKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Pencil, X } from "lucide-react";
import { formatEur } from "@/lib/format";
import { useTranslations } from "next-intl";

function formatLimit(limit: number | null, noLimitLabel: string) {
  if (limit === null) return noLimitLabel;
  return formatEur(limit);
}

interface FormState {
  name: string;
  limit_amount: string;
}

export default function CategoriesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations("categories");
  const tc = useTranslations("common");
  const [editId, setEditId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<FormState>({ name: "", limit_amount: "" });
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories?active_only=false").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        limit_amount: form.limit_amount ? parseFloat(form.limit_amount) : null,
      };
      if (editId !== null) return api.patch(`/categories/${editId}`, payload);
      return api.post("/categories", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoryKeys.all });
      setShowNew(false);
      setEditId(null);
      setForm({ name: "", limit_amount: "" });
      setError("");
      setActionError("");
    },
    onError: (e: any) => setError(e.response?.data?.detail ?? t("save_failed")),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      setActionError("");
      qc.invalidateQueries({ queryKey: categoryKeys.all });
    },
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setActionError(detail ?? t("deactivate_failed"));
    },
  });

  const confirmDeactivate = (cat: Category) => {
    if (window.confirm(t("confirm_deactivate", { name: cat.name }))) {
      setActionError("");
      deactivate.mutate(cat.id);
    }
  };

  const startEdit = (cat: Category) => {
    setEditId(cat.id);
    setForm({ name: cat.name, limit_amount: cat.limit_amount?.toString() ?? "" });
    setShowNew(false);
    setError("");
  };

  const cancelEdit = () => {
    setEditId(null);
    setShowNew(false);
    setForm({ name: "", limit_amount: "" });
    setError("");
  };

  useEffect(() => {
    if (!loading && (!user || user.role !== "mod")) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!user || user.role !== "mod") {
    return null;
  }

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("heading")}</h1>
          <p className="text-muted text-sm mt-1">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditId(null); setForm({ name: "", limit_amount: "" }); setError(""); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover"
        >
          <Plus className="w-4 h-4" />
          {t("new_category")}
        </button>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {(showNew || editId !== null) && (
        <div className="bg-card rounded-xl shadow-sm p-6 mb-6 max-w-md">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            {editId !== null ? t("edit_category") : t("new_category")}
          </h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("label_name")}</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("label_limit")} <span className="text-muted-foreground">{t("limit_optional")}</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={form.limit_amount}
                onChange={(e) => setForm((f) => ({ ...f, limit_amount: e.target.value }))}
                placeholder={t("limit_hint")}
                className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { if (form.name) save.mutate(); else setError(t("name_required")); }}
                disabled={save.isPending}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
              >
                {save.isPending ? tc("saving") : tc("save")}
              </button>
              <button onClick={cancelEdit} className="px-4 py-2 border border-input-border text-slate-600 dark:text-slate-400 text-sm rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700">
                {tc("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{tc("loading")}</div>
        ) : !categories?.length ? (
          <EmptyState message={t("no_categories")} />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {categories.map((cat) => (
                <div key={cat.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${cat.is_active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                      <p className="font-medium text-foreground">{cat.name}</p>
                    </div>
                    <p className="text-sm text-muted shrink-0">{formatLimit(cat.limit_amount, t("no_limit"))}</p>
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-3">
                    <button onClick={() => startEdit(cat)}>
                      <Pencil className="w-4 h-4 text-muted-foreground hover:text-blue-600" />
                    </button>
                    {cat.is_active && (
                      <button type="button" onClick={() => confirmDeactivate(cat)} disabled={deactivate.isPending} className="disabled:opacity-40 disabled:cursor-not-allowed">
                        <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-muted uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">{t("table_name")}</th>
                    <th className="text-left px-4 py-3">{t("table_limit")}</th>
                    <th className="text-center px-4 py-3">{tc("active")}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-card-hover">
                      <td className="px-4 py-3 font-medium text-foreground">{cat.name}</td>
                      <td className="px-4 py-3 text-muted">{formatLimit(cat.limit_amount, t("no_limit"))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${cat.is_active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => startEdit(cat)}>
                            <Pencil className="w-4 h-4 text-muted-foreground hover:text-blue-600" />
                          </button>
                          {cat.is_active && (
                            <button type="button" onClick={() => confirmDeactivate(cat)} disabled={deactivate.isPending} className="disabled:opacity-40 disabled:cursor-not-allowed">
                              <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
