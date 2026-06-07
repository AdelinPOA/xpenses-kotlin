"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { MileageRates } from "@/lib/api";
import { settingsKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Settings, Save } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: rates, isLoading } = useQuery<MileageRates>({
    queryKey: settingsKeys.mileageRates(),
    queryFn: () => api.get("/settings/mileage-rates").then((r) => r.data),
  });

  const [bt, setBt] = useState("");
  const [at, setAt] = useState("");

  useEffect(() => {
    if (rates) {
      setBt(rates.mileage_rate_before_tax.toString());
      setAt(rates.mileage_rate_after_tax.toString());
    }
  }, [rates]);

  const updateRates = useMutation({
    mutationFn: (data: { mileage_rate_before_tax?: number; mileage_rate_after_tax?: number }) =>
      api.patch("/settings/mileage-rates", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
  });

  const handleSave = () => {
    const btVal = parseFloat(bt);
    const atVal = parseFloat(at);
    if (isNaN(btVal) || isNaN(atVal) || btVal <= 0 || atVal <= 0) return;
    updateRates.mutate({ mileage_rate_before_tax: btVal, mileage_rate_after_tax: atVal });
  };

  if (user?.role !== "chef_finance") {
    return <AppShell><p className="text-red-500 text-sm">Access denied</p></AppShell>;
  }

  if (isLoading) return <AppShell><p className="text-slate-400 text-sm mt-8">Loading...</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-slate-500 dark:text-slate-400" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 max-w-lg">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Mileage Rates</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          These rates apply to new mileage records. Existing records keep their historical rates.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Rate Before Tax (€/km)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={bt}
              onChange={(e) => setBt(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <p className="text-xs text-slate-400 mt-1">Gross rate for accounting purposes</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Rate After Tax (€/km)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <p className="text-xs text-slate-400 mt-1">Net rate used for reimbursement</p>
          </div>

          <button
            onClick={handleSave}
            disabled={updateRates.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {updateRates.isPending ? "Saving..." : "Save Rates"}
          </button>

          {updateRates.isSuccess && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Rates updated successfully.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
