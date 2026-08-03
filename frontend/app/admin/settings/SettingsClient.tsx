"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { MileageRates } from "@/lib/api";
import { settingsKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Settings, Save } from "lucide-react";
import { useTranslations } from "next-intl";

export default function SettingsClient() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const { data: rates, isLoading: ratesLoading } = useQuery<MileageRates>({
    queryKey: settingsKeys.mileageRates(),
    queryFn: () => api.get("/settings/mileage-rates").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const { data: allowanceData, isLoading: allowanceLoading } = useQuery<{ daily_allowance_rate: number }>({
    queryKey: settingsKeys.dailyAllowanceRate(),
    queryFn: () => api.get("/settings/daily-allowance-rate").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const [bt, setBt] = useState("");
  const [at, setAt] = useState("");
  const [dailyRate, setDailyRate] = useState("");

  useEffect(() => {
    if (rates) {
      setBt(rates.mileage_rate_before_tax.toString());
      setAt(rates.mileage_rate_after_tax.toString());
    }
  }, [rates]);

  useEffect(() => {
    if (allowanceData) {
      setDailyRate(allowanceData.daily_allowance_rate.toString());
    }
  }, [allowanceData]);

  const updateRates = useMutation({
    mutationFn: (data: { mileage_rate_before_tax?: number; mileage_rate_after_tax?: number }) =>
      api.patch("/settings/mileage-rates", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
  });

  const updateAllowance = useMutation({
    mutationFn: (data: { daily_allowance_rate: number }) =>
      api.patch("/settings/daily-allowance-rate", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.dailyAllowanceRate() }),
  });

  const handleSaveRates = () => {
    const btVal = parseFloat(bt);
    const atVal = parseFloat(at);
    if (isNaN(btVal) || isNaN(atVal) || btVal <= 0 || atVal <= 0) return;
    updateRates.mutate({ mileage_rate_before_tax: btVal, mileage_rate_after_tax: atVal });
  };

  const handleSaveAllowance = () => {
    const val = parseFloat(dailyRate);
    if (isNaN(val) || val < 0) return;
    updateAllowance.mutate({ daily_allowance_rate: val });
  };

  if (user?.role !== "chef_finance") {
    return <AppShell><p className="text-red-500 text-sm">{t("access_denied")}</p></AppShell>;
  }

  if (ratesLoading || allowanceLoading) return <AppShell><p className="text-slate-400 text-sm mt-8">{tc("loading")}</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-muted" />
          <h1 className="text-2xl font-bold text-foreground">{t("settings_heading")}</h1>
        </div>
      </div>

      <div className="space-y-6 max-w-lg">
        <div className="bg-card rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("mileage_rates")}</h2>
          <p className="text-sm text-muted mb-6">
            {t("mileage_rates_description")}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("rate_before_tax")}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={bt}
                onChange={(e) => setBt(e.target.value)}
                className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
              />
              <p className="text-xs text-slate-400 mt-1">Gross rate for accounting purposes</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("rate_after_tax")}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={at}
                onChange={(e) => setAt(e.target.value)}
                className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
              />
              <p className="text-xs text-slate-400 mt-1">Net rate used for reimbursement</p>
            </div>

            <button
              onClick={handleSaveRates}
              disabled={updateRates.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {updateRates.isPending ? t("saving") : t("save")}
            </button>

            {updateRates.isSuccess && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("config_saved")}</p>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("daily_allowance")}</h2>
          <p className="text-sm text-muted mb-6">
            {t("daily_allowance_description")}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("daily_allowance_rate")}
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
              />
              <p className="text-xs text-slate-400 mt-1">Set to 0 to disable daily allowance</p>
            </div>

            <button
              onClick={handleSaveAllowance}
              disabled={updateAllowance.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {updateAllowance.isPending ? t("saving") : t("save")}
            </button>

            {updateAllowance.isSuccess && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("config_saved")}</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
