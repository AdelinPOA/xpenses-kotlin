"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useOfflineSync } from "@/components/OfflineSyncProvider";

export default function OfflineQueuePanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const t = useTranslations("offline");
  const { items, retryItem, discardItem } = useOfflineSync();

  const errorMessage = (item: (typeof items)[number]): string | undefined => {
    if (!item.error && !item.errorKind) return undefined;
    switch (item.errorKind) {
      case "auth":
        return t("error_auth");
      case "stale":
        return t("error_stale");
      case "retryable":
        return t("error_retryable");
      case "permanent":
        return t("error_permanent");
      default:
        return t("error_sync");
    }
  };

  return (
    <section
      aria-label={t("queue_title")}
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/60 dark:bg-amber-950/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {t("queue_title")}
          </h2>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            {t("queue_subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
        >
          {t("close_queue")}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-amber-300 px-3 py-4 text-xs text-amber-800 dark:border-amber-700 dark:text-amber-200">
            {t("queue_empty")}
          </p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-amber-200 bg-card p-3 dark:border-amber-800/60"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {item.expenseId
                      ? t("expense_number", { id: item.expenseId })
                      : t("new_expense_pending")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {errorMessage(item) ??
                      (item.stage === "receipts_pending"
                        ? t("receipts_pending")
                        : t("expense_pending"))}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.expenseId && (
                    <Link
                      href={`/expenses/${item.expenseId}/edit`}
                      className="min-h-11 inline-flex items-center rounded-lg px-3 text-xs font-semibold text-primary hover:bg-primary/10"
                    >
                      {t("open_expense")}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void retryItem(item.id)}
                    className="min-h-11 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover"
                  >
                    {t("retry")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void discardItem(item.id)}
                    className="min-h-11 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  >
                    {t("discard")}
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
