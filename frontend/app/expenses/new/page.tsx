import dynamic from "next/dynamic";
import AppShell from "@/components/layout/AppShell";

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

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">New Expense</h1>
      </div>
      <ExpenseForm reportId={reportId} defaultCurrency={currency} />
    </AppShell>
  );
}
