package eu.nt.xpenses.dto.expense

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal
import java.time.Instant

data class ExpenseOut(
    val id: Int,
    @JsonProperty("user_id") val userId: Int?,
    @JsonProperty("user_display_name") val userDisplayName: String?,
    @JsonProperty("category_id") val categoryId: Int?,
    @JsonProperty("comparison_id") val comparisonId: Int? = null,
    @JsonProperty("category_name") val categoryName: String?,
    @JsonProperty("report_id") val reportId: Int?,
    @JsonProperty("amount_original") val amountOriginal: BigDecimal,
    @JsonProperty("currency_original") val currencyOriginal: String,
    @JsonProperty("amount_eur") val amountEur: BigDecimal,
    @JsonProperty("fx_rate") val fxRate: BigDecimal,
    @JsonProperty("fx_rate_manual") val fxRateManual: Boolean,
    @JsonProperty("tax_amount") val taxAmount: BigDecimal,
    @JsonProperty("tax_rate") val taxRate: BigDecimal?,
    @JsonProperty("tax_amount_eur") val taxAmountEur: BigDecimal,
    val date: String,
    val description: String?,
    val merchant: String?,
    @JsonProperty("receipt_path") val receiptPath: String?,
    val receipts: List<ReceiptOut>,
    val status: String,
    @JsonProperty("raw_ocr_text") val rawOcrText: String?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant
)
