import dynamic from "next/dynamic";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { getTranslations } from "next-intl/server";

const ExpenseForm = dynamic(() => import("@/components/expenses/ExpenseForm"), {
  loading: () => <div className="animate-pulse bg-card h-96 rounded-xl" />,
});

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const rawReportId = typeof sp.reportId === "string" ? Number(sp.reportId) : NaN;
  const reportId = Number.isSafeInteger(rawReportId) && rawReportId > 0
    ? rawReportId
    : undefined;
  const isManual = sp.mode === "manual";
  const currency = typeof sp.currency === "string" ? sp.currency : undefined;
  const t = await getTranslations("expenses");
  const captureHref = reportId ? `/expenses/capture?reportId=${reportId}` : "/expenses/capture";
  const manualHref = reportId
    ? `/expenses/new?mode=manual&reportId=${reportId}`
    : "/expenses/new?mode=manual";

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground">{t("new_expense")}</h1>
      </div>
      {isManual ? (
        <ExpenseForm reportId={reportId} defaultCurrency={currency} />
      ) : (
        <section className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          <Link href={captureHref} className="group flex min-h-48 flex-col justify-between rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm transition-colors hover:border-primary/60 hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">{t("receipt_capture")}</span>
              <h2 className="mt-2 text-lg font-semibold text-foreground">{t("receipt_capture_choice")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("receipt_capture_hint")}</p>
            </div>
            <span className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary">{t("continue_capture")} <span aria-hidden="true" className="ml-2 transition-transform group-hover:translate-x-1">→</span></span>
          </Link>
          <Link href={manualHref} className="group flex min-h-48 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("manual_entry_heading")}</span>
              <h2 className="mt-2 text-lg font-semibold text-foreground">{t("manual_entry_heading")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("manual_entry_hint")}</p>
            </div>
            <span className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary">{t("continue_manual")} <span aria-hidden="true" className="ml-2 transition-transform group-hover:translate-x-1">→</span></span>
          </Link>
        </section>
      )}
    </AppShell>
  );
}
