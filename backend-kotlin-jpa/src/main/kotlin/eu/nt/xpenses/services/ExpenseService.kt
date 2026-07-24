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

        val now = Instant.now()
        val savedReceiptsList = mutableListOf<Map<String, Any>>()
        for (file in files) {
            val originalName = file.originalFilename ?: "receipt"
            val content = file.bytes
            val relativePath = try {
                saveReceiptLocal(expenseId, originalName, content)
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

    private fun saveReceiptLocal(expenseId: Int, filename: String, content: ByteArray): String {
        val allowedExtensions = setOf("jpg", "jpeg", "png", "gif", "pdf", "webp")
        val rawFilename = java.io.File(filename).name
        val ext = rawFilename.substringAfterLast(".", "").lowercase()
        if (ext !in allowedExtensions) {
            throw IllegalArgumentException("File type .$ext not allowed")
        }
        validateMagicBytes(content, ext)
        if (content.size > 10 * 1024 * 1024) {
            throw IllegalArgumentException("File exceeds 10MB limit")
        }

        val now = java.time.LocalDate.now()
        val year = now.year
        val month = String.format("%02d", now.monthValue)
        val subdir = "$year/$month"
        val safeName = "${expenseId}_${rawFilename}".replace(" ", "_")
        val relativePath = "$subdir/$safeName"

        storageService.uploadFile(relativePath, content)
        return relativePath
    }

    private fun validateMagicBytes(content: ByteArray, ext: String) {
        val signatures = mapOf(
            "jpg" to byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()),
            "jpeg" to byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()),
            "png" to byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            "gif" to byteArrayOf(0x47, 0x49, 0x46, 0x38),
            "pdf" to byteArrayOf(0x25, 0x50, 0x44, 0x46),
            "webp" to byteArrayOf(0x52, 0x49, 0x46, 0x46)
        )
        val expected = signatures[ext] ?: return
        if (content.size < expected.size || !content.copyOfRange(0, expected.size).contentEquals(expected)) {
            throw IllegalArgumentException("File content does not match .$ext format")
        }
        if (ext == "webp") {
            val webpSignature = byteArrayOf(0x57, 0x45, 0x42, 0x50)
            if (content.size < 12 || !content.copyOfRange(8, 12).contentEquals(webpSignature)) {
                throw IllegalArgumentException("File content does not match .webp format")
            }
        }
    }
}
