package eu.nt.xpenses.dto.ocr

import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Instant

data class OcrJobRecoveryOut(
    @JsonProperty("job_id") val jobId: Int,
    val status: String,
    val stage: String,
    @JsonProperty("error_code") val errorCode: String?,
    @JsonProperty("error_message") val errorMessage: String?,
    val retryable: Boolean,
    @JsonProperty("allowed_actions") val allowedActions: List<String>,
    @JsonProperty("expires_at") val expiresAt: Instant?,
    @JsonProperty("expense_id") val expenseId: Int?,
    @JsonProperty("receipt_id") val receiptId: Int?,
    @JsonProperty("report_id") val reportId: Int?,
    @JsonProperty("report_link_status") val reportLinkStatus: String
)
