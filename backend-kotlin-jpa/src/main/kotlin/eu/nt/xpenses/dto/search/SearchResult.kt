package eu.nt.xpenses.dto.search

import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.dto.report.ReportOut
import com.fasterxml.jackson.annotation.JsonProperty

data class SearchResult(
    val reports: List<ReportOut>,
    val expenses: List<ExpenseOut>,
    @JsonProperty("report_count") val reportCount: Int,
    @JsonProperty("expense_count") val expenseCount: Int
)
