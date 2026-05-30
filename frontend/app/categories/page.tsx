"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api, { Category } from "@/lib/api";
import { categoryKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Pencil, X } from "lucide-react";

function formatLimit(limit: number | null) {
  if (limit === null) return "No limit";
  return new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" }).format(limit);
}

interface FormState {
  name: string;
  limit_amount: string;
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<FormState>({ name: "", limit_amount: "" });
  const [error, setError] = useState("");

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories?active_only=false").then((r) => r.data),
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
    },
    onError: (e: any) => setError(e.response?.data?.detail ?? "Failed to save"),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => api.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all }),
  });

  const startEdit = (cat: Category) => {
    setEditId(cat.id);
    setForm({ name: cat.name, limit_amount: cat.limit_amount?.toString() ?? "" });
    setShowNew(false);
  };

  const cancelEdit = () => {
    setEditId(null);
    setShowNew(false);
    setForm({ name: "", limit_amount: "" });
    setError("");
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <p className="text-slate-500 text-sm mt-1">Manage expense categories and spending limits</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditId(null); setForm({ name: "", limit_amount: "" }); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          New category
        </button>
      </div>

      {(showNew || editId !== null) && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 max-w-md">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            {editId !== null ? "Edit category" : "New category"}
          </h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Spending limit (EUR) <span className="text-slate-400">optional</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={form.limit_amount}
                onChange={(e) => setForm((f) => ({ ...f, limit_amount: e.target.value }))}
                placeholder="Leave empty for no limit"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { if (form.name) save.mutate(); else setError("Name is required"); }}
                disabled={save.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {save.isPending ? "Saving..." : "Save"}
              </button>
              <button onClick={cancelEdit} className="px-4 py-2 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : !categories?.length ? (
          <EmptyState message="No categories yet" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Spending limit</th>
                <th className="text-center px-4 py-3">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{cat.name}</td>
                  <td className="px-4 py-3 text-slate-500">{formatLimit(cat.limit_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${cat.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(cat)}>
                        <Pencil className="w-4 h-4 text-slate-400 hover:text-blue-600" />
                      </button>
                      {cat.is_active && (
                        <button onClick={() => deactivate.mutate(cat.id)} disabled={deactivate.isPending}>
                          <X className="w-4 h-4 text-slate-400 hover:text-red-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
