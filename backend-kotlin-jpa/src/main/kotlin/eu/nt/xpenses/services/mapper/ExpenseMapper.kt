package eu.nt.xpenses.services.mapper

import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ReceiptOut
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.Receipt
import org.springframework.stereotype.Component

@Component
class ExpenseMapper {

    fun toReceiptOut(receipt: Receipt): ReceiptOut {
        return ReceiptOut(
            id = requireNotNull(receipt.id) { "Receipt id must not be null" },
            expenseId = requireNotNull(receipt.expense.id) { "Receipt.expense id must not be null" },
            filePath = receipt.filePath,
            originalName = receipt.originalName,
            createdAt = receipt.createdAt
        )
    }

    fun toExpenseOut(expense: Expense): ExpenseOut {
        val receipts = expense.receipts.map { toReceiptOut(it) }
        val receiptPath = if (receipts.isNotEmpty()) receipts[0].filePath else expense.receiptPath
        return ExpenseOut(
            id = requireNotNull(expense.id) { "Expense id must not be null" },
            userId = expense.user?.id,
            userDisplayName = expense.user?.displayName,
            categoryId = expense.category?.id,
            categoryName = expense.category?.name,
            reportId = expense.report?.id,
            comparisonId = null,
            amountOriginal = expense.amountOriginal,
            currencyOriginal = expense.currencyOriginal,
            amountEur = expense.amountEur,
            fxRate = expense.fxRate,
            fxRateManual = expense.fxRateManual,
            taxAmount = expense.taxAmount,
            taxRate = expense.taxRate,
            taxAmountEur = expense.taxAmountEur,
            date = expense.date,
            description = expense.description,
            merchant = expense.merchant,
            receiptPath = receiptPath,
            receipts = receipts,
            status = expense.status,
            rawOcrText = expense.rawOcrText,
            createdAt = expense.createdAt,
            updatedAt = expense.updatedAt
        )
    }
}
