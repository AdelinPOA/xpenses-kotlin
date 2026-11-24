package eu.nt.xpenses.expense

import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.expense.ExpenseReviewRequest
import eu.nt.xpenses.dto.expense.ExpenseReviewValues
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.ExpenseReviewOperation
import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.OcrJobStatus
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.ExpenseReviewOperationRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.services.FxService
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

internal class ExpenseReviewVerifier(
    private val expenseRepository: ExpenseRepository,
    private val categoryRepository: CategoryRepository,
    private val ocrJobRepository: OcrJobRepository,
    private val expenseReviewOperationRepository: ExpenseReviewOperationRepository,
    private val fxService: FxService,
    private val jdbcTemplate: JdbcTemplate,
    private val projector: ExpenseProjector,
) {

    fun verify(
        expenseId: Int,
        body: ExpenseReviewRequest,
        currentUser: User,
        requestKey: String,
        requestHash: String,
        onRecomputeReportTotal: (ExpenseReport?, Expense, Instant) -> Unit,
    ): ExpenseOut {
        val currentUserId = currentUser.id
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        val expense = expenseRepository.findByIdForReview(expenseId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        // Verification is an owner attestation; privileged read access does not grant cross-owner verification.
        if (expense.user?.id != currentUserId) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can verify this Expense")
        }
        // Serialize one owner's key across different Expenses before checking the ledger.
        // The integer hash may cause harmless extra contention but never merges keys.
        jdbcTemplate.execute("SELECT pg_advisory_xact_lock($currentUserId, ${requestKey.hashCode()})")

        val priorOperation = expenseReviewOperationRepository.findByUser_IdAndRequestKey(currentUserId, requestKey)
        if (priorOperation != null) {
            if (priorOperation.expense.id != expenseId || priorOperation.requestHash != requestHash) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency-Key was already used with different review data")
            }
            return projector.toExpenseOut(expense)
        }

        if (expense.version != body.expectedVersion) {
            throw ExpenseVersionConflict(projector.toExpenseOut(expense))
        }
        if (expense.verificationState != ExpenseVerificationState.PENDING || expense.lastVerifiedAt != null) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Initial OCR review is no longer pending")
        }
        val sourceJob = ocrJobRepository.findFirstByUser_IdAndExpenseIdOrderByCreatedAtDesc(currentUserId, expenseId)
        if (sourceJob == null || sourceJob.status !in setOf(
                OcrJobStatus.PENDING,
                OcrJobStatus.PROCESSING,
                OcrJobStatus.RETRY_WAIT,
                OcrJobStatus.PAUSED,
                OcrJobStatus.COMPLETED,
            )
        ) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Expense is not linked to an active OCR source")
        }
        if (body.confirm && expense.receipts.isEmpty()) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "A Receipt must be attached before the Expense can be verified")
        }
        if (body.values.clearCategory && body.values.categoryId != null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot select and clear category in the same review")
        }

        val before = reviewableSnapshot(expense)
        val valuesChange = reviewValuesChange(expense, body.values)
        val lockedForEdits = expense.status != "draft" || (expense.report != null && expense.report?.status != "draft")
        if (expense.report != null && expense.report?.status != "draft" && valuesChange) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only expenses on draft reports can be modified")
        }
        if (expense.status != "draft" && valuesChange) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can be edited")
        }
        if (!lockedForEdits && body.values.hasCorrections()) applyReviewValues(expense, body.values)
        val changed = reviewableFieldsChanged(before, reviewableSnapshot(expense))
        val now = Instant.now()

        if (body.confirm) {
            expense.verificationState = ExpenseVerificationState.VERIFIED
            expense.lastVerifiedAt = now
            expense.lastVerifiedBy = currentUser
        }
        if (changed || body.confirm) expense.updatedAt = now

        val saved = expenseRepository.saveAndFlush(expense)
        if (changed) {
            onRecomputeReportTotal(saved.report, saved, now)
        }
        expenseReviewOperationRepository.saveAndFlush(
            ExpenseReviewOperation(
                user = currentUser,
                expense = saved,
                requestKey = requestKey,
                requestHash = requestHash,
                resultingVersion = saved.version,
                createdAt = now
            )
        )
        return projector.toExpenseOut(saved)
    }

    private data class ReviewableSnapshot(
        val amount: BigDecimal,
        val currency: String,
        val date: String,
        val merchant: String?,
        val description: String?,
        val categoryId: Int?,
        val taxAmount: BigDecimal,
        val taxRate: BigDecimal?,
        val fxRate: BigDecimal,
        val fxRateManual: Boolean
    )

    private fun reviewableSnapshot(expense: Expense) = ReviewableSnapshot(
        amount = expense.amountOriginal,
        currency = expense.currencyOriginal,
        date = expense.date,
        merchant = expense.merchant,
        description = expense.description,
        categoryId = expense.category?.id,
        taxAmount = expense.taxAmount,
        taxRate = expense.taxRate,
        fxRate = expense.fxRate,
        fxRateManual = expense.fxRateManual
    )

    private fun decimalChanged(before: BigDecimal?, after: BigDecimal?): Boolean =
        if (before == null || after == null) before != after else before.compareTo(after) != 0

    private fun reviewableFieldsChanged(before: ReviewableSnapshot, after: ReviewableSnapshot): Boolean =
        decimalChanged(before.amount, after.amount) || before.currency != after.currency || before.date != after.date ||
            before.merchant != after.merchant || before.description != after.description || before.categoryId != after.categoryId ||
            decimalChanged(before.taxAmount, after.taxAmount) || decimalChanged(before.taxRate, after.taxRate) ||
            decimalChanged(before.fxRate, after.fxRate) || before.fxRateManual != after.fxRateManual

    private fun reviewValuesChange(expense: Expense, values: ExpenseReviewValues): Boolean =
        (values.amount != null && decimalChanged(expense.amountOriginal, values.amount)) ||
            (values.currency != null && expense.currencyOriginal != values.currency.uppercase()) ||
            (values.date != null && expense.date != values.date) ||
            (values.merchant != null && expense.merchant != values.merchant) ||
            (values.description != null && expense.description != values.description) ||
            (values.categoryId != null && expense.category?.id != values.categoryId) ||
            (values.clearCategory && expense.category != null) ||
            (values.taxAmount != null && decimalChanged(expense.taxAmount, values.taxAmount)) ||
            (values.taxRate != null && decimalChanged(expense.taxRate, values.taxRate)) ||
            (values.fxRate != null && decimalChanged(expense.fxRate, values.fxRate)) ||
            (values.fxRateManual != null && expense.fxRateManual != values.fxRateManual)

    private fun applyReviewValues(expense: Expense, values: ExpenseReviewValues) {
        if (values.clearCategory) {
            expense.category = null
        } else if (values.categoryId != null && values.categoryId != expense.category?.id) {
            val category = categoryRepository.findById(values.categoryId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found")
            }
            if (!category.isActive) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is deactivated")
            }
            expense.category = category
        }

        val effectiveAmount = values.amount ?: expense.amountOriginal
        val effectiveCurrency = (values.currency ?: expense.currencyOriginal).uppercase()
        val effectiveDate = values.date ?: expense.date
        val effectiveTaxAmount = values.taxAmount ?: expense.taxAmount
        val effectiveTaxRate = values.taxRate ?: expense.taxRate
        val unchangedBasis = effectiveCurrency == expense.currencyOriginal && effectiveDate == expense.date
        val hasFxInputs = values.fxRate != null || values.fxRateManual != null || values.amount != null ||
            values.currency != null || values.date != null || values.taxAmount != null || values.taxRate != null

        if (values.fxRate != null && values.fxRateManual == false) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A supplied FX rate must be marked manual")
        }
        if (values.fxRateManual == true && !unchangedBasis && values.fxRate == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A manual FX rate is required when the currency or date changes")
        }

        if (hasFxInputs) {
            val (rate, manual) = when {
                values.fxRate != null -> values.fxRate to true
                values.fxRateManual == true -> expense.fxRate to true
                values.fxRateManual == false || !unchangedBasis -> try {
                    fxService.getRate(effectiveCurrency, effectiveDate) to false
                } catch (exception: Exception) {
                    throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to fetch exchange rate: ${exception.message}")
                }
                else -> expense.fxRate to expense.fxRateManual
            }
            expense.amountOriginal = effectiveAmount
            expense.currencyOriginal = effectiveCurrency
            expense.date = effectiveDate
            expense.fxRate = rate
            expense.fxRateManual = manual
            expense.amountEur = effectiveAmount.multiply(rate).setScale(2, RoundingMode.HALF_UP)
            expense.taxAmount = effectiveTaxAmount
            expense.taxRate = effectiveTaxRate
            expense.taxAmountEur = effectiveTaxAmount.multiply(rate).setScale(2, RoundingMode.HALF_UP)
        }

        if (values.date != null) expense.date = values.date
        if (values.description != null) expense.description = values.description
        if (values.merchant != null) expense.merchant = values.merchant
    }
}
