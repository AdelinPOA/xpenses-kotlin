"use client";

import clsx from "clsx";

interface Option<T> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export default function SegmentedControl<T extends string | number | boolean>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={clsx(
        "inline-flex bg-slate-100 dark:bg-slate-800/60 p-0.5 rounded-full border border-slate-200/50 dark:border-slate-700/50 shadow-inner w-full sm:w-auto sm:min-w-[240px]",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              "flex-1 text-center py-1.5 px-3 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer select-none",
              active
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
