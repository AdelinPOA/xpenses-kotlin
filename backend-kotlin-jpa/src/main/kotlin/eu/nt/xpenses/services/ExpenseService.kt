package eu.nt.xpenses.services

import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.model.*
import eu.nt.xpenses.models.PagedResponse
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.mapper.ExpenseMapper
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URLConnection
import java.time.Instant
import java.time.LocalDate

@Service
class ExpenseService(
    private val expenseRepository: ExpenseRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val receiptRepository: ReceiptRepository,
    private val fxService: FxService,
    private val storageService: StorageService,
    private val exportService: ExportService,
    private val expenseMapper: ExpenseMapper,
    private val authorization: Authorization
) {
    private val log = LoggerFactory.getLogger(ExpenseService::class.java)

    @Transactional(readOnly = true)
    fun listExpenses(
        currentUser: User,
        reportId: Int?,
        categoryId: Int?,
        status: String?,
        fromDate: String?,
        toDate: String?,
        all: Boolean,
        page: Int?,
        size: Int,
        q: String?
    ): Any {
        val uid = authorization.effectiveUserId(currentUser, all)
        val normalizedQuery = q?.trim()?.takeIf { it.isNotEmpty() }

        return if (page != null) {
            val pageable = org.springframework.data.domain.PageRequest.of(page, size)
            val result = expenseRepository.findAllWithFiltersPaged(uid, status, reportId, categoryId, fromDate, toDate, normalizedQuery, pageable)
            PagedResponse(
                data = result.content.map { expenseMapper.toExpenseOut(it) },
                page = result.number,
                size = result.size,
                totalElements = result.totalElements,
                totalPages = result.totalPages
            )
        } else {
            expenseRepository.findAllWithFilters(uid, status, reportId, categoryId, fromDate, toDate, normalizedQuery)
                .map { expenseMapper.toExpenseOut(it) }
        }
    }

    @Transactional(readOnly = true)
    fun getExpense(expenseId: Int, currentUser: User): ExpenseOut {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canView(currentUser, expense.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your expense")
        }

        return expenseMapper.toExpenseOut(expense)
    }

    @Transactional
    fun createExpense(body: ExpenseCreate, currentUser: User): ExpenseOut {
        val fxRate = resolveFxRate(body.fxRate, body.currency, body.date)
        val saved = doCreateExpense(body, currentUser, fxRate)
        return expenseMapper.toExpenseOut(saved)
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
            if (!authorization.canMutate(currentUser, rep.user?.id)) {
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
    fun updateExpense(expenseId: Int, body: ExpenseUpdate, currentUser: User): ExpenseOut {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canMutate(currentUser, expense.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can be edited")
        }

        if (body.clearCategory && body.categoryId != null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot select and clear category in the same update")
        }

        val hasRateInputs = body.fxRate != null || body.amount != null || body.currency != null || body.date != null || body.taxAmount != null || body.taxRate != null

        if (hasRateInputs) {
            val effAmount = body.amount ?: expense.amountOriginal
            val effCurrency = (body.currency ?: expense.currencyOriginal).uppercase()
            val effDate = body.date ?: expense.date
            val effTaxAmount = body.taxAmount ?: expense.taxAmount
            val effTaxRate = body.taxRate ?: expense.taxRate
            val unchangedBasis = effCurrency == expense.currencyOriginal && effDate == expense.date

            val (fxRate, fxRateManual) = if (body.fxRate != null) {
                body.fxRate to true
            } else if (unchangedBasis) {
                expense.fxRate to expense.fxRateManual
            } else {
                try {
                    fxService.getRate(effCurrency, effDate) to false
                } catch (e: Exception) {
                    throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
                }
            }

            expense.fxRateManual = fxRateManual
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

        if (body.clearCategory) {
            expense.category = null
        } else if (body.categoryId != null) {
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
            if (!authorization.canMutate(currentUser, rep.user?.id)) {
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

        return expenseMapper.toExpenseOut(saved)
    }

    @Transactional
    fun duplicateExpense(expenseId: Int, currentUser: User): ExpenseOut {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canMutate(currentUser, expense.user?.id)) {
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

        val saved = expenseRepository.save(newExpense)
        return expenseMapper.toExpenseOut(saved)
    }

    @Transactional
    fun deleteExpense(expenseId: Int, currentUser: User) {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canMutate(currentUser, expense.user?.id)) {
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

        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() {
                    for (path in paths) {
                        try {
                            storageService.deleteFile(path)
                        } catch (e: Exception) {
                            log.warn("Failed to delete receipt file '{}': {}", path, e.message)
                        }
                    }
                }
            })
        } else {
            for (path in paths) {
                try {
                    storageService.deleteFile(path)
                } catch (e: Exception) {
                    log.warn("Failed to delete receipt file '{}': {}", path, e.message)
                }
            }
        }
    }

    @Transactional(readOnly = true)
    fun requireReceiptUploadAllowed(expenseId: Int, currentUser: User) {
        receiptUploadExpense(expenseId, currentUser)
    }

    private fun receiptUploadExpense(expenseId: Int, currentUser: User): Expense {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canMutate(currentUser, expense.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can have receipts uploaded")
        }
        return expense
    }

    @Transactional
    fun uploadReceipts(expenseId: Int, files: List<MultipartFile>, currentUser: User): List<Map<String, Any>> {
        val expense = receiptUploadExpense(expenseId, currentUser)
        val now = Instant.now()
        val savedReceiptsList = mutableListOf<Map<String, Any>>()
        val stagedPaths = mutableListOf<String>()

        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCompletion(status: Int) {
                    if (status != TransactionSynchronization.STATUS_COMMITTED) {
                        for (path in stagedPaths) {
                            try {
                                storageService.deleteFile(path)
                            } catch (e: Exception) {
                                log.warn("Failed to clean up uncommitted receipt file '{}': {}", path, e.message)
                            }
                        }
                    }
                }
            })
        }

        for (file in files) {
            val originalName = file.originalFilename ?: "receipt"
            val rawUpload = eu.nt.xpenses.models.RawUpload(
                bytes = file.bytes,
                originalFilename = originalName,
                contentType = file.contentType
            )
            val relativePath = try {
                storageService.storeFile(StorageContext.RECEIPT, rawUpload, expenseId)
            } catch (e: IllegalArgumentException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
            }
            stagedPaths.add(relativePath)

            val receipt = Receipt(
                expense = expense,
                filePath = relativePath,
                originalName = originalName,
                createdAt = now
            )
            val savedReceipt = receiptRepository.save(receipt)
            // Keep both sides consistent for an already-initialized collection
            // (notably the bulk response in an open request EntityManager).
            if (expense.receipts.none { it.id == savedReceipt.id }) {
                expense.receipts.add(savedReceipt)
            }
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
        if (!authorization.canMutate(currentUser, expense.user?.id)) {
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

        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() {
                    try {
                        storageService.deleteFile(filePath)
                    } catch (e: Exception) {
                        log.warn("Failed to delete receipt file '{}': {}", filePath, e.message)
                    }
                }
            })
        } else {
            try {
                storageService.deleteFile(filePath)
            } catch (e: Exception) {
                log.warn("Failed to delete receipt file '{}': {}", filePath, e.message)
            }
        }
    }

    @Transactional(readOnly = true)
    fun getReceiptBytes(expenseId: Int, receiptId: Int?, currentUser: User): Pair<ByteArray, String> {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canView(currentUser, expense.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your expense")
        }

        if (receiptId != null) {
            val receipt = receiptRepository.findById(receiptId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found")
            }
            if (receipt.expense.id != expenseId) {
                throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not associated with this expense")
            }
            val bytes = try {
                storageService.downloadFile(receipt.filePath)
            } catch (e: Exception) {
                throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt file not found")
            }
            val contentType = URLConnection.guessContentTypeFromName(receipt.originalName ?: receipt.filePath)
                ?: "application/octet-stream"
            return Pair(bytes, contentType)
        }

        val receipt = expense.receipts.minByOrNull { it.createdAt }
        if (receipt != null) {
            return getReceiptBytes(expenseId, receipt.id!!, currentUser)
        }

        val rPath = expense.receiptPath ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No receipt found")
        val bytes = try {
            storageService.downloadFile(rPath)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt file not found")
        }

        val contentType = URLConnection.guessContentTypeFromName(rPath) ?: "application/octet-stream"
        return Pair(bytes, contentType)
    }

    @Transactional(readOnly = true)
    fun exportExpenses(
        currentUser: User,
        format: String,
        reportId: Int?,
        categoryId: Int?,
        status: String?,
        fromDate: String?,
        toDate: String?,
        all: Boolean,
        q: String?
    ): Triple<ByteArray, String, String> {
        if (format !in listOf("csv", "xlsx")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported format '$format'. Use 'csv' or 'xlsx'.")
        }

        val uid = authorization.effectiveUserId(currentUser, all)
        val expenses = expenseRepository.findAllWithFilters(uid, status, reportId, categoryId, fromDate, toDate, q)

        val includeUser = authorization.canViewAll(currentUser) && all
        val columns = listOfNotNull(
            "id", "date", "merchant", "description", "category",
            "amount_original", "currency", "amount_eur", "fx_rate",
            "tax_amount", "tax_rate", "tax_amount_eur", "status", "report_id",
            if (includeUser) "user" else null
        )

        val rows = expenses.map { e ->
            buildMap {
                put("id", e.id)
                put("date", e.date)
                put("merchant", e.merchant ?: "")
                put("description", e.description ?: "")
                put("category", e.category?.name ?: "")
                put("amount_original", e.amountOriginal)
                put("currency", e.currencyOriginal)
                put("amount_eur", e.amountEur)
                put("fx_rate", e.fxRate)
                put("tax_amount", e.taxAmount)
                put("tax_rate", e.taxRate ?: "")
                put("tax_amount_eur", e.taxAmountEur)
                put("status", e.status)
                put("report_id", e.report?.id ?: "")
                if (includeUser) put("user", e.user?.displayName ?: "")
            }
        }

        val today = LocalDate.now()
        return when (format) {
            "xlsx" -> Triple(
                exportService.buildXlsx(rows, columns),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "expenses_$today.xlsx"
            )
            else -> Triple(exportService.buildCsv(rows, columns), "text/csv", "expenses_$today.csv")
        }
    }
}
