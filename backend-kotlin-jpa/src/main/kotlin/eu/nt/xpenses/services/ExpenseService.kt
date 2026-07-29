package eu.nt.xpenses.services

import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.model.*
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import org.slf4j.LoggerFactory

import eu.nt.xpenses.repositories.ReceiptRepository

@Service
class ExpenseService(
    private val expenseRepository: ExpenseRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val receiptRepository: ReceiptRepository,
    private val fxService: FxService,
    private val storageService: StorageService
) {
    private val log = LoggerFactory.getLogger(ExpenseService::class.java)

    @Transactional
    fun createExpense(body: ExpenseCreate, currentUser: User): Expense {
        val fxRate = resolveFxRate(body.fxRate, body.currency, body.date)
        return doCreateExpense(body, currentUser, fxRate)
    }

    private fun resolveFxRate(manualRate: BigDecimal?, currency: String, date: String): BigDecimal {
        if (manualRate != null) return manualRate
        return try {
            fxService.getRate(currency, date)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
        }
    }

    @Transactional
    fun doCreateExpense(body: ExpenseCreate, currentUser: User, fxRate: BigDecimal): Expense {
        val fxRateManual = body.fxRate != null

        val amountEur = body.amount.multiply(fxRate).setScale(2, RoundingMode.HALF_UP)
        val taxAmountEur = body.taxAmount.multiply(fxRate).setScale(2, RoundingMode.HALF_UP)

        val category = body.categoryId?.let {
            val cat = categoryRepository.findById(it).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found")
            }
            if (!cat.isActive) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is deactivated")
            }
            cat
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
            fxRateManual = fxRateManual,
            taxAmount = body.taxAmount,
            taxRate = body.taxRate,
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

        val hasManualRate = body.fxRate != null
        val needFxRecalc = hasManualRate || body.amount != null || body.currency != null || body.date != null || body.taxAmount != null || body.taxRate != null

        if (needFxRecalc) {
            val effAmount = body.amount ?: expense.amountOriginal
            val effCurrency = (body.currency ?: expense.currencyOriginal).uppercase()
            val effDate = body.date ?: expense.date
            val effTaxAmount = body.taxAmount ?: expense.taxAmount
            val effTaxRate = body.taxRate ?: expense.taxRate

            val fxRate = if (hasManualRate) {
                body.fxRate
            } else {
                try {
                    fxService.getRate(effCurrency, effDate)
                } catch (e: Exception) {
                    throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
                }
            }

            expense.fxRateManual = hasManualRate
            expense.amountOriginal = effAmount
            expense.currencyOriginal = effCurrency
            expense.fxRate = fxRate
            expense.amountEur = effAmount.multiply(fxRate).setScale(2, RoundingMode.HALF_UP)
            expense.taxAmount = effTaxAmount
            expense.taxRate = effTaxRate
            expense.taxAmountEur = effTaxAmount.multiply(fxRate).setScale(2, RoundingMode.HALF_UP)
        }

        if (body.date != null) expense.date = body.date
        if (body.description != null) expense.description = body.description
        if (body.merchant != null) expense.merchant = body.merchant
        if (body.rawOcrText != null) expense.rawOcrText = body.rawOcrText

        if (body.categoryId != null) {
            val cat = categoryRepository.findById(body.categoryId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found")
            }
            if (!cat.isActive) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is deactivated")
            }
            expense.category = cat
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

        val newExpense = Expense(
            user = currentUser,
            category = expense.category,
            report = null,
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

        val receiptsList = expense.receipts.toList()
        for (receipt in receiptsList) {
            receiptRepository.delete(receipt)
        }
        val paths = receiptsList.map { it.filePath }
        expenseRepository.delete(expense)

        for (path in paths) {
            try {
                storageService.deleteFile(path)
            } catch (e: Exception) {
                log.warn("Failed to delete receipt file '{}': {}", path, e.message)
            }
        }
    }

    @Transactional
    fun uploadReceipts(expenseId: Int, files: List<MultipartFile>, currentUser: User): List<Map<String, Any>> {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can have receipts uploaded")
        }

        val allowedExtensions = setOf("jpg", "jpeg", "png", "gif", "pdf", "webp")
        val maxSizeInBytes = 10L * 1024 * 1024

        val nowTime = java.time.LocalDate.now()
        val year = nowTime.year
        val month = String.format("%02d", nowTime.monthValue)
        val contextPrefix = "$year/$month/${expenseId}_"

        val now = Instant.now()
        val savedReceiptsList = mutableListOf<Map<String, Any>>()
        for (file in files) {
            val originalName = file.originalFilename ?: "receipt"
            val rawUpload = eu.nt.xpenses.models.RawUpload(
                bytes = file.bytes,
                originalFilename = originalName,
                contentType = file.contentType
            )
            val relativePath = try {
                storageService.storeFile(contextPrefix, rawUpload, maxSizeInBytes, allowedExtensions)
            } catch (e: IllegalArgumentException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
            }
            val receipt = Receipt(
                expense = expense,
                filePath = relativePath,
                originalName = originalName,
                createdAt = now
            )
            val savedReceipt = receiptRepository.save(receipt)
            savedReceiptsList.add(mapOf(
                "id" to savedReceipt.id!!,
                "file_path" to relativePath,
                "original_name" to originalName
            ))
        }
        expense.updatedAt = now
        expenseRepository.save(expense)
        return savedReceiptsList
    }

    @Transactional
    fun deleteSingleReceipt(expenseId: Int, receiptId: Int, currentUser: User) {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }
        if (expense.user?.id != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can delete receipts")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can have receipts deleted")
        }

        val receipt = receiptRepository.findById(receiptId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found")
        }
        if (receipt.expense.id != expenseId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not associated with this expense")
        }

        val filePath = receipt.filePath
        receiptRepository.delete(receipt)
        expense.updatedAt = Instant.now()
        expenseRepository.save(expense)

        try {
            storageService.deleteFile(filePath)
        } catch (e: Exception) {
            log.warn("Failed to delete receipt file '{}': {}", filePath, e.message)
        }
    }


}
