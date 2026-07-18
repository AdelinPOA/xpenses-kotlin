"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SheetModal from "@/components/ui/SheetModal";
import ExpenseForm from "./ExpenseForm";
import { Expense } from "@/lib/api";

interface Props {
  expense?: Expense;
  reportId?: number;
  defaultCurrency?: string;
}

export default function MobileExpenseFormSheet({ expense, reportId, defaultCurrency }: Props) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleClose = () => {
    setOpen(false);
    router.back();
  };

  if (isMobile) {
    return (
      <SheetModal open={open} onClose={handleClose} title={expense ? "Edit Expense" : "New Expense"}>
        <ExpenseForm expense={expense} reportId={reportId} defaultCurrency={defaultCurrency} />
      </SheetModal>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {expense ? "Edit Expense" : "New Expense"}
        </h1>
      </div>
      <ExpenseForm expense={expense} reportId={reportId} defaultCurrency={defaultCurrency} />
    </div>
  );
}
