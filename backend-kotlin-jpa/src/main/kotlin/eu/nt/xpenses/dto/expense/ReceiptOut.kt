package eu.nt.xpenses.dto.expense

import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Instant

data class ReceiptOut(
    val id: Int,
    @JsonProperty("expense_id") val expenseId: Int,
    @JsonProperty("file_path") val filePath: String,
    @JsonProperty("original_name") val originalName: String?,
    @JsonProperty("created_at") val createdAt: Instant
)
