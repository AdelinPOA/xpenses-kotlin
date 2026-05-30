import AppShell from "@/components/layout/AppShell";
import ExpenseForm from "@/components/expenses/ExpenseForm";

export default function NewExpensePage() {
  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Expense</h1>
      </div>
      <ExpenseForm />
    </AppShell>
  );
}
