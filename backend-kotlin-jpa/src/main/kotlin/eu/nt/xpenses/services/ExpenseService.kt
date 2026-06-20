package eu.nt.xpenses.services

import eu.nt.xpenses.models.*
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.controllers.ExpenseCreate
import eu.nt.xpenses.controllers.ExpenseUpdate
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import org.slf4j.LoggerFactory

@Service
class ExpenseService(
    private val expenseRepository: ExpenseRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val fxService: FxService,
    private val storageService: StorageService
) {
    private val log = LoggerFactory.getLogger(ExpenseService::class.java)

    @Transactional
    fun createExpense(body: ExpenseCreate, currentUser: User): Expense {
        val fxRate = try {
            fxService.getRate(body.currency, body.date)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
        }

        val amountEur = BigDecimal.valueOf(body.amount).multiply(BigDecimal.valueOf(fxRate)).setScale(2, RoundingMode.HALF_UP).toDouble()
        val taxAmountEur = BigDecimal.valueOf(body.taxAmount).multiply(BigDecimal.valueOf(fxRate)).setScale(2, RoundingMode.HALF_UP)

        val category = body.categoryId?.let {
            categoryRepository.findById(it).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found")
            }
        }

        val report = body.reportId?.let {
            val rep = expenseReportRepository.findById(it).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
            }
            if (rep.user?.id != currentUser.id) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot attach to another user's report")
            }
            if (rep.status != "draft") {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Can only attach expenses to draft reports")
            }
            rep
        }

        val expense = Expense(
            user = currentUser,
            category = category,
            report = report,
            amountOriginal = body.amount,
            currencyOriginal = body.currency.uppercase(),
            amountEur = amountEur,
            fxRate = fxRate,
            taxAmount = BigDecimal.valueOf(body.taxAmount),
            taxRate = body.taxRate?.let { BigDecimal.valueOf(it) },
            taxAmountEur = taxAmountEur,
            date = body.date,
            description = body.description,
            merchant = body.merchant,
            rawOcrText = body.rawOcrText,
            status = "draft",
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

        val savedExpense = expenseRepository.save(expense)

        if (body.comparisonId != null) {
            val comp = ocrComparisonRepository.findById(body.comparisonId).orElse(null)
            if (comp != null) {
                comp.expense = savedExpense
                ocrComparisonRepository.save(comp)
            }
        }

        return savedExpense
    }

    @Transactional
    fun updateExpense(expenseId: Int, body: ExpenseUpdate, currentUser: User): Expense {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can be edited")
        }

        val needFxRecalc = body.amount != null || body.currency != null || body.date != null || body.taxAmount != null || body.taxRate != null

        if (needFxRecalc) {
            val effAmount = body.amount ?: expense.amountOriginal
            val effCurrency = (body.currency ?: expense.currencyOriginal).uppercase()
            val effDate = body.date ?: expense.date
            val effTaxAmount = body.taxAmount ?: expense.taxAmount.toDouble()
            val effTaxRate = body.taxRate ?: expense.taxRate?.toDouble()

            val fxRate = try {
                fxService.getRate(effCurrency, effDate)
            } catch (e: Exception) {
                throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
            }

            expense.amountOriginal = effAmount
            expense.currencyOriginal = effCurrency
            expense.fxRate = fxRate
            expense.amountEur = BigDecimal.valueOf(effAmount).multiply(BigDecimal.valueOf(fxRate)).setScale(2, RoundingMode.HALF_UP).toDouble()
            expense.taxAmount = BigDecimal.valueOf(effTaxAmount)
            expense.taxRate = effTaxRate?.let { BigDecimal.valueOf(it) }
            expense.taxAmountEur = BigDecimal.valueOf(effTaxAmount).multiply(BigDecimal.valueOf(fxRate)).setScale(2, RoundingMode.HALF_UP)
        }

        if (body.date != null) expense.date = body.date
        if (body.description != null) expense.description = body.description
        if (body.merchant != null) expense.merchant = body.merchant
        if (body.rawOcrText != null) expense.rawOcrText = body.rawOcrText

        if (body.categoryId != null) {
            expense.category = categoryRepository.findById(body.categoryId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found")
            }
        }

        if (body.reportId != null) {
            val rep = expenseReportRepository.findById(body.reportId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
            }
            if (rep.user?.id != currentUser.id) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot attach to another user's report")
            }
            if (rep.status != "draft") {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Can only attach expenses to draft reports")
            }
            expense.report = rep
        }
        // A null reportId means "leave the report association unchanged". Detaching an
        // expense from a report is done deliberately via the report endpoints
        // (attach / recall / reject), never as a side effect of editing an expense —
        // otherwise editing an uncategorized, attached expense would silently remove it
        // from its report.

        expense.updatedAt = Instant.now()
        val saved = expenseRepository.save(expense)

        if (body.comparisonId != null) {
            val comp = ocrComparisonRepository.findById(body.comparisonId).orElse(null)
            if (comp != null) {
                comp.expense = saved
                ocrComparisonRepository.save(comp)
            }
        }

        return saved
    }

    @Transactional
    fun duplicateExpense(expenseId: Int, currentUser: User): Expense {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }

        val fxRate = try {
            fxService.getRate(expense.currencyOriginal, expense.date)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
        }

        val amountEur = BigDecimal.valueOf(expense.amountOriginal).multiply(BigDecimal.valueOf(fxRate)).setScale(2, RoundingMode.HALF_UP).toDouble()
        val taxAmountEur = expense.taxAmount.multiply(BigDecimal.valueOf(fxRate)).setScale(2, RoundingMode.HALF_UP)

        val newExpense = Expense(
            user = currentUser,
            category = expense.category,
            report = null,
            amountOriginal = expense.amountOriginal,
            currencyOriginal = expense.currencyOriginal,
            amountEur = amountEur,
            fxRate = fxRate,
            taxAmount = expense.taxAmount,
            taxRate = expense.taxRate,
            taxAmountEur = taxAmountEur,
            date = expense.date,
            description = expense.description,
            merchant = expense.merchant,
            status = "draft",
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

        return expenseRepository.save(newExpense)
    }

    @Transactional
    fun deleteExpense(expenseId: Int, currentUser: User) {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can be deleted")
        }

        val paths = expense.receipts.map { it.filePath }
        expenseRepository.delete(expense)

        for (path in paths) {
            try {
                storageService.deleteFile(path)
            } catch (e: Exception) {
                log.warn("Failed to delete receipt file '{}': {}", path, e.message)
            }
        }
    }
}
