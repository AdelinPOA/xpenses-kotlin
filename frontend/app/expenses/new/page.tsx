import AppShell from "@/components/layout/AppShell";
import MobileExpenseFormSheet from "@/components/expenses/MobileExpenseFormSheet";

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
      <MobileExpenseFormSheet reportId={reportId} defaultCurrency={currency} />
    </AppShell>
  );
}
