package eu.nt.xpenses.expense

import eu.nt.xpenses.dto.expense.BulkUploadError
import eu.nt.xpenses.dto.expense.BulkUploadResult
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ExpenseReviewRequest
import eu.nt.xpenses.dto.expense.ExpenseUpdate
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.PagedResponse
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.ExpenseReviewOperationRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.ExportService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.SaveIdempotencyService
import eu.nt.xpenses.services.StorageService
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import tools.jackson.core.type.TypeReference
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate

data class BulkSourceFile(
    val index: Int,
    val file: MultipartFile,
    val filename: String,
    val bytes: ByteArray,
)

data class BulkBatchPlan(
    val validKey: String?,
    val sourcesManifest: List<Map<String, Any>>?,
    val filesNeedingOcr: List<BulkSourceFile>,
)

data class BulkExpenseInput(
    val source: BulkSourceFile,
    val ocrResult: Map<String, Any?>,
)

@Service
class Expenses @Autowired constructor(
    private val expenseRepository: ExpenseRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val ocrComparisonRepository: OcrComparisonRepository,
    private val receiptRepository: ReceiptRepository,
    private val fxService: FxService,
    storageService: StorageService,
    exportService: ExportService,
    private val projector: ExpenseProjector,
    private val authorization: Authorization,
    expenseReviewOperationRepository: ExpenseReviewOperationRepository,
    ocrJobRepository: OcrJobRepository,
    jdbcTemplate: JdbcTemplate,
    private val identities: SaveIdempotencyService,
    private val transactionManager: PlatformTransactionManager? = null,
) {
    private val log = LoggerFactory.getLogger(Expenses::class.java)
    private val expenseType = object : TypeReference<ExpenseOut>() {}
    private val receiptsType = object : TypeReference<List<Map<String, Any>>>() {}
    private val markerType = object : TypeReference<Map<String, Boolean>>() {}
    private val currencyRegex = Regex("^[A-Z]{3}$")
    private val dateRegex = Regex("^\\d{4}-\\d{2}-\\d{2}$")

    private val receipts = ExpenseReceipts(
        expenseRepository = expenseRepository,
        receiptRepository = receiptRepository,
        storageService = storageService,
        authorization = authorization,
    )

    private val reviewVerifier = ExpenseReviewVerifier(
        expenseRepository = expenseRepository,
        categoryRepository = categoryRepository,
        ocrJobRepository = ocrJobRepository,
        expenseReviewOperationRepository = expenseReviewOperationRepository,
        fxService = fxService,
        jdbcTemplate = jdbcTemplate,
        projector = projector,
    )

    private val exporter = ExpenseExporter(
        expenseRepository = expenseRepository,
        authorization = authorization,
        exportService = exportService,
    )

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
        q: String?,
        verificationState: ExpenseVerificationState? = null,
    ): Any {
        val uid = authorization.effectiveUserId(currentUser, all)
        val normalizedQuery = q?.trim()?.takeIf { it.isNotEmpty() }

        return if (page != null) {
            val clampedPage = page.coerceAtLeast(0)
            val clampedSize = size.coerceIn(1, 100)
            val pageable = PageRequest.of(clampedPage, clampedSize)
            val result = expenseRepository.findAllWithFiltersPaged(
                uid, status, reportId, categoryId, fromDate, toDate, normalizedQuery, verificationState, pageable
            )
            PagedResponse(
                data = result.content.map { projector.toExpenseOut(it) },
                page = result.number,
                size = result.size,
                totalElements = result.totalElements,
                totalPages = result.totalPages
            )
        } else {
            expenseRepository.findAllWithFilters(
                uid, status, reportId, categoryId, fromDate, toDate, normalizedQuery, verificationState
            ).map { projector.toExpenseOut(it) }
        }
    }

    @Transactional(readOnly = true)
    fun getExpense(expenseId: Int, currentUser: User): ExpenseOut {
        return if (transactionManager != null) {
            TransactionTemplate(transactionManager).apply { isReadOnly = true }.execute {
                loadExpenseOut(expenseId, currentUser)
            }
        } else {
            loadExpenseOut(expenseId, currentUser)
        }
    }

    private fun loadExpenseOut(expenseId: Int, currentUser: User): ExpenseOut {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canView(currentUser, expense.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your expense")
        }

        return projector.toExpenseOut(expense)
    }

    fun createExpense(
        body: ExpenseCreate,
        currentUser: User,
        idempotencyKey: String? = null,
    ): ExpenseOut {
        val validKey = identities.validateKey(idempotencyKey)
        if (validKey == null) {
            return createExpenseUnkeyed(body, currentUser)
        }
        val userId = currentUser.id
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        return identities.execute(userId, "expense-create", validKey, identities.hash(body), expenseType) {
            createExpenseUnkeyed(body, currentUser)
        }
    }

    private fun createExpenseUnkeyed(body: ExpenseCreate, currentUser: User): ExpenseOut {
        val fxRate = resolveFxRate(body.fxRate, body.currency, body.date)
        val saved = if (transactionManager != null) {
            TransactionTemplate(transactionManager).execute {
                doCreateExpense(body, currentUser, fxRate)
            }
        } else {
            doCreateExpense(body, currentUser, fxRate)
        }
        return projector.toExpenseOut(saved)
    }

    private fun resolveFxRate(manualRate: BigDecimal?, currency: String, date: String): BigDecimal {
        if (manualRate != null) return manualRate
        return try {
            fxService.getRate(currency.uppercase(), date)
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
            if (comp != null && (comp.expense == null || comp.expense?.id == savedExpense.id)) {
                comp.expense = savedExpense
                ocrComparisonRepository.save(comp)
            }
        }

        recomputeReportTotal(report, includedExpense = savedExpense, now = savedExpense.updatedAt)

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
        if (expense.report != null && expense.report?.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only expenses on draft reports can be modified")
        }
        if (body.clearCategory && body.categoryId != null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot select and clear category in the same update")
        }

        val hasRateInputs = body.fxRate != null || body.fxRateManual != null || body.amount != null ||
            body.currency != null || body.date != null || body.taxAmount != null || body.taxRate != null

        if (hasRateInputs) {
            val effAmount = body.amount ?: expense.amountOriginal
            val effCurrency = (body.currency ?: expense.currencyOriginal).uppercase()
            val effDate = body.date ?: expense.date
            val effTaxAmount = body.taxAmount ?: expense.taxAmount
            val effTaxRate = body.taxRate ?: expense.taxRate
            val unchangedBasis = effCurrency == expense.currencyOriginal && effDate == expense.date

            val (fxRate, fxRateManual) = when {
                body.fxRate != null -> body.fxRate to (body.fxRateManual ?: true)
                body.fxRateManual == false -> try {
                    fxService.getRate(effCurrency, effDate) to false
                } catch (e: Exception) {
                    throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${e.message}")
                }
                body.fxRateManual == true -> expense.fxRate to true
                unchangedBasis -> expense.fxRate to expense.fxRateManual
                else -> try {
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
            if (expense.report != null && expense.report?.id != body.reportId) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Expense is already attached to another report")
            }
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

        recomputeReportTotal(saved.report, includedExpense = saved, now = saved.updatedAt)

        if (body.comparisonId != null) {
            val comp = ocrComparisonRepository.findById(body.comparisonId).orElse(null)
            if (comp != null && (comp.expense == null || comp.expense?.id == saved.id)) {
                comp.expense = saved
                ocrComparisonRepository.save(comp)
            }
        }

        return projector.toExpenseOut(saved)
    }

    @Transactional
    fun verifyExpense(
        expenseId: Int,
        body: ExpenseReviewRequest,
        currentUser: User,
        idempotencyKey: String?,
    ): ExpenseOut {
        val requestKey = identities.validateKey(idempotencyKey)
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key is required")
        return reviewVerifier.verify(
            expenseId = expenseId,
            body = body,
            currentUser = currentUser,
            requestKey = requestKey,
            requestHash = identities.hash(body),
            onRecomputeReportTotal = { report, saved, now ->
                recomputeReportTotal(report, includedExpense = saved, now = now)
            },
        )
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
        return projector.toExpenseOut(saved)
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
        if (expense.report != null && expense.report?.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only expenses on draft reports can be modified")
        }

        val attachedReport = expense.report
        val deletedExpenseId = expense.id
        if (attachedReport != null && org.hibernate.Hibernate.isInitialized(attachedReport.expenses)) {
            attachedReport.expenses.removeIf { it.id == deletedExpenseId }
        }
        expense.report = null

        val receiptsList = expense.receipts.toList()
        for (receipt in receiptsList) {
            receiptRepository.delete(receipt)
        }
        val paths = receiptsList.map { it.filePath }
        expenseRepository.delete(expense)
        recomputeReportTotal(attachedReport, excludeExpenseId = deletedExpenseId)
        receipts.deletePathsAfterCommit(paths)
    }

    fun uploadReceipts(
        expenseId: Int,
        files: List<MultipartFile>,
        currentUser: User,
        idempotencyKey: String? = null,
    ): List<Map<String, Any>> {
        val validKey = identities.validateKey(idempotencyKey)
        if (validKey == null) {
            return if (transactionManager != null) {
                TransactionTemplate(transactionManager).execute {
                    receipts.upload(expenseId, files, currentUser)
                }
            } else {
                receipts.upload(expenseId, files, currentUser)
            }
        }

        val userId = currentUser.id
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        // Reauthorize the resource on every replay. A cached Receipt response is
        // not permission to access someone else's Expense after ownership changes.
        if (transactionManager != null) {
            TransactionTemplate(transactionManager).apply { isReadOnly = true }.execute {
                receipts.requireUploadAllowed(expenseId, currentUser)
            }
        } else {
            receipts.requireUploadAllowed(expenseId, currentUser)
        }

        val manifest = buildManifest(files)
        bindManifest(userId, "receipt-manifest:$expenseId", validKey, manifest)
        return files.flatMapIndexed { index, file ->
            identities.execute(
                userId,
                "receipt-file:$expenseId:$index",
                validKey,
                identities.hash(manifest[index]),
                receiptsType,
            ) {
                receipts.upload(expenseId, listOf(file), currentUser)
            }
        }
    }

    @Transactional
    fun deleteSingleReceipt(expenseId: Int, receiptId: Int, currentUser: User) {
        receipts.deleteSingle(expenseId, receiptId, currentUser)
    }

    @Transactional(readOnly = true)
    fun getReceiptBytes(expenseId: Int, receiptId: Int?, currentUser: User): Pair<ByteArray, String> {
        val (bytes, contentType, _) = getReceiptDownload(expenseId, receiptId, currentUser)
        return Pair(bytes, contentType)
    }

    @Transactional(readOnly = true)
    fun getReceiptDownload(expenseId: Int, receiptId: Int?, currentUser: User): Triple<ByteArray, String, String> {
        return receipts.getDownload(expenseId, receiptId, currentUser)
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
        q: String?,
        verificationState: ExpenseVerificationState? = null,
    ): Triple<ByteArray, String, String> {
        return exporter.export(currentUser, format, reportId, categoryId, status, fromDate, toDate, all, q, verificationState)
    }

    fun prepareBulkBatch(
        allFiles: List<MultipartFile>,
        validFiles: List<BulkSourceFile>,
        currentUser: User,
        idempotencyKey: String?,
    ): BulkBatchPlan {
        val validKey = identities.validateKey(idempotencyKey)
        // Reserve room for the public known-ID retry suffix :receipt:<index>.
        if (validKey != null && validKey.length > 200) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Bulk Idempotency-Key must not exceed 200 characters")
        }

        val sources = if (validKey != null) buildManifest(allFiles) else null
        if (validKey != null && sources != null) {
            val userId = currentUser.id
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
            bindManifest(userId, "bulk-manifest", validKey, sources)
        }

        val filesNeedingOcr =
            if (validKey != null && sources != null) {
                val userId = currentUser.id!!
                validFiles.filter { item ->
                    identities.lookup(
                        userId,
                        "bulk-expense:${item.index}",
                        validKey,
                        identities.hash(sources[item.index]),
                        expenseType,
                    ) == null
                }
            } else {
                validFiles
            }

        return BulkBatchPlan(
            validKey = validKey,
            sourcesManifest = sources,
            filesNeedingOcr = filesNeedingOcr,
        )
    }

    fun bulkCreate(
        items: List<BulkExpenseInput>,
        preErrors: List<BulkUploadError>,
        plan: BulkBatchPlan,
        currentUser: User,
    ): BulkUploadResult {
        val created = mutableListOf<ExpenseOut>()
        val errors = preErrors.toMutableList()
        val today = LocalDate.now().toString()
        val key = plan.validKey
        val sources = plan.sourcesManifest

        for (item in items) {
            val index = item.source.index
            val file = item.source.file
            val filename = item.source.filename
            val ocrResult = item.ocrResult

            val expenseOut =
                try {
                    val sourceMeta = sources?.get(index) ?: buildManifest(listOf(file)).single()
                    createBulkItemExpense(index, sourceMeta, currentUser, key) {
                        val amount = nonNegativeDecimal(ocrResult["amount"])
                        val currency =
                            (ocrResult["currency"] as? String)
                                ?.takeIf { it.matches(currencyRegex) } ?: "EUR"
                        val extractedDate =
                            (ocrResult["date"] as? String)
                                ?.takeIf { it.matches(dateRegex) } ?: today
                        val fallbackDescription =
                            when {
                                ocrResult.isEmpty() -> "OCR failed — please fill manually"
                                amount == BigDecimal.ZERO && ocrResult["provider_error"] != null ->
                                    "OCR partial/failed — please review"
                                else -> null
                            }
                        ExpenseCreate(
                            categoryId = ocrResult["category_id"] as? Int,
                            reportId = null,
                            amount = amount,
                            currency = currency,
                            taxAmount = nonNegativeDecimal(ocrResult["tax_amount"]),
                            date = extractedDate,
                            description = (ocrResult["description"] as? String) ?: fallbackDescription,
                            merchant = ocrResult["merchant"] as? String,
                            rawOcrText = ocrResult["raw_text"] as? String,
                        )
                    }
                } catch (e: ResponseStatusException) {
                    if (e.statusCode == HttpStatus.CONFLICT) throw e
                    log.error("Failed to create expense for $filename: ${e.message}")
                    errors.add(BulkUploadError(filename, "Could not create expense: ${e.reason}", fileIndex = index))
                    continue
                } catch (e: Exception) {
                    log.error("Failed to create expense for $filename: ${e.message}")
                    errors.add(BulkUploadError(filename, "Could not create expense: ${e.message}", fileIndex = index))
                    continue
                }

            val comparisonId = (ocrResult["comparison_id"] as? Number)?.toInt()
            if (comparisonId != null) {
                runCatching { ocrComparisonRepository.linkExpense(comparisonId, expenseOut.id) }
                    .onFailure { log.warn("Failed to link OCR comparison {} to expense {}: {}", comparisonId, expenseOut.id, it.message) }
            }

            try {
                // Same key used by the known-ID frontend attachment retry.
                uploadReceipts(expenseOut.id, listOf(file), currentUser, key?.let { "$it:receipt:$index" })
            } catch (e: ResponseStatusException) {
                if (e.statusCode == HttpStatus.CONFLICT) throw e
                log.warn("Receipt storage failed for expense ${expenseOut.id}: ${e.reason ?: e.message}")
                errors.add(BulkUploadError(filename, e.reason ?: e.message, expenseOut.id, index))
                // A retained creation identity may point at an intentionally deleted
                // Expense. Report that file, never recreate it or block later sources.
                if (e.statusCode == HttpStatus.NOT_FOUND || e.statusCode == HttpStatus.GONE) continue
            } catch (e: Exception) {
                log.warn("Receipt storage failed for expense ${expenseOut.id}: ${e.message}")
                errors.add(BulkUploadError(filename, e.message ?: "Could not upload receipt", expenseOut.id, index))
            }

            // Reload instead of returning the pre-upload DTO with no Receipt metadata.
            // Deletion can also race the upload/reload boundary.
            try {
                created.add(getExpense(expenseOut.id, currentUser))
            } catch (e: ResponseStatusException) {
                if (e.statusCode != HttpStatus.NOT_FOUND && e.statusCode != HttpStatus.GONE) throw e
                if (errors.none { it.fileIndex == index }) {
                    errors.add(BulkUploadError(filename, e.reason ?: e.message, expenseOut.id, index))
                }
            }
        }

        return BulkUploadResult(created, errors)
    }

    private fun createBulkItemExpense(
        fileIndex: Int,
        source: Map<String, Any>,
        user: User,
        key: String?,
        createBody: () -> ExpenseCreate,
    ): ExpenseOut {
        if (key == null) return createExpenseUnkeyed(createBody(), user)
        val userId = user.id
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val operation = "bulk-expense:$fileIndex"
        val hash = identities.hash(source)
        identities.lookup(userId, operation, key, hash, expenseType)?.let { return it }
        // Slow OCR happens with no row/transaction lock. Concurrent OCR can run
        // twice, but only one caller may create an Expense and commit its identity.
        val body = createBody()
        return identities.execute(userId, operation, key, hash, expenseType) {
            createExpenseUnkeyed(body, user)
        }
    }

    private fun buildManifest(files: List<MultipartFile>): List<Map<String, Any>> =
        files.map { file ->
            mapOf(
                "name" to (file.originalFilename ?: "receipt"),
                "size" to file.size,
                "content_type" to (file.contentType ?: ""),
                // Rejected oversized sources are never read into heap or promoted.
                "sha256" to if (file.size > 10L * 1024 * 1024) "oversize" else identities.digest(file.bytes),
            )
        }

    private fun bindManifest(
        userId: Int,
        operation: String,
        key: String,
        manifest: List<Map<String, Any>>,
    ) {
        identities.execute(userId, operation, key, identities.hash(manifest), markerType) { mapOf("accepted" to true) }
    }

    private fun nonNegativeDecimal(raw: Any?): BigDecimal =
        when (raw) {
            is BigDecimal -> raw.max(BigDecimal.ZERO)
            is Number -> raw.toDouble().takeIf { it.isFinite() }?.let(BigDecimal::valueOf)?.max(BigDecimal.ZERO) ?: BigDecimal.ZERO
            else -> BigDecimal.ZERO
        }

    private fun recomputeReportTotal(
        report: ExpenseReport?,
        includedExpense: Expense? = null,
        excludeExpenseId: Int? = null,
        now: Instant = Instant.now(),
    ) {
        val target = report ?: return
        val reportId = target.id ?: return
        val attached = expenseRepository.findAllByReportId(reportId)
        val byId = LinkedHashMap<Int, Expense>()
        for (e in attached) {
            val id = e.id
            if (id != null && id != excludeExpenseId) byId[id] = e
        }
        if (includedExpense != null) {
            val id = includedExpense.id
            if (id != null && id != excludeExpenseId) byId[id] = includedExpense
        }
        target.totalAmount = byId.values.fold(BigDecimal.ZERO) { acc, e -> acc.add(e.amountEur) }
        target.updatedAt = now
        expenseReportRepository.save(target)
    }
}
