"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api, { CURRENCIES } from "@/lib/api";
import clsx from "clsx";
import { useTranslations } from "next-intl";

type ManualMode = "debit" | "rate";

interface Props {
  /** Whether the manual editor is open (pencil toggled on). */
  active: boolean;
  /** Original (receipt) currency — never EUR when this component is rendered. */
  currency: string;
  /** Original amount as entered in the form. */
  amount: string;
  /** Expense date (YYYY-MM-DD) used to resolve rates. */
  date: string;
  /** Stored rate of the expense being edited, if any (auto or manual). Seeds the raw-rate field. */
  initialRate?: number | null;
  /** True only when the stored rate was a manual override; seeds the debit-amount prefill. */
  initialManualRate?: number | null;
  /** Recovered locally edited FX rate, if any. */
  initialEditorRate?: number | null;
  onToggle: () => void;
  /** Reports the effective manual FX rate (raw or derived), or null when none is set. */
  onManualRateChange: (rate: number | null) => void;
}

export default function FxRateInput({
  active,
  currency,
  amount,
  date,
  initialRate,
  initialManualRate,
  initialEditorRate,
  onToggle,
  onManualRateChange,
}: Props) {
  const t = useTranslations("expenses");
  const [mode, setMode] = useState<ManualMode>("debit");
  const [rateValue, setRateValue] = useState("");
  const [debitCurrency, setDebitCurrency] = useState("EUR");
  const [debitAmount, setDebitAmount] = useState("");
  const [debitTouched, setDebitTouched] = useState(false);
  const wasActive = useRef(false);

  // Seed the raw-rate field only when the editor opens, so parent updates from
  // the effective rate callback do not overwrite a value while the user types.
  useEffect(() => {
    if (active && !wasActive.current) {
      const rate = initialEditorRate ?? initialRate;
      setRateValue(rate != null ? rate.toString() : "");
    }
    wasActive.current = active;
  }, [active, initialEditorRate, initialRate]);

  // Effective rate for the debit currency on the expense date (BNR × margin).
  const { data: quote, isError: quoteError } = useQuery<number>({
    queryKey: ["fx-quote", debitCurrency, date],
    queryFn: () => api.get("/fx/quote", { params: { from: debitCurrency, date } }).then((r) => r.data.rate),
    enabled: active && mode === "debit" && debitCurrency !== "EUR",
    staleTime: 300_000,
  });

  // Automatic rate for the original currency — baseline for the preview and deviation warning.
  const { data: autoQuote } = useQuery<number>({
    queryKey: ["fx-quote", currency, date],
    queryFn: () => api.get("/fx/quote", { params: { from: currency, date } }).then((r) => r.data.rate),
    enabled: active,
    staleTime: 300_000,
  });

  const amountNum = parseFloat(amount);

  // Inverse-derived estimate of the debited amount, shown until the user types over it.
  const prefillValue = useMemo(() => {
    if (!initialManualRate || !amountNum || amountNum <= 0) return "";
    const impliedEur = initialManualRate * amountNum;
    if (debitCurrency === "EUR") return impliedEur.toFixed(2);
    return quote ? (impliedEur / quote).toFixed(2) : "";
  }, [initialManualRate, amountNum, debitCurrency, quote]);

  const effectiveDebit = debitTouched || !prefillValue ? parseFloat(debitAmount) : parseFloat(prefillValue);
  const rateNum = parseFloat(rateValue);

  const derived = useMemo<{ rate: number; eur: number } | null>(() => {
    if (mode === "rate") {
      if (rateNum > 0 && amountNum > 0) return { rate: rateNum, eur: amountNum * rateNum };
      return null;
    }
    if (!(effectiveDebit > 0) || !(amountNum > 0)) return null;
    if (debitCurrency === "EUR") {
      return { rate: effectiveDebit / amountNum, eur: effectiveDebit };
    }
    if (quote) {
      const eur = effectiveDebit * quote;
      return { rate: eur / amountNum, eur };
    }
    return null;
  }, [mode, rateNum, amountNum, effectiveDebit, debitCurrency, quote]);

  useEffect(() => {
    onManualRateChange(derived ? derived.rate : null);
  }, [derived, onManualRateChange]);

  const autoEur = autoQuote && amountNum > 0 ? amountNum * autoQuote : null;
  const deviationWarning =
    derived?.eur != null &&
    autoEur != null &&
    Math.abs(derived.eur - autoEur) / autoEur > 0.25;

  const debitCurrencies = CURRENCIES.filter((c) => c !== currency);

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <div className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          {t("fx_rate")}{" "}
          <span className={clsx(
            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
            active
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
              : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
          )}>
            {active ? t("fx_manual") : t("fx_auto")}
          </span>
        </div>

        {!active ? (
          <span className="text-sm text-slate-600 dark:text-slate-400 py-2">
            {t("fx_will_fetch")}
          </span>
        ) : (
          <div>
            {/* Mode switch */}
            <div className="inline-flex rounded-lg border border-input-border overflow-hidden mb-2" role="tablist">
              {(["debit", "rate"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={clsx(
                    "min-h-11 px-3 py-1 text-sm font-medium transition-colors",
                    mode === m
                      ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                      : "text-muted hover:bg-card-hover"
                  )}
                >
                  {m === "debit" ? t("fx_mode_debit") : t("fx_mode_rate")}
                </button>
              ))}
            </div>

            {mode === "debit" ? (
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    inputMode="decimal"
                    value={debitTouched ? debitAmount : prefillValue}
                    onChange={(e) => {
                      setDebitTouched(true);
                      setDebitAmount(e.target.value);
                    }}
                    placeholder={t("fx_debit_amount")}
                    aria-label={t("fx_debit_amount")}
                    className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
                  />
                  <select
                    value={debitCurrency}
                    onChange={(e) => setDebitCurrency(e.target.value)}
                    aria-label={t("fx_debit_currency")}
                    className="min-h-11 border border-input-border rounded-lg px-2 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
                  >
                    {debitCurrencies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted mt-1">{t("fx_debit_help")}</p>
              </div>
            ) : (
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                inputMode="decimal"
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                aria-label={t("fx_rate")}
                className="w-full min-h-11 border border-input-border rounded-lg px-3 py-2 text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
              />
            )}

            {/* Live preview */}
            {derived && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                {t("fx_preview", { currency, rate: derived.rate.toFixed(6), amount: derived.eur.toFixed(2) })}
              </p>
            )}
            {quoteError && mode === "debit" && debitCurrency !== "EUR" && (
              <p role="alert" className="text-xs text-red-600 mt-1">{t("fx_quote_error")}</p>
            )}
            {deviationWarning && (
              <p className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1 mt-1">
                {t("fx_deviation_warning", { amount: autoEur!.toFixed(2) })}
              </p>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title={active ? t("fx_revert") : t("fx_edit")}
      >
        {active ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        )}
      </button>
    </div>
  );
}
