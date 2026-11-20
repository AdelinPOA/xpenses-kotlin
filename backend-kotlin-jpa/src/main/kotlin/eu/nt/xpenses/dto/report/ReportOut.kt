package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.dto.expense.ExpenseOut
import java.math.BigDecimal
import java.time.Instant

data class ReportOut(
    val id: Int,
    @JsonProperty("user_id") val userId: Int?,
    @JsonProperty("user_display_name") val userDisplayName: String?,
    val title: String,
    val description: String?,
    @JsonProperty("date_from") val dateFrom: String?,
    @JsonProperty("date_to") val dateTo: String?,
    val status: String,
    @JsonProperty("submitted_at") val submittedAt: Instant?,
    @JsonProperty("paid_at") val paidAt: Instant?,
    @JsonProperty("approved_by") val approvedBy: Int?,
    @JsonProperty("approved_at") val approvedAt: Instant?,
    @JsonProperty("rejected_by") val rejectedBy: Int?,
    @JsonProperty("rejected_at") val rejectedAt: Instant?,
    @JsonProperty("rejected_reason") val rejectedReason: String?,
    @JsonProperty("signer_id") val signerId: Int?,
    @JsonProperty("signed_at") val signedAt: Instant?,
    @JsonProperty("total_amount") val totalAmount: BigDecimal,
    val currency: String,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant,
    val expenses: List<ExpenseOut> = emptyList(),
    val advances: List<AdvancePaymentOut> = emptyList(),
    @JsonProperty("total_advances") val totalAdvances: BigDecimal = BigDecimal.ZERO,
    @JsonProperty("mileage_records") val mileageRecords: List<MileageRecordOut> = emptyList(),
    @JsonProperty("total_mileage_eur") val totalMileageEur: BigDecimal = BigDecimal.ZERO,
    @JsonProperty("daily_allowance") val dailyAllowance: BigDecimal = BigDecimal.ZERO,
    @JsonProperty("total_reimbursable") val totalReimbursable: BigDecimal = BigDecimal.ZERO,
    val kundenauftrag: String? = null,
    val auftragsart: String? = null,
    val positionstyp: String? = null,
    @JsonProperty("technplatz_raw") val technplatzRaw: String? = null,
    @JsonProperty("technplatz_line") val technplatzLine: Boolean = false,
    @JsonProperty("kunde_code") val kundeCode: String? = null,
    @JsonProperty("kunde_name") val kundeName: String? = null,
    val adresse: String? = null,
    val vorgang: String? = null,
    val arbeitsplatz: String? = null,
    val techniker: String? = null,
    @JsonProperty("starting_odometer_km") val startingOdometerKm: BigDecimal? = null
)
