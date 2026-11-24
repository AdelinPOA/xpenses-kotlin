package eu.nt.xpenses.expense

import eu.nt.xpenses.model.ExpenseVerificationState
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.ExportService
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.LocalDate

internal class ExpenseExporter(
    private val expenseRepository: ExpenseRepository,
    private val authorization: Authorization,
    private val exportService: ExportService,
) {

    fun export(
        currentUser: User,
        format: String,
        reportId: Int?,
        categoryId: Int?,
        status: String?,
        fromDate: String?,
        toDate: String?,
        all: Boolean,
        q: String?,
        verificationState: ExpenseVerificationState? = null
    ): Triple<ByteArray, String, String> {
        if (format !in listOf("csv", "xlsx")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported format '$format'. Use 'csv' or 'xlsx'.")
        }

        val uid = authorization.effectiveUserId(currentUser, all)
        val normalizedQuery = q?.trim()?.takeIf { it.isNotEmpty() }
        val expenses = expenseRepository.findAllWithFilters(uid, status, reportId, categoryId, fromDate, toDate, normalizedQuery, verificationState)

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
