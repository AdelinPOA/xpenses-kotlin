package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty

data class ImportOrderPreviewOut(
    val title: String,
    val description: String,
    @JsonProperty("date_from") val dateFrom: String,
    @JsonProperty("date_to") val dateTo: String,
    val currency: String = "EUR",
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
    @JsonProperty("existing_draft_report_id") val existingDraftReportId: Int? = null,
    @JsonProperty("existing_draft_report_title") val existingDraftReportTitle: String? = null,
)
