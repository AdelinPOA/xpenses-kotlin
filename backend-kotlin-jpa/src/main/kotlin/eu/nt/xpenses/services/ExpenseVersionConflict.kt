package eu.nt.xpenses.services

import eu.nt.xpenses.dto.expense.ExpenseOut

class ExpenseVersionConflict(val current: ExpenseOut) : RuntimeException("Expense version is stale")
