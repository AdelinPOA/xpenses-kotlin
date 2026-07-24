"use client";

import clsx from "clsx";

interface Props {
  fxRateEditMode: boolean;
  fxRate: string;
  currency: string;
  isEdit: boolean;
  expenseFxRate?: number;
  expenseFxRateManual?: boolean;
  onToggleMode: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function FxRateInput({
  fxRateEditMode, fxRate, currency, isEdit, expenseFxRate, expenseFxRateManual,
  onToggleMode, onChange,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          FX Rate{" "}
          <span className={clsx(
            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
            fxRateEditMode
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
              : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
          )}>
            {fxRateEditMode ? "Manual" : "Auto"}
          </span>
        </label>
        <div className="flex items-center gap-1">
          {fxRateEditMode ? (
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              inputMode="decimal"
              value={fxRate}
              onChange={onChange}
              className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100"
            />
          ) : (
            <span className="text-sm text-slate-600 dark:text-slate-400 py-2">
              {isEdit && expenseFxRate ? `1 ${currency} = ${expenseFxRate.toFixed(4)} EUR` : "Will be fetched on save"}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleMode}
            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
            title={fxRateEditMode ? "Revert to auto" : "Edit rate manually"}
          >
            {fxRateEditMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
