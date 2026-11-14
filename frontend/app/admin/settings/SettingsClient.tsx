"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiValidationError, FxMargins, MileageRates, FxProvidersConfig, FxTestResult, getFxProviders, updateFxProviders, testFxProvider } from "@/lib/api";
import { settingsKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Settings, Save, ArrowUp, ArrowDown, Globe, CheckCircle2, AlertCircle, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AxiosError } from "axios";
import type { MobileUiConfig } from "@/lib/types/admin";

function MobileUiSettingsCard() {
  const qc = useQueryClient();
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { data: mobileUiConfig, isLoading } = useQuery<MobileUiConfig>({
    queryKey: settingsKeys.mobileUi(),
    queryFn: () => api.get("/settings/ui").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
  });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (mobileUiConfig) setEnabled(mobileUiConfig.mobile_quick_add_fab_enabled);
  }, [mobileUiConfig]);

  const updateMobileUi = useMutation<MobileUiConfig, unknown, boolean, { previous: MobileUiConfig | undefined; previousEnabled: boolean }>({
    mutationFn: (nextEnabled) => api.patch("/settings/ui", { mobile_quick_add_fab_enabled: nextEnabled }).then((response) => response.data as MobileUiConfig),
    onMutate: async (nextEnabled) => {
      await qc.cancelQueries({ queryKey: settingsKeys.mobileUi() });
      const previous = qc.getQueryData<MobileUiConfig>(settingsKeys.mobileUi());
      return {
        previous,
        previousEnabled: previous?.mobile_quick_add_fab_enabled ?? !nextEnabled,
      };
    },
    onSuccess: (data) => {
      setEnabled(data.mobile_quick_add_fab_enabled);
      qc.setQueryData(settingsKeys.mobileUi(), data);
    },
    onError: (_error, _nextEnabled, context) => {
      setEnabled(context?.previousEnabled ?? false);
      if (context?.previous) qc.setQueryData(settingsKeys.mobileUi(), context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: settingsKeys.mobileUi() }),
  });

  if (isLoading) return <p className="text-slate-400 text-sm mt-8">{tc("loading")}</p>;

  return (
    <div className="bg-card rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-foreground mb-2">{t("mobile_ui")}</h2>
      <p className="text-sm text-muted mb-6">{t("mobile_ui_description")}</p>
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm font-medium text-foreground">{t("mobile_quick_add_fab")}</span>
        <input
          type="checkbox"
          role="switch"
          aria-label={t("mobile_quick_add_fab")}
          checked={enabled}
          onChange={(event) => {
            const nextEnabled = event.target.checked;
            setEnabled(nextEnabled);
            updateMobileUi.mutate(nextEnabled);
          }}
          disabled={updateMobileUi.isPending}
          className="h-5 w-5 accent-primary"
        />
      </label>
      {updateMobileUi.isSuccess && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{t("config_saved")}</p>}
      {updateMobileUi.isError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{t("failed_save")}</p>}
    </div>
  );
}

export default function SettingsClient() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isChefFinance = user?.role === "chef_finance";
  const isMod = user?.role === "mod";
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  const { data: rates, isLoading: ratesLoading } = useQuery<MileageRates>({
    queryKey: settingsKeys.mileageRates(),
    queryFn: () => api.get("/settings/mileage-rates").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
    enabled: isChefFinance,
  });

  const { data: allowanceData, isLoading: allowanceLoading } = useQuery<{ daily_allowance_rate: number }>({
    queryKey: settingsKeys.dailyAllowanceRate(),
    queryFn: () => api.get("/settings/daily-allowance-rate").then((r) => r.data),
    staleTime: 300_000,
    gcTime: 600_000,
    enabled: isChefFinance,
  });

  const { data: fxMarginsData, isLoading: fxMarginsLoading } = useQuery<FxMargins>({
    queryKey: settingsKeys.fxMargins(),
    queryFn: () => api.get("/settings/fx-margins").then((r) => ({ ...r.data, defaultMargin: r.data.default_margin })),
    staleTime: 300_000,
    gcTime: 600_000,
    enabled: isChefFinance,
  });

  const { data: fxProvidersData, isLoading: fxProvidersLoading } = useQuery<FxProvidersConfig>({
    queryKey: settingsKeys.fxProviders(),
    queryFn: () => getFxProviders(),
    staleTime: 300_000,
    gcTime: 600_000,
    enabled: isChefFinance,
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

  const [providers, setProviders] = useState<string[]>(["BNR", "ECB_FRANKFURTER", "CURRENCY_API"]);
  const [testCurrency, setTestCurrency] = useState("UAH");
  const [testDate, setTestDate] = useState("");
  const [testResult, setTestResult] = useState<FxTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [providersSaveSuccess, setProvidersSaveSuccess] = useState(false);
  const [providersSaveError, setProvidersSaveError] = useState("");
  const [ratesError, setRatesError] = useState("");
  const [allowanceError, setAllowanceError] = useState("");

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

  useEffect(() => {
    if (fxProvidersData?.providers) {
      setProviders(fxProvidersData.providers);
    }
  }, [fxProvidersData]);

  const updateRates = useMutation({
    mutationFn: (data: Record<string, number>) =>
      api.patch("/settings/mileage-rates", data),
    onSuccess: () => {
      setRatesError("");
      qc.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setRatesError(detail || t("failed_save"));
    },
  });

  const updateAllowance = useMutation({
    mutationFn: (data: { daily_allowance_rate: number }) =>
      api.patch("/settings/daily-allowance-rate", data),
    onSuccess: () => {
      setAllowanceError("");
      qc.invalidateQueries({ queryKey: settingsKeys.dailyAllowanceRate() });
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAllowanceError(detail || t("failed_save"));
    },
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

  const updateFxProvidersMutation = useMutation({
    mutationFn: (newProviders: string[]) => updateFxProviders(newProviders),
    onSuccess: (data) => {
      setProviders(data.providers);
      setProvidersSaveSuccess(true);
      setProvidersSaveError("");
      setTimeout(() => setProvidersSaveSuccess(false), 4000);
      qc.invalidateQueries({ queryKey: settingsKeys.fxProviders() });
    },
    onError: (error: any) => {
      setProvidersSaveSuccess(false);
      setProvidersSaveError(error.response?.data?.detail ?? t("fx_providers_save_failed"));
    },
  });

  const moveProvider = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= providers.length) return;
    const next = [...providers];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setProviders(next);
  };

  const handleSaveProviders = () => {
    setProvidersSaveSuccess(false);
    setProvidersSaveError("");
    updateFxProvidersMutation.mutate(providers);
  };

  const handleTestResolution = async () => {
    if (!testCurrency.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testFxProvider(testCurrency.trim(), testDate.trim() || undefined);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.response?.data?.detail ?? e.message ?? "Test failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const getProviderInfo = (providerKey: string) => {
    switch (providerKey) {
      case "BNR":
        return {
          title: t("fx_provider_bnr"),
          desc: t("fx_provider_bnr_desc"),
          badge: "RO",
          badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        };
      case "ECB_FRANKFURTER":
        return {
          title: t("fx_provider_ecb"),
          desc: t("fx_provider_ecb_desc"),
          badge: "EU",
          badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        };
      case "CURRENCY_API":
        return {
          title: t("fx_provider_currency_api"),
          desc: t("fx_provider_currency_api_desc"),
          badge: "Global",
          badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        };
      default:
        return {
          title: providerKey,
          desc: "",
          badge: "API",
          badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        };
    }
  };

  const handleSaveRates = () => {
    const btVal = parseFloat(bt);
    const consumption = parseFloat(fuelConsumption);
    const price = parseFloat(fuelPrice);
    const pension = parseFloat(pensionRate) / 100;
    const health = parseFloat(healthRate) / 100;
    const incomeTax = parseFloat(incomeTaxRate) / 100;
    const deduction = parseFloat(taxDeduction);
    if ([btVal, consumption, price, pension, health, incomeTax, deduction].some(Number.isNaN) || btVal <= 0 || consumption <= 0 || price < 0 || pension < 0 || health < 0 || incomeTax < 0 || deduction < 0) {
      setRatesError(t("invalid_rates_input"));
      return;
    }
    setRatesError("");
    updateRates.mutate({ mileage_rate_before_tax: btVal, fuel_consumption_l_per_100km: consumption, fuel_price_ron_per_liter: price, pension_rate: pension, health_rate: health, income_tax_rate: incomeTax, tax_deduction_eur: deduction });
  };

  const handleSaveAllowance = () => {
    const val = parseFloat(dailyRate);
    if (isNaN(val) || val < 0) {
      setAllowanceError(t("invalid_allowance_input"));
      return;
    }
    setAllowanceError("");
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

  if (!isChefFinance && !isMod) {
    return <AppShell><p className="text-red-500 text-sm">{t("access_denied")}</p></AppShell>;
  }

  if (isMod) {
    return (
      <AppShell>
        <div className="space-y-6 max-w-lg">
          <MobileUiSettingsCard />
        </div>
      </AppShell>
    );
  }

  if (ratesLoading || allowanceLoading || fxMarginsLoading || fxProvidersLoading) return <AppShell><p className="text-slate-400 text-sm mt-8">{tc("loading")}</p></AppShell>;

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

            {ratesError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">{ratesError}</p>
            )}
            {updateRates.isSuccess && !ratesError && (
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

            {allowanceError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">{allowanceError}</p>
            )}
            {updateAllowance.isSuccess && !allowanceError && (
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

        {/* FX Provider Priority Card */}
        <div className="bg-card rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-500" />
              {t("fx_providers")}
            </h2>
          </div>
          <p className="text-sm text-muted mb-6">{t("fx_providers_description")}</p>

          <div className="space-y-3 mb-6">
            {providers.map((providerKey, index) => {
              const info = getProviderInfo(providerKey);
              const isFirst = index === 0;
              const isLast = index === providers.length - 1;

              return (
                <div
                  key={providerKey}
                  className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">
                          {info.title}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.badgeColor}`}>
                          {info.badge}
                        </span>
                      </div>
                      <p className="text-xs text-muted truncate mt-0.5">
                        {info.desc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <button
                      type="button"
                      disabled={isFirst}
                      onClick={() => moveProvider(index, "up")}
                      aria-label={`${t("fx_priority_move_up")} ${info.title}`}
                      className="p-1.5 rounded-lg border border-input-border text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() => moveProvider(index, "down")}
                      aria-label={`${t("fx_priority_move_down")} ${info.title}`}
                      className="p-1.5 rounded-lg border border-input-border text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveProviders}
              disabled={updateFxProvidersMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {updateFxProvidersMutation.isPending ? t("saving") : t("save")}
            </button>
            {providersSaveSuccess && (
              <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
                {t("fx_providers_saved")}
              </p>
            )}
            {providersSaveError && (
              <p role="alert" className="text-sm text-red-600">
                {providersSaveError}
              </p>
            )}
          </div>

          {/* FX Resolution Live Test Section */}
          <div className="border-t border-slate-200 dark:border-slate-700 mt-6 pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {t("fx_test_resolution")}
            </h3>
            <p className="text-xs text-muted mb-4">
              {t("fx_test_description")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("fx_test_currency")}
                </label>
                <input
                  type="text"
                  maxLength={5}
                  value={testCurrency}
                  onChange={(e) => setTestCurrency(e.target.value.toUpperCase())}
                  placeholder="UAH"
                  className="w-full px-3 py-2 border border-input-border rounded-lg text-sm bg-input text-foreground uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("fx_test_date")}
                </label>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded-lg text-sm bg-input text-foreground"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleTestResolution}
                  disabled={isTesting || !testCurrency.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  {isTesting ? t("fx_testing") : t("fx_test_button")}
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3.5 rounded-xl border text-sm mt-3 ${
                  testResult.success
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                    : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 text-xs">
                    <p className="font-semibold text-sm mb-1">{testResult.message}</p>
                    {testResult.success && testResult.rate != null && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 font-mono">
                        <div>
                          <span className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400 block font-sans">
                            Rate
                          </span>
                          <span className="font-bold">1 {testCurrency} = {testResult.rate} EUR</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400 block font-sans">
                            Provider
                          </span>
                          <span className="font-bold">{testResult.source}</span>
                        </div>
                        {testResult.source_date && (
                          <div>
                            <span className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400 block font-sans">
                              Source Date
                            </span>
                            <span className="font-bold">{testResult.source_date}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
