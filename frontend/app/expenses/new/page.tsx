import dynamic from "next/dynamic";
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
  const reportId = typeof sp.reportId === 'string' ? parseInt(sp.reportId) : undefined;
  const currency = typeof sp.currency === 'string' ? sp.currency : undefined;
  const t = await getTranslations("expenses");

  return (
    <AppShell>
      <div className="mb-2">
        <h1 className="text-xl font-bold text-foreground">{t("new_expense")}</h1>
      </div>
      <ExpenseForm reportId={reportId} defaultCurrency={currency} />
    </AppShell>
  );
}
