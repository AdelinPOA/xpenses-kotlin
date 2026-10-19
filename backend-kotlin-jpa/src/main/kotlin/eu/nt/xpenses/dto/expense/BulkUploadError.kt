package eu.nt.xpenses.dto.expense

import com.fasterxml.jackson.annotation.JsonProperty

data class BulkUploadError(
    val filename: String,
    val reason: String,
    @JsonProperty("expense_id") val expenseId: Int? = null,
    @JsonProperty("file_index") val fileIndex: Int? = null,
)
