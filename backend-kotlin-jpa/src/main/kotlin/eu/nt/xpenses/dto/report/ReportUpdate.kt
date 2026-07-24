package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.Size

data class ReportUpdate(
    val title: String? = null,
    @field:Size(max = 1000) val description: String? = null,
    @JsonProperty("date_from") val dateFrom: String? = null,
    @JsonProperty("date_to") val dateTo: String? = null,
    val currency: String? = null,
    val kundenauftrag: String? = null,
    val auftragsart: String? = null,
    val positionstyp: String? = null,
    @JsonProperty("technplatz_raw") val technplatzRaw: String? = null,
    @JsonProperty("kunde_code") val kundeCode: String? = null,
    @JsonProperty("kunde_name") val kundeName: String? = null,
    val adresse: String? = null,
    val vorgang: String? = null,
    val arbeitsplatz: String? = null,
    val techniker: String? = null
)
