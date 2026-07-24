package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty

data class ReportSubmit(
    @JsonProperty("expense_ids") val expenseIds: List<Int> = emptyList()
)
