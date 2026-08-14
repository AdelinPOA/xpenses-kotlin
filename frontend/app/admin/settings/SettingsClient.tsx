"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiValidationError, FxMargins, MileageRates } from "@/lib/api";
import { settingsKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Settings, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AxiosError } from "axios";

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

  const { data: fxMarginsData, isLoading: fxMarginsLoading } = useQuery<FxMargins>({
    queryKey: settingsKeys.fxMargins(),
    queryFn: () => api.get("/settings/fx-margins").then((r) => ({ ...r.data, defaultMargin: r.data.default_margin })),
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const [bt, setBt] = useState("");
  const [fuelConsumption, setFuelConsumption] = useState("");
  const [fuelPrice, setFuelPrice] = useState("");
  const [pensionRate, setPensionRate] = useState("");
  const [healthRate, setHealthRate] = useState("");
  const [incomeTaxRate, setIncomeTaxRate] = useState("");
  const [taxDeduction, setTaxDeduction] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [fxMargins, setFxMargins] = useState<Record<string, string>>({});
  const [fxDefaultMargin, setFxDefaultMargin] = useState("");
  const [fxErrors, setFxErrors] = useState<Record<string, string>>({});
  const [fxFormError, setFxFormError] = useState("");

  useEffect(() => {
    if (rates) {
      setBt(rates.mileage_rate_before_tax?.toString() ?? "");
      setFuelConsumption(rates.fuel_consumption_l_per_100km?.toString() ?? "");
      setFuelPrice(rates.fuel_price_ron_per_liter?.toString() ?? "");
      setPensionRate(rates.pension_rate != null ? (rates.pension_rate * 100).toString() : "");
      setHealthRate(rates.health_rate != null ? (rates.health_rate * 100).toString() : "");
      setIncomeTaxRate(rates.income_tax_rate != null ? (rates.income_tax_rate * 100).toString() : "");
      setTaxDeduction(rates.tax_deduction_eur?.toString() ?? "");
    }
  }, [rates]);

  useEffect(() => {
    if (allowanceData) {
      setDailyRate(allowanceData.daily_allowance_rate.toString());
    }
  }, [allowanceData]);

  useEffect(() => {
    if (fxMarginsData) {
      setFxMargins(Object.fromEntries(Object.entries(fxMarginsData.margins).map(([key, value]) => [key, String(value)])));
      setFxDefaultMargin(String(fxMarginsData.defaultMargin));
    }
  }, [fxMarginsData]);

  const updateRates = useMutation({
    mutationFn: (data: Record<string, number>) =>
      api.patch("/settings/mileage-rates", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
  });

  const updateAllowance = useMutation({
    mutationFn: (data: { daily_allowance_rate: number }) =>
      api.patch("/settings/daily-allowance-rate", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.dailyAllowanceRate() }),
  });

  const updateFxMargins = useMutation<FxMargins, AxiosError<ApiValidationError>, { margins: Record<string, number>; default_margin: number }>({
    mutationFn: (data) => api.patch("/settings/fx-margins", data).then((response) => response.data),
    onSuccess: (data) => {
      setFxMargins(Object.fromEntries(Object.entries(data.margins).map(([key, value]) => [key, String(value)])));
      setFxDefaultMargin(String(data.defaultMargin));
      setFxErrors({});
      setFxFormError("");
      qc.invalidateQueries({ queryKey: settingsKeys.fxMargins() });
    },
    onError: (error) => {
      setFxErrors(error.response?.data?.errors ?? {});
      setFxFormError(error.response?.data?.detail ?? t("fx_margins_save_failed"));
    },
  });

  const handleSaveRates = () => {
    const btVal = parseFloat(bt);
    const consumption = parseFloat(fuelConsumption);
    const price = parseFloat(fuelPrice);
    const pension = parseFloat(pensionRate) / 100;
    const health = parseFloat(healthRate) / 100;
    const incomeTax = parseFloat(incomeTaxRate) / 100;
    const deduction = parseFloat(taxDeduction);
    if ([btVal, consumption, price, pension, health, incomeTax, deduction].some(Number.isNaN) || btVal <= 0 || consumption <= 0 || price < 0 || pension < 0 || health < 0 || incomeTax < 0 || deduction < 0) return;
    updateRates.mutate({ mileage_rate_before_tax: btVal, fuel_consumption_l_per_100km: consumption, fuel_price_ron_per_liter: price, pension_rate: pension, health_rate: health, income_tax_rate: incomeTax, tax_deduction_eur: deduction });
  };

  const handleSaveAllowance = () => {
    const val = parseFloat(dailyRate);
    if (isNaN(val) || val < 0) return;
    updateAllowance.mutate({ daily_allowance_rate: val });
  };

  const handleSaveFxMargins = () => {
    const errors: Record<string, string> = {};
    const values: Record<string, number> = {};
    const normalizedKeys = new Set<string>();
    for (const [currency, rawValue] of Object.entries(fxMargins)) {
      const key = currency.trim().toUpperCase();
      const value = Number(rawValue);
      if (normalizedKeys.has(key)) errors[`margins.${currency}`] = t("fx_margin_duplicate");
      normalizedKeys.add(key);
      if (!Number.isFinite(value) || value < 0 || value > 100) errors[`margins.${currency}`] = t("fx_margin_range");
      if (key === "RON" && value !== 0) errors[`margins.${currency}`] = t("fx_margin_ron");
      if (Number.isFinite(value) && value >= 0 && value <= 100 && key !== "RON") values[key] = value;
      if (key === "RON" && value === 0) values[key] = value;
    }
    const defaultValue = Number(fxDefaultMargin);
    if (!Number.isFinite(defaultValue) || defaultValue < 0 || defaultValue > 100) {
      errors.defaultMargin = t("fx_margin_range");
    }
    setFxErrors(errors);
    setFxFormError(Object.keys(errors).length > 0 ? t("fx_margins_validation_failed") : "");
    if (Object.keys(errors).length > 0) return;
    updateFxMargins.mutate({ margins: values, default_margin: defaultValue });
  };

  if (user?.role !== "chef_finance") {
    return <AppShell><p className="text-red-500 text-sm">{t("access_denied")}</p></AppShell>;
  }

  if (ratesLoading || allowanceLoading || fxMarginsLoading) return <AppShell><p className="text-slate-400 text-sm mt-8">{tc("loading")}</p></AppShell>;

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

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
              <p className="text-sm font-medium text-foreground">Fuel and tax calculation</p>
              {[
                ["Fuel consumption (L/100 km)", fuelConsumption, setFuelConsumption, "0.1"],
                ["Diesel price (RON/liter)", fuelPrice, setFuelPrice, "0.01"],
                ["Pension contribution (%)", pensionRate, setPensionRate, "0.1"],
                ["Health contribution (%)", healthRate, setHealthRate, "0.1"],
                ["Income tax (%)", incomeTaxRate, setIncomeTaxRate, "0.1"],
                ["Tax deduction (€)", taxDeduction, setTaxDeduction, "0.01"],
              ].map(([label, value, setter, step]) => (
                <div key={label as string}>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label as string}</label>
                  <input type="number" step={step as string} min="0" value={value as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                </div>
              ))}
              <p className="text-xs text-slate-400">The EUR/RON exchange rate is fetched automatically for each trip date.</p>
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

        <div className="bg-card rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("fx_margins")}</h2>
          <p className="text-sm text-muted mb-6">{t("fx_margins_description")}</p>
          <div className="space-y-4">
            {Object.entries(fxMargins).map(([currency, value]) => {
              const errorKey = `margins.${currency}`;
              const inputId = `fx-margin-${currency}`;
              const errorId = `${inputId}-error`;
              return (
                <div key={currency}>
                  <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t("fx_margin_label", { currency })}
                  </label>
                  <input
                    id={inputId}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={value}
                    onChange={(event) => {
                      setFxMargins((current) => ({ ...current, [currency]: event.target.value }));
                      setFxErrors((current) => { const next = { ...current }; delete next[errorKey]; return next; });
                    }}
                    aria-invalid={Boolean(fxErrors[errorKey])}
                    aria-describedby={fxErrors[errorKey] ? errorId : undefined}
                    className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
                  />
                  {fxErrors[errorKey] && <p id={errorId} className="text-sm text-red-600 mt-1">{fxErrors[errorKey]}</p>}
                </div>
              );
            })}
            <div>
              <label htmlFor="fx-default-margin" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("fx_default_margin")}
              </label>
              <input
                id="fx-default-margin"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={fxDefaultMargin}
                onChange={(event) => {
                  setFxDefaultMargin(event.target.value);
                  setFxErrors((current) => { const next = { ...current }; delete next.defaultMargin; return next; });
                }}
                aria-invalid={Boolean(fxErrors.defaultMargin)}
                aria-describedby={fxErrors.defaultMargin ? "fx-default-margin-error" : undefined}
                className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
              />
              {fxErrors.defaultMargin && <p id="fx-default-margin-error" className="text-sm text-red-600 mt-1">{fxErrors.defaultMargin}</p>}
            </div>
            {fxFormError && <p role="alert" className="text-sm text-red-600">{fxFormError}</p>}
            <button
              onClick={handleSaveFxMargins}
              disabled={updateFxMargins.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {updateFxMargins.isPending ? t("saving") : t("save")}
            </button>
            {updateFxMargins.isSuccess && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{t("fx_margins_saved")}</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
