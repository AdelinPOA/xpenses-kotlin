"use client";

import { useTranslations } from "next-intl";

type QueryErrorNoticeProps = {
  isFetching: boolean;
  onRetry: () => void;
};

export default function QueryErrorNotice({ isFetching, onRetry }: QueryErrorNoticeProps) {
  const t = useTranslations("common");

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
    >
      <span>{t("load_failed")}</span>
      <button
        type="button"
        onClick={onRetry}
        disabled={isFetching}
        aria-busy={isFetching}
        className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2 hover:opacity-80 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t("try_again")}
      </button>
    </div>
  );
}
